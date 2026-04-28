const { SlashCommandBuilder } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('disconnect')
        .setDescription('Disconnect the bot from the voice channel')
        .setDescriptionLocalizations({
            vi: 'Ngắt kết nối bot khỏi kênh thoại',
            ja: 'ボットをボイスチャンネルから切断する'
        }),
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'This command can only be used in a server.',
                ephemeral: true
            });
        }
        const guildId = interaction.guild.id;
        const lang = await i18n.getLanguage(guildId, interaction.user.id);

        if (!interaction.member.voice.channel) {
            return interaction.reply({
                content: i18n.translate(lang, 'common.voice_channel_required'),
                ephemeral: true
            });
        }

        // Check bot's actual voice state — not the DisTube queue
        const botVoice = interaction.guild.members.me?.voice?.channel;
        if (!botVoice) {
            return interaction.reply({
                content: i18n.translate(lang, 'music.not_in_voice'),
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            // disconnect() handles all methods: queue stop, DisTube voices, and @discordjs/voice fallback
            musicPlayer.disconnect(guildId);

            // Ultimate fallback: disconnect via guild member voice state
            const me = interaction.guild.members.me;
            if (me?.voice?.channel) {
                await me.voice.disconnect();
            }

            await interaction.editReply(i18n.translate(lang, 'music.disconnected'));
        } catch (error) {
            logger.error('MUSIC', `Error in disconnect command: ${error.message}`);
            try {
                await interaction.editReply(i18n.translate(lang, 'common.error'));
            } catch (replyError) {
                logger.error('MUSIC', `Failed to send disconnect error reply: ${replyError.message}`);
            }
        }
    },
};
