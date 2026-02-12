const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue'),

    async execute(interaction) {
        await interaction.deferReply();
        try {
            const guildId = interaction.guild.id;
            const lang = await i18n.getLanguage(guildId, interaction.user.id);
            const queue = musicPlayer.getQueue(guildId);

            if (!queue || queue.songs.length === 0) {
                const emptyEmbed = new EmbedBuilder()
                    .setColor('#ff6b6b')
                    .setTitle(i18n.translate(lang, 'music.queue_title'))
                    .setDescription(i18n.translate(lang, 'music.queue_empty'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [emptyEmbed] });
            }

            const songs = queue.songs;
            const isPlaying = !queue.paused;

            // Pagination logic
            const pageSize = 10;
            let page = 0;
            const totalPages = Math.ceil(songs.length / pageSize);

            // Helper to format queue page
            function formatQueuePage(pageIdx) {
                const start = pageIdx * pageSize;
                const end = start + pageSize;
                return songs.slice(start, end).map((song, idx) => {
                    const position = start + idx + 1;
                    const status = (start + idx === 0 && isPlaying) ? '\uD83C\uDFB5 ' : `${position}. `;
                    const priorityIcon = song.metadata?.autoSuggestion ? '\uD83E\uDD16 ' : '\uD83D\uDC64 ';
                    const name = song.name || song.title || 'Unknown';
                    const artist = song.uploader?.name || song.author || 'Unknown';
                    const requester = song.user?.tag || song.metadata?.requestedBy || 'Unknown';
                    return `${status}${priorityIcon}**${name}** - ${artist} (requested by ${requester})`;
                }).join('\n');
            }

            // Calculate total duration
            let totalDuration = 'Unknown';
            const totalSeconds = songs.reduce((acc, song) => acc + (song.duration || 0), 0);
            if (totalSeconds > 0) {
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const secs = Math.floor(totalSeconds % 60);
                totalDuration = hours > 0
                    ? `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
                    : `${minutes}:${secs.toString().padStart(2, '0')}`;
            }

            // Build embed for a page
            function buildEmbed(pageIdx) {
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(i18n.translate(lang, 'music.queue_title'))
                    .setDescription(formatQueuePage(pageIdx))
                    .addFields(
                        { name: '\uD83D\uDCCA Queue Stats', value:
                            `**Songs:** ${songs.length}\n` +
                            `**Status:** ${isPlaying ? '\u25B6\uFE0F Playing' : '\u23F8\uFE0F Paused'}\n` +
                            `**Total Duration:** ${totalDuration}`, inline: true },
                        { name: '\uD83C\uDFAF Priority System', value:
                            '\uD83D\uDC64 Manual requests\n' +
                            '\uD83E\uDD16 Auto-suggestions', inline: true }
                    )
                    .setFooter({
                        text: totalPages > 1
                            ? `Page ${pageIdx + 1} of ${totalPages} \u2022 Manual requests play first`
                            : `${songs.length} songs \u2022 Manual requests have priority`
                    })
                    .setTimestamp();

                const pageSong = songs[pageIdx * pageSize];
                if (pageSong && pageSong.thumbnail) {
                    embed.setThumbnail(pageSong.thumbnail);
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
                    // Stop the queue via DisTube (clears the queue and stops playback)
                    try {
                        const currentQueue = musicPlayer.getQueue(guildId);
                        if (currentQueue) {
                            currentQueue.stop();
                        }
                    } catch (err) {
                        logger.error('MUSIC', `Failed to clear queue: ${err.message}`);
                    }
                    collector.stop('cleared');
                    const clearedEmbed = new EmbedBuilder()
                        .setColor('#ff6b6b')
                        .setTitle(i18n.translate(lang, 'music.queue_title'))
                        .setDescription(i18n.translate(lang, 'music.queue_empty'))
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
            logger.error('MUSIC', `Queue command error: ${error.message}`);
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('\u274C Error')
                .setDescription('An error occurred while fetching the queue.')
                .setTimestamp();
            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        }
    },
};
