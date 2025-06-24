const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const Database = require('../utils/database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show currently playing song with controls'),
    
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const playerData = musicPlayer.getPlayer(guildId);
        
        if (!playerData || !playerData.currentSong) {
            return interaction.reply({ 
                content: '❌ No music is currently playing!', 
                ephemeral: true 
            });
        }

        const song = playerData.currentSong;
        const db = new Database();
        const queue = await db.getQueue(guildId);
        const loopMode = await db.getLoopMode(guildId);

        const embed = new EmbedBuilder()
            .setColor('#ff6b6b')
            .setTitle('🎵 Now Playing')
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: '👤 Artist', value: song.author || 'Unknown', inline: true },
                { name: '🎧 Quality', value: song.quality || 'Unknown', inline: true },
                { name: '👤 Requested by', value: song.requestedBy || 'Unknown', inline: true },
                { name: '🔁 Loop Mode', value: getLoopModeText(loopMode), inline: true },
                { name: '📝 Queue Length', value: `${queue.length} songs`, inline: true },
                { name: '⏱️ Status', value: '▶️ Playing', inline: true }
            )
            .setTimestamp();

        if (song.thumbnail) {
            embed.setThumbnail(song.thumbnail);
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('music_pause')
                    .setLabel('Pause')
                    .setEmoji('⏸️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('music_skip')
                    .setLabel('Skip')
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('music_stop')
                    .setLabel('Stop')
                    .setEmoji('⏹️')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('music_loop')
                    .setLabel('Loop')
                    .setEmoji('🔁')
                    .setStyle(ButtonStyle.Success)
            );

        const response = await interaction.reply({ 
            embeds: [embed], 
            components: [row] 
        });

        // Create button collector
        const collector = response.createMessageComponentCollector({ 
            time: 300000 // 5 minutes timeout
        });

        collector.on('collect', async (buttonInteraction) => {
            // Check if user is in voice channel
            if (!buttonInteraction.member.voice.channel) {
                return buttonInteraction.reply({ 
                    content: '❌ You need to be in a voice channel to use music controls!', 
                    flags: [4096] // MessageFlags.Ephemeral
                });
            }

            const action = buttonInteraction.customId.replace('music_', '');
            
            switch (action) {
                case 'pause':
                    if (musicPlayer.isPlaying(guildId)) {
                        musicPlayer.pause(guildId);
                        await buttonInteraction.reply({ 
                            content: '⏸️ Music paused!', 
                            flags: [4096]
                        });
                    } else if (musicPlayer.isPaused(guildId)) {
                        musicPlayer.resume(guildId);
                        await buttonInteraction.reply({ 
                            content: '▶️ Music resumed!', 
                            flags: [4096]
                        });
                    } else {
                        await buttonInteraction.reply({ 
                            content: '❌ No music is currently playing!', 
                            flags: [4096]
                        });
                    }
                    break;
                    
                case 'skip':
                    await musicPlayer.playNext(guildId);
                    await buttonInteraction.reply({ 
                        content: '⏭️ Skipped to next song!', 
                        flags: [4096]
                    });
                    break;
                    
                case 'stop':
                    musicPlayer.disconnect(guildId);
                    await buttonInteraction.reply({ 
                        content: '⏹️ Music stopped and disconnected!', 
                        flags: [4096]
                    });
                    break;
                    
                case 'loop':
                    // Cycle through loop modes
                    const currentLoop = await db.getLoopMode(guildId);
                    const nextLoop = getNextLoopMode(currentLoop);
                    await db.setLoopMode(guildId, nextLoop);
                    
                    await buttonInteraction.reply({ 
                        content: `🔁 Loop mode changed to: **${getLoopModeText(nextLoop)}**`, 
                        flags: [4096]
                    });
                    break;
            }
        });

        collector.on('end', async () => {
            // Disable buttons after timeout
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    ...row.components.map(button => 
                        ButtonBuilder.from(button).setDisabled(true)
                    )
                );

            try {
                await response.edit({ components: [disabledRow] });
            } catch (error) {
                // Message was probably deleted, ignore error
            }
        });
    },
};

function getLoopModeText(mode) {
    switch (mode) {
        case 'single':
            return '🔁 Loop Current Song';
        case 'queue':
            return '🔂 Loop Queue';
        case 'off':
        default:
            return '▶️ No Loop';
    }
}

function getNextLoopMode(currentMode) {
    switch (currentMode) {
        case 'off':
            return 'single';
        case 'single':
            return 'queue';
        case 'queue':
        default:
            return 'off';
    }
}
