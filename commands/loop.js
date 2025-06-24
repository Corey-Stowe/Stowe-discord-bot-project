const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('../utils/database.js');
const musicPlayer = require('../utils/musicPlayer.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Control music loop settings')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode to set')
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
        
        // Check if user is in voice channel
        if (!interaction.member.voice.channel) {
            return interaction.reply({ 
                content: '❌ You need to be in a voice channel to use loop controls!', 
                ephemeral: true 
            });
        }

        // Check if bot is playing music
        const playerData = musicPlayer.getPlayer(guildId);
        if (!playerData) {
            return interaction.reply({ 
                content: '❌ No music is currently playing!', 
                ephemeral: true 
            });
        }

        if (mode) {
            // Set loop mode directly
            await setLoopMode(guildId, mode, db);
            const modeText = getLoopModeText(mode);
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎵 Loop Mode Updated')
                .setDescription(`Loop mode set to: **${modeText}**`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } else {
            // Show interactive loop control panel
            await showLoopPanel(interaction, guildId, db);
        }
    },
};

async function showLoopPanel(interaction, guildId, db) {
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
            `**Current Mode:** ${getLoopModeText(currentMode)}\n` +
            `**Now Playing:** ${currentSong ? `${currentSong.title}` : 'Nothing'}\n\n` +
            `Choose your loop preference:`
        )
        .addFields(
            { name: '🔁 Loop Current', value: 'Repeat the current song', inline: true },
            { name: '🔂 Loop Queue', value: 'Repeat the entire queue', inline: true },
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
                ephemeral: true 
            });
        }

        const newMode = buttonInteraction.customId.replace('loop_', '');
        await setLoopMode(guildId, newMode, db);
        
        // Update embed with new mode
        const updatedEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🎵 Loop Control Panel')
            .setDescription(
                `**Current Mode:** ${getLoopModeText(newMode)}\n` +
                `**Now Playing:** ${currentSong ? `${currentSong.title}` : 'Nothing'}\n\n` +
                `✅ Loop mode updated to: **${getLoopModeText(newMode)}**`
            )
            .addFields(
                { name: '🔁 Loop Current', value: 'Repeat the current song', inline: true },
                { name: '🔂 Loop Queue', value: 'Repeat the entire queue', inline: true },
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
