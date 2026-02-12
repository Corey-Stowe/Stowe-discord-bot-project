const { SlashCommandBuilder } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause or resume the currently playing song')
        .setDescriptionLocalizations({
            vi: 'Tạm dừng hoặc tiếp tục bài hát đang phát'
        }),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const lang = await i18n.getLanguage(guildId, userId);

        // Check if user is in a voice channel
        if (!interaction.member.voice.channel) {
            return interaction.reply({
                content: i18n.translate(lang, 'common.voice_channel_required'),
                flags: [4096]
            });
        }

        // Check if music is playing or paused
        if (musicPlayer.isPlaying(guildId)) {
            musicPlayer.pause(guildId);
            return interaction.reply({
                content: i18n.translate(lang, 'music.paused'),
                flags: [4096]
            });
        } else if (musicPlayer.isPaused(guildId)) {
            musicPlayer.resume(guildId);
            return interaction.reply({
                content: i18n.translate(lang, 'music.resumed'),
                flags: [4096]
            });
        } else {
            return interaction.reply({
                content: i18n.translate(lang, 'music.no_music_playing'),
                flags: [4096]
            });
        }
    },
};
