const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Control music loop settings')
        .setDescriptionLocalizations({
            vi: '\u0110i\u1ec1u khi\u1ec3n c\u00e0i \u0111\u1eb7t l\u1eb7p nh\u1ea1c'
        })
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode to set')
                .setDescriptionLocalizations({
                    vi: 'Ch\u1ebf \u0111\u1ed9 l\u1eb7p \u0111\u1ec3 \u0111\u1eb7t'
                })
                .setRequired(false)
                .addChoices(
                    { name: '\uD83D\uDD01 Loop Current Song', value: 'single' },
                    { name: '\uD83D\uDD02 Loop Queue', value: 'queue' },
                    { name: '\u25B6\uFE0F Disable Loop', value: 'off' }
                )),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const mode = interaction.options.getString('mode');
        const lang = await i18n.getLanguage(guildId, interaction.user.id);

        // Check if user is in voice channel
        if (!interaction.member.voice.channel) {
            return interaction.reply({
                content: i18n.translate(lang, 'common.voice_channel_required'),
                flags: [4096]
            });
        }

        // Check if bot has an active queue
        const queue = musicPlayer.getQueue(guildId);
        if (!queue) {
            return interaction.reply({
                content: i18n.translate(lang, 'music.no_music_playing'),
                flags: [4096]
            });
        }

        if (mode) {
            // Set loop mode directly via DisTube
            const repeatMode = musicPlayer.loopModeToRepeatMode(mode);
            musicPlayer.setRepeatMode(guildId, repeatMode);
            const modeText = getLoopModeText(mode, lang);

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('\uD83C\uDFB5 Loop Mode Updated')
                .setDescription(`Loop mode set to: **${modeText}**`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } else {
            // Show interactive loop control panel
            await showLoopPanel(interaction, guildId, lang);
        }
    },
};

async function showLoopPanel(interaction, guildId, lang) {
    const currentRepeat = musicPlayer.getRepeatMode(guildId);
    const currentMode = musicPlayer.repeatModeToLoopMode(currentRepeat);

    const queue = musicPlayer.getQueue(guildId);
    const currentSong = queue?.songs[0];

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('\uD83C\uDFB5 Loop Control Panel')
        .setDescription(
            `**Current Mode:** ${getLoopModeText(currentMode, lang)}\n` +
            `**${i18n.translate(lang, 'music.now_playing')}:** ${currentSong ? `${currentSong.name || currentSong.title}` : 'Nothing'}\n\n` +
            `Choose your loop preference:`
        )
        .addFields(
            { name: '\uD83D\uDD01 Loop Current', value: i18n.translate(lang, 'commands.loop.repeat_the_current_song'), inline: true },
            { name: '\uD83D\uDD02 Loop Queue', value: i18n.translate(lang, 'commands.loop.repeat_the_entire_queue'), inline: true },
            { name: '\u25B6\uFE0F No Loop', value: 'Play normally without looping', inline: true }
        )
        .setFooter({ text: 'Click a button to change loop mode' })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('loop_single')
                .setLabel('Loop Current')
                .setEmoji('\uD83D\uDD01')
                .setStyle(currentMode === 'single' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('loop_queue')
                .setLabel('Loop Queue')
                .setEmoji('\uD83D\uDD02')
                .setStyle(currentMode === 'queue' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('loop_off')
                .setLabel('No Loop')
                .setEmoji('\u25B6\uFE0F')
                .setStyle(currentMode === 'off' ? ButtonStyle.Success : ButtonStyle.Secondary)
        );

    const response = await interaction.reply({
        embeds: [embed],
        components: [row]
    });

    // Create button collector
    const collector = response.createMessageComponentCollector({
        time: 60000 // 1 minute timeout
    });

    collector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.user.id !== interaction.user.id) {
            return buttonInteraction.reply({
                content: '\u274C Only the command user can control this panel!',
                flags: [4096]
            });
        }

        const newMode = buttonInteraction.customId.replace('loop_', '');
        const repeatMode = musicPlayer.loopModeToRepeatMode(newMode);
        musicPlayer.setRepeatMode(guildId, repeatMode);
        logger.info('MUSIC', `Loop mode set to ${newMode} (repeat: ${repeatMode}) for guild ${guildId}`);

        // Update embed with new mode
        const updatedEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('\uD83C\uDFB5 Loop Control Panel')
            .setDescription(
                `**Current Mode:** ${getLoopModeText(newMode, lang)}\n` +
                `**${i18n.translate(lang, 'music.now_playing')}:** ${currentSong ? `${currentSong.name || currentSong.title}` : 'Nothing'}\n\n` +
                `\u2705 Loop mode updated to: **${getLoopModeText(newMode, lang)}**`
            )
            .addFields(
                { name: '\uD83D\uDD01 Loop Current', value: i18n.translate(lang, 'commands.loop.repeat_the_current_song'), inline: true },
                { name: '\uD83D\uDD02 Loop Queue', value: i18n.translate(lang, 'commands.loop.repeat_the_entire_queue'), inline: true },
                { name: '\u25B6\uFE0F No Loop', value: 'Play normally without looping', inline: true }
            )
            .setFooter({ text: 'Loop mode successfully changed!' })
            .setTimestamp();

        // Update buttons to reflect new state
        const updatedRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('loop_single')
                    .setLabel('Loop Current')
                    .setEmoji('\uD83D\uDD01')
                    .setStyle(newMode === 'single' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('loop_queue')
                    .setLabel('Loop Queue')
                    .setEmoji('\uD83D\uDD02')
                    .setStyle(newMode === 'queue' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('loop_off')
                    .setLabel('No Loop')
                    .setEmoji('\u25B6\uFE0F')
                    .setStyle(newMode === 'off' ? ButtonStyle.Success : ButtonStyle.Secondary)
            );

        await buttonInteraction.update({
            embeds: [updatedEmbed],
            components: [updatedRow]
        });
    });

    collector.on('end', async () => {
        // Disable buttons after timeout
        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('loop_single')
                    .setLabel('Loop Current')
                    .setEmoji('\uD83D\uDD01')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('loop_queue')
                    .setLabel('Loop Queue')
                    .setEmoji('\uD83D\uDD02')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('loop_off')
                    .setLabel('No Loop')
                    .setEmoji('\u25B6\uFE0F')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

        try {
            await response.edit({ components: [disabledRow] });
        } catch (error) {
            // Message was probably deleted, ignore error
        }
    });
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
