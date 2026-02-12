const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show currently playing song with controls')
        .setDescriptionLocalizations({
            vi: 'Hi\u1ec3n th\u1ecb b\u00e0i h\u00e1t \u0111ang ph\u00e1t v\u1edbi c\u00e1c \u0111i\u1ec1u khi\u1ec3n'
        }),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const lang = await i18n.getLanguage(guildId, interaction.user.id);
        const queue = musicPlayer.getQueue(guildId);

        if (!queue || queue.songs.length === 0) {
            return interaction.reply({
                content: i18n.translate(lang, 'music.no_music_playing'),
                flags: [4096]
            });
        }

        const song = queue.songs[0];
        const repeatMode = musicPlayer.getRepeatMode(guildId);
        const loopMode = musicPlayer.repeatModeToLoopMode(repeatMode);

        const embed = new EmbedBuilder()
            .setColor('#ff6b6b')
            .setTitle(i18n.translate(lang, 'music.now_playing'))
            .setDescription(`**[${song.name || song.title}](${song.url})**`)
            .addFields(
                { name: i18n.translate(lang, 'music.artist'), value: song.uploader?.name || song.author || 'Unknown', inline: true },
                { name: i18n.translate(lang, 'music.duration'), value: song.formattedDuration || '0:00', inline: true },
                { name: i18n.translate(lang, 'music.requested_by'), value: song.user?.toString() || song.metadata?.requestedBy || 'Unknown', inline: true },
                { name: i18n.translate(lang, 'music.loop_mode'), value: getLoopModeText(loopMode, lang), inline: true },
                { name: i18n.translate(lang, 'music.queue_length'), value: `${queue.songs.length} songs`, inline: true },
                { name: i18n.translate(lang, 'music.status'), value: queue.paused ? i18n.translate(lang, 'music.paused') : i18n.translate(lang, 'music.playing'), inline: true }
            )
            .setTimestamp();

        if (song.thumbnail) {
            embed.setThumbnail(song.thumbnail);
        }

        // Add progress bar if available
        if (queue.currentTime && song.duration) {
            const progress = Math.floor((queue.currentTime / song.duration) * 20);
            const bar = '\u2588'.repeat(progress) + '\u2591'.repeat(20 - progress);
            const currentFormatted = formatDuration(queue.currentTime);
            embed.addFields({
                name: 'Progress',
                value: `\`${currentFormatted}\` ${bar} \`${song.formattedDuration}\``,
                inline: false
            });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('music_pause')
                    .setLabel(queue.paused ? 'Resume' : 'Pause')
                    .setEmoji(queue.paused ? '\u25B6\uFE0F' : '\u23F8\uFE0F')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('music_skip')
                    .setLabel('Skip')
                    .setEmoji('\u23ED\uFE0F')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('music_stop')
                    .setLabel('Stop')
                    .setEmoji('\u23F9\uFE0F')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('music_loop')
                    .setLabel('Loop')
                    .setEmoji('\uD83D\uDD01')
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
                    flags: [4096]
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
                    await musicPlayer.skip(guildId);
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

                case 'loop': {
                    // Cycle through loop modes using DisTube repeat mode
                    const currentRepeat = musicPlayer.getRepeatMode(guildId);
                    const currentLoop = musicPlayer.repeatModeToLoopMode(currentRepeat);
                    const nextLoop = getNextLoopMode(currentLoop);
                    const nextRepeat = musicPlayer.loopModeToRepeatMode(nextLoop);
                    musicPlayer.setRepeatMode(guildId, nextRepeat);

                    await buttonInteraction.reply({
                        content: `\uD83D\uDD01 Loop mode changed to: **${getLoopModeText(nextLoop, lang)}**`,
                        flags: [4096]
                    });
                    break;
                }
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

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

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
