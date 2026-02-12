const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume music playback if paused')
        .setDescriptionLocalizations({
            vi: 'Ti\u1ebfp t\u1ee5c ph\u00e1t nh\u1ea1c n\u1ebfu c\u00f3 h\u00e0ng \u0111\u1ee3i'
        }),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const lang = await i18n.getLanguage(guildId, interaction.user.id);
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: i18n.translate(lang, 'common.voice_channel_required'),
                flags: [4096]
            });
        }

        const queue = musicPlayer.getQueue(guildId);

        // If queue exists and is paused, resume it
        if (queue && musicPlayer.isPaused(guildId)) {
            musicPlayer.resume(guildId);
            return interaction.reply(i18n.translate(lang, 'music.resumed'));
        }

        // If already playing
        if (queue && musicPlayer.isPlaying(guildId)) {
            return interaction.reply({
                content: i18n.translate(lang, 'music.already_playing'),
                flags: [4096]
            });
        }

        // No active queue - nothing to resume
        return interaction.reply({
            content: i18n.translate(lang, 'music.no_queue_to_resume'),
            flags: [4096]
        });
    },
};
