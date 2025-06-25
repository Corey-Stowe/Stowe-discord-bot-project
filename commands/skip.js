const { SlashCommandBuilder } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song')
        .setDescriptionLocalizations({
            vi: 'Bỏ qua bài hát hiện tại'
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
        
        // Check if music player exists and get current song
        const playerData = musicPlayer.getPlayer(guildId);
        if (!playerData) {
            return interaction.reply({
                content: i18n.translate(lang, 'music.no_music_playing'),
                flags: [4096] // Use flags instead of ephemeral: true
            });
        }

        const currentSong = musicPlayer.getCurrentSong(guildId);
        const songTitle = currentSong ? currentSong.title : 'Unknown Song';
        
        const success = await musicPlayer.skip(guildId);
        if (success) {
            await interaction.reply(`⏭️ ${i18n.translate(lang, 'music.skipped')}: **${songTitle}**`);
        } else {
            await interaction.reply(i18n.translate(lang, 'music.skip_failed') || 'Failed to skip the current song.');
        }
    },
};
