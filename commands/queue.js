const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue'),

    async execute(interaction) {
        await interaction.deferReply();
        try {
            const guildId = interaction.guild.id;
            const queuePath = path.join(__dirname, '../data/queues.json');
            let queues = {};
            if (fs.existsSync(queuePath)) {
                try {
                    const fileContent = fs.readFileSync(queuePath, 'utf8');
                    queues = JSON.parse(fileContent);
                } catch (error) {
                    console.error('Queue JSON parse error:', error);
                    try {
                        fs.writeFileSync(queuePath, JSON.stringify({}));
                        console.log('Reset corrupted queue file');
                    } catch (writeError) {
                        console.error('Failed to reset queue file:', writeError);
                    }
                    return interaction.editReply({
                        content: '❌ Queue file was corrupted but has been reset. Please try adding songs again.',
                        ephemeral: true
                    });
                }
            }
            const queue = queues[guildId];
            if (!queue || queue.length === 0) {
                const emptyEmbed = new EmbedBuilder()
                    .setColor('#ff6b6b')
                    .setTitle('📋 Music Queue')
                    .setDescription('The queue is currently empty. Use `/play` to add songs!')
                    .setTimestamp();
                return interaction.editReply({ embeds: [emptyEmbed] });
            }

            // Pagination logic
            const pageSize = 10;
            let page = 0;
            const totalPages = Math.ceil(queue.length / pageSize);

            // Helper to format queue page
            function formatQueuePage(pageIdx) {
                const start = pageIdx * pageSize;
                const end = start + pageSize;
                return queue.slice(start, end).map((song, idx) => {
                    const status = (start + idx === 0 && isPlaying) ? '🎵 ' : `${start + idx + 1}. `;
                    return `${status}**${song.title}** - ${song.author} (requested by ${song.requestedBy})`;
                }).join('\n');
            }

            // Calculate total duration if available
            let totalDuration = 'Unknown';
            if (queue.some(song => song.duration)) {
                const totalSeconds = queue.reduce((acc, song) => {
                    if (song.duration) {
                        if (typeof song.duration === 'number') {
                            return acc + song.duration;
                        }
                        if (typeof song.duration === 'string') {
                            const parts = song.duration.split(':').map(Number);
                            if (parts.length === 2) {
                                return acc + (parts[0] * 60) + parts[1];
                            } else if (parts.length === 3) {
                                return acc + (parts[0] * 3600) + (parts[1] * 60) + parts[2];
                            }
                        }
                    }
                    return acc;
                }, 0);
                if (totalSeconds > 0) {
                    const hours = Math.floor(totalSeconds / 3600);
                    const minutes = Math.floor((totalSeconds % 3600) / 60);
                    totalDuration = hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`
                        : `${minutes}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
                }
            }

            // Check if bot is currently playing
            const connection = interaction.client.voice?.connections?.get(guildId);
            const isPlaying = connection && connection.state.subscription?.player?.state.status === 'playing';

            // Build embed for a page
            function buildEmbed(pageIdx) {
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📋 Music Queue')
                    .setDescription(formatQueuePage(pageIdx))
                    .addFields(
                        { name: '📊 Queue Stats', value:
                            `**Songs:** ${queue.length}\n` +
                            `**Status:** ${isPlaying ? '▶️ Playing' : '⏸️ Stopped'}\n` +
                            `**Total Duration:** ${totalDuration}`, inline: true }
                    )
                    .setFooter({
                        text: totalPages > 1 ? `Page ${pageIdx + 1} of ${totalPages}` : `${queue.length} songs in queue`
                    })
                    .setTimestamp();
                if (queue[pageIdx * pageSize] && queue[pageIdx * pageSize].thumbnail) {
                    embed.setThumbnail(queue[pageIdx * pageSize].thumbnail);
                }
                return embed;
            }

            // Build action row with buttons
            function buildActionRow(pageIdx) {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('queue_prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageIdx === 0),
                    new ButtonBuilder()
                        .setCustomId('queue_next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageIdx === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId('queue_clear')
                        .setLabel('Clear Queue')
                        .setStyle(ButtonStyle.Danger)
                );
            }

            // Send initial embed with buttons
            let message = await interaction.editReply({
                embeds: [buildEmbed(page)],
                components: [buildActionRow(page)]
            });

            // Set up collector for button interactions
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 120000 // 2 minutes
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'Only the command user can interact with these buttons.', ephemeral: true });
                }
                if (i.customId === 'queue_prev') {
                    if (page > 0) page--;
                    await i.update({ embeds: [buildEmbed(page)], components: [buildActionRow(page)] });
                } else if (i.customId === 'queue_next') {
                    if (page < totalPages - 1) page++;
                    await i.update({ embeds: [buildEmbed(page)], components: [buildActionRow(page)] });
                } else if (i.customId === 'queue_clear') {
                    // Clear the queue for this guild
                    queues[guildId] = [];
                    try {
                        fs.writeFileSync(queuePath, JSON.stringify(queues, null, 2));
                    } catch (err) {
                        console.error('Failed to clear queue:', err);
                    }
                    collector.stop('cleared');
                    const clearedEmbed = new EmbedBuilder()
                        .setColor('#ff6b6b')
                        .setTitle('📋 Music Queue')
                        .setDescription('The queue has been cleared. Use `/play` to add songs!')
                        .setTimestamp();
                    return i.update({ embeds: [clearedEmbed], components: [] });
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason !== 'cleared') {
                    try {
                        await interaction.editReply({ components: [] });
                    } catch (e) {}
                }
            });
        } catch (error) {
            console.error('Queue command error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while fetching the queue.')
                .setTimestamp();
            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        }
    },
};
