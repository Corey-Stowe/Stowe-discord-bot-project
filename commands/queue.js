const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
            
            // Load queue from file
            const queuePath = path.join(__dirname, '../data/queues.json');
            let queues = {};
            
            if (fs.existsSync(queuePath)) {
                queues = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
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

            // Check if bot is currently playing
            const connection = interaction.client.voice?.connections?.get(guildId);
            const isPlaying = connection && 
                              connection.state.subscription?.player?.state.status === 'playing';

            // Format queue list
            const queueList = queue.slice(0, 10).map((song, index) => {
                const status = index === 0 && isPlaying ? '🎵 ' : `${index + 1}. `;
                return `${status}**${song.title}** - ${song.author} (requested by ${song.requestedBy})`;
            }).join('\n');

            // Calculate total duration if available
            let totalDuration = 'Unknown';
            if (queue.some(song => song.duration)) {
                const totalSeconds = queue.reduce((acc, song) => {
                    if (song.duration) {
                        const parts = song.duration.split(':');
                        if (parts.length === 2) {
                            return acc + (parseInt(parts[0]) * 60) + parseInt(parts[1]);
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

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📋 Music Queue')
                .setDescription(queueList)
                .addFields(
                    { name: '📊 Queue Stats', value: 
                        `**Songs:** ${queue.length}\n` +
                        `**Status:** ${isPlaying ? '▶️ Playing' : '⏸️ Stopped'}\n` +
                        `**Total Duration:** ${totalDuration}`, inline: true }
                )
                .setFooter({ 
                    text: queue.length > 10 ? `Showing first 10 of ${queue.length} songs` : `${queue.length} songs in queue`
                })
                .setTimestamp();

            // Add current song thumbnail if available
            if (queue[0] && queue[0].thumbnail) {
                embed.setThumbnail(queue[0].thumbnail);
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Queue command error:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while fetching the queue.')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};
