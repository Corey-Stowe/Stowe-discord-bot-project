const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const Database = require('../utils/database.js');
const i18n = require('../utils/i18n.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show currently playing song with controls')
        .setDescriptionLocalizations({
            vi: 'Hiển thị bài hát đang phát với các điều khiển'
        }),
    
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const lang = await i18n.getLanguage(guildId, interaction.user.id); // Add missing lang variable
        const playerData = musicPlayer.getPlayer(guildId);
        
        if (!playerData || !playerData.currentSong) {
            return interaction.reply({ 
                content: 'No music is currently playing!', 
                flags: [4096] // Use flags instead of ephemeral: true
            });
        }

        const song = playerData.currentSong;
        const db = new Database();
        const queue = await db.getQueue(guildId);
        const loopMode = await db.getLoopMode(guildId);

        const embed = new EmbedBuilder()
            .setColor('#ff6b6b')
            .setTitle(i18n.translate(lang, 'music.now_playing'))
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: i18n.translate(lang, 'music.artist'), value: song.author || 'Unknown', inline: true },
                { name: i18n.translate(lang, 'music.bitrate'), value: song.quality || 'Unknown', inline: true },
                { name: i18n.translate(lang, 'music.requested_by'), value: song.requestedBy || 'Unknown', inline: true },
                { name: i18n.translate(lang, 'music.loop_mode'), value: getLoopModeText(loopMode, lang), inline: true },
                { name: i18n.translate(lang, 'music.queue_length'), value: `${queue.length} songs`, inline: true },
                { name: i18n.translate(lang, 'music.status'), value: i18n.translate(lang, 'music.playing'), inline: true }
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
                    content: i18n.translate(lang, 'common.voice_channel_required'), 
                    flags: [4096] // MessageFlags.Ephemeral
                });
            }

            const action = buttonInteraction.customId.replace('music_', '');
            
            switch (action) {
                case 'pause':
                    if (musicPlayer.isPlaying(guildId)) {
                        musicPlayer.pause(guildId);
                        await buttonInteraction.reply({ 
                            content: i18n.translate(lang, 'music.paused'), 
                            flags: [4096]
                        });
                    } else if (musicPlayer.isPaused(guildId)) {
                        musicPlayer.resume(guildId);
                        await buttonInteraction.reply({ 
                            content: i18n.translate(lang, 'music.resumed'), 
                            flags: [4096]
                        });
                    } else {
                        await buttonInteraction.reply({ 
                            content: i18n.translate(lang, 'music.no_music_playing'), 
                            flags: [4096]
                        });
                    }
                    break;
                    
                case 'skip':
                    await musicPlayer.playNext(guildId);
                    await buttonInteraction.reply({ 
                        content: i18n.translate(lang, 'music.skipped'), 
                        flags: [4096]
                    });
                    break;
                    
                case 'stop':
                    musicPlayer.disconnect(guildId);
                    await buttonInteraction.reply({ 
                        content: i18n.translate(lang, 'music.stopped'), 
                        flags: [4096]
                    });
                    break;
                    
                case 'loop':
                    // Cycle through loop modes
                    const currentLoop = await db.getLoopMode(guildId);
                    const nextLoop = getNextLoopMode(currentLoop);
                    await db.setLoopMode(guildId, nextLoop);
                    
                    await buttonInteraction.reply({ 
                        content: `🔁 Loop mode changed to: **${getLoopModeText(nextLoop, lang)}**`, 
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

function getLoopModeText(mode, lang) {
    switch (mode) {
        case 'single':
            return i18n.translate(lang, 'music.loop_modes.single');
        case 'queue':
            return i18n.translate(lang, 'music.loop_modes.queue');
        case 'off':
        default:
            return i18n.translate(lang, 'music.loop_modes.off');
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
