const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('../utils/database.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Control music loop settings')
        .setDescriptionLocalizations({
            vi: 'Điều khiển cài đặt lặp nhạc'
        })
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode to set')
                .setDescriptionLocalizations({
                    vi: 'Chế độ lặp để đặt'
                })
                .setRequired(false)
                .addChoices(
                    { name: '🔁 Loop Current Song', value: 'single' },
                    { name: '🔂 Loop Queue', value: 'queue' },
                    { name: '▶️ Disable Loop', value: 'off' }
                )),
    
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const db = new Database();
        const mode = interaction.options.getString('mode');
        const lang = await i18n.getLanguage(guildId, interaction.user.id);
        
        // Check if user is in voice channel
        if (!interaction.member.voice.channel) {
            return interaction.reply({ 
                content: i18n.translate(lang, 'common.voice_channel_required'), 
                flags: [4096] // Use flags instead of ephemeral: true
            });
        }

        // Check if bot is playing music
        const playerData = musicPlayer.getPlayer(guildId);
        if (!playerData) {
            return interaction.reply({ 
                content: i18n.translate(lang, 'music.no_music_playing'), 
                flags: [4096] // Use flags instead of ephemeral: true
            });
        }

        if (mode) {
            // Set loop mode directly
            await setLoopMode(guildId, mode, db);
            const modeText = getLoopModeText(mode, lang);
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎵 Loop Mode Updated')
                .setDescription(`Loop mode set to: **${modeText}**`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } else {
            // Show interactive loop control panel
            await showLoopPanel(interaction, guildId, db, lang);
        }
    },
};

async function showLoopPanel(interaction, guildId, db, lang) {
    let currentMode = 'off';
    try {
        currentMode = await db.getLoopMode(guildId) || 'off';
    } catch (error) {
        console.error('Failed to get current loop mode:', error);
    }
    
    const currentSong = musicPlayer.getCurrentSong(guildId);
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎵 Loop Control Panel')
        .setDescription(
            `**Current Mode:** ${getLoopModeText(currentMode, lang)}\n` +
            `**${i18n.translate(lang, 'music.now_playing')}:** ${currentSong ? `${currentSong.title}` : 'Nothing'}\n\n` +
            `Choose your loop preference:`
        )
        .addFields(
            { name: '🔁 Loop Current', value: i18n.translate(lang, 'commands.loop.repeat_the_current_song'), inline: true },
            { name: '🔂 Loop Queue', value: i18n.translate(lang, 'commands.loop.repeat_the_entire_queue'), inline: true },
            { name: '▶️ No Loop', value: 'Play normally without looping', inline: true }
        )
        .setFooter({ text: 'Click a button to change loop mode' })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('loop_single')
                .setLabel('Loop Current')
                .setEmoji('🔁')
                .setStyle(currentMode === 'single' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('loop_queue')
                .setLabel('Loop Queue')
                .setEmoji('🔂')
                .setStyle(currentMode === 'queue' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('loop_off')
                .setLabel('No Loop')
                .setEmoji('▶️')
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
                content: '❌ Only the command user can control this panel!', 
                flags: [4096] // Use flags instead of ephemeral: true
            });
        }

        const newMode = buttonInteraction.customId.replace('loop_', '');
        await setLoopMode(guildId, newMode, db);
        
        // Update embed with new mode
        const updatedEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🎵 Loop Control Panel')
            .setDescription(
                `**Current Mode:** ${getLoopModeText(newMode, lang)}\n` +
                `**${i18n.translate(lang, 'music.now_playing')}:** ${currentSong ? `${currentSong.title}` : 'Nothing'}\n\n` +
                `✅ Loop mode updated to: **${getLoopModeText(newMode, lang)}**`
            )
            .addFields(
                { name: '🔁 Loop Current', value: i18n.translate(lang, 'commands.loop.repeat_the_current_song'), inline: true },
                { name: '🔂 Loop Queue', value: i18n.translate(lang, 'commands.loop.repeat_the_entire_queue'), inline: true },
                { name: '▶️ No Loop', value: 'Play normally without looping', inline: true }
            )
            .setFooter({ text: 'Loop mode successfully changed!' })
            .setTimestamp();

        // Update buttons to reflect new state
        const updatedRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('loop_single')
                    .setLabel('Loop Current')
                    .setEmoji('🔁')
                    .setStyle(newMode === 'single' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('loop_queue')
                    .setLabel('Loop Queue')
                    .setEmoji('🔂')
                    .setStyle(newMode === 'queue' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('loop_off')
                    .setLabel('No Loop')
                    .setEmoji('▶️')
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
                    .setEmoji('🔁')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('loop_queue')
                    .setLabel('Loop Queue')
                    .setEmoji('🔂')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('loop_off')
                    .setLabel('No Loop')
                    .setEmoji('▶️')
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

async function setLoopMode(guildId, mode, db) {
    await db.setLoopMode(guildId, mode);
    console.log(`Loop mode set to ${mode} for guild ${guildId}`);
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
