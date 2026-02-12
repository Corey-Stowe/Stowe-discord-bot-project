const { SlashCommandBuilder } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song')
        .setDescriptionLocalizations({
            vi: 'Bỏ qua bài hát hiện tại'
        }),
    async execute(interaction) {
        // Defer reply immediately to prevent timeout issues
        await interaction.deferReply();
        
        const guildId = interaction.guild.id;
        const lang = await i18n.getLanguage(guildId, interaction.user.id);
        
        try {
            // Check if user is in a voice channel
            if (!interaction.member.voice.channel) {
                return interaction.editReply({
                    content: i18n.translate(lang, 'common.voice_channel_required')
                });
            }
            
            // Check if music player exists and get current song
            const playerData = musicPlayer.getPlayer(guildId);
            if (!playerData) {
                return interaction.editReply({
                    content: i18n.translate(lang, 'music.no_music_playing')
                });
            }

            const currentSong = musicPlayer.getCurrentSong(guildId);
            const songTitle = currentSong ? currentSong.title : 'Unknown Song';
            
            const success = await musicPlayer.skip(guildId);
            if (success) {
                await interaction.editReply(`⏭️ ${i18n.translate(lang, 'music.skipped')}: **${songTitle}**`);
            } else {
                await interaction.editReply(i18n.translate(lang, 'music.skip_failed') || 'Failed to skip the current song.');
            }
        } catch (error) {
            logger.error('MUSIC', `Error in skip command: ${error.message}`);

            try {
                await interaction.editReply(i18n.translate(lang, 'music.skip_failed') || 'An error occurred while skipping the song.');
            } catch (replyError) {
                logger.error('MUSIC', `Failed to send skip error reply: ${replyError.message}`);
            }
        }
    },
};
