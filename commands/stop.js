const { SlashCommandBuilder } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playing music and clear the queue')
        .setDescriptionLocalizations({
            vi: 'Dừng phát nhạc và xóa hàng đợi'
        }),
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const lang = await i18n.getLanguage(guildId, interaction.user.id);
        
        // Check if user is in a voice channel
        if (!interaction.member.voice.channel) {
            return interaction.reply({
                content: i18n.translate(lang, 'common.voice_channel_required'),
                flags: [4096] // Use flags instead of ephemeral: true
            });
        }
        
        // Check if music player exists
        const playerData = musicPlayer.getPlayer(guildId);
        if (!playerData) {
            return interaction.reply({
                content: i18n.translate(lang, 'music.no_music_playing'),
                flags: [4096] // Use flags instead of ephemeral: true
            });
        }
        
        // Defer reply for potentially slow operations
        await interaction.deferReply();
        
        try {
            const success = await musicPlayer.stop(guildId);
            if (success) {
                await interaction.editReply(i18n.translate(lang, 'music.stopped'));
            } else {
                await interaction.editReply(i18n.translate(lang, 'music.stop_failed') || 'Failed to stop the music.');
            }
        } catch (error) {
            logger.error('MUSIC', `Error in stop command: ${error.message}`);
            try {
                await interaction.editReply(i18n.translate(lang, 'common.error') || 'An error occurred while stopping the music.');
            } catch (replyError) {
                logger.error('MUSIC', `Failed to send stop error reply: ${replyError.message}`);
            }
        }
    },
};
