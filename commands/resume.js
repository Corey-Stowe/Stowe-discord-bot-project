const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer } = require('@discordjs/voice');
const musicPlayer = require('../utils/musicPlayer.js');
const Database = require('../utils/database.js');
const i18n = require('../utils/i18n.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume music playback if queue exists')
        .setDescriptionLocalizations({
            vi: 'Tiếp tục phát nhạc nếu có hàng đợi'
        }),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const guildId = interaction.guild.id;
            const member = interaction.member;
            const voiceChannel = member.voice.channel;
            const db = new Database();
            const lang = await i18n.getLanguage(guildId, interaction.user.id);

            if (!voiceChannel) {
                return interaction.editReply(i18n.translate(lang, 'common.voice_channel_required') || '❌ You need to be in a voice channel to resume music!');
            }

            // Check if player already exists
            const playerData = musicPlayer.getPlayer(guildId);
            if (playerData) {
                // Check if music is paused
                if (musicPlayer.isPaused(guildId)) {
                    musicPlayer.resume(guildId);
                    return interaction.editReply('▶️ ' + (i18n.translate(lang, 'music.resumed') || 'Resumed the current song!'));
                } else if (musicPlayer.isPlaying(guildId)) {
                    return interaction.editReply('🎵 ' + (i18n.translate(lang, 'music.already_playing') || 'Music is already playing!'));
                }
            }

            // Check if queue exists
            const queue = await db.getQueue(guildId);
            if (!queue || queue.length === 0) {
                return interaction.editReply('❌ ' + (i18n.translate(lang, 'music.no_queue_to_resume') || 'No songs in queue to resume. Use `/play` to add music first!'));
            }

            // Check 24/7 mode status
            const mode24h = await db.get24hMode(guildId);
            if (mode24h.enabled && mode24h.channelId && voiceChannel.id !== mode24h.channelId) {
                return interaction.editReply(`❌ 24/7 mode is active in <#${mode24h.channelId}>. Please join that channel or disable 24/7 mode first.`);
            }

            // Create voice connection using musicPlayer system
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            // Create audio player using musicPlayer system
            const player = createAudioPlayer();
            musicPlayer.setPlayer(guildId, player, connection);
            musicPlayer.setupPlayerEvents(guildId, player);
            connection.subscribe(player);

            // Start playing from queue
            await musicPlayer.playNext(guildId);

            // Get current song info for response
            const currentSong = musicPlayer.getCurrentSong(guildId);
            if (!currentSong) {
                return interaction.editReply('❌ Failed to start playing music.');
            }

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('▶️ ' + (i18n.translate(lang, 'music.music_resumed') || 'Music Resumed'))
                .setDescription(`**${i18n.translate(lang, 'music.now_playing') || 'Now Playing'}:** ${currentSong.title}`)
                .addFields(
                    { name: i18n.translate(lang, 'music.artist') || '🎤 Artist', value: currentSong.author || 'Unknown', inline: true },
                    { name: i18n.translate(lang, 'music.requested_by') || '👤 Requested by', value: currentSong.requestedBy || 'Unknown', inline: true },
                    { name: i18n.translate(lang, 'music.queue_length') || '📋 Queue', value: `${queue.length} song(s)`, inline: true }
                )
                .setTimestamp();

            if (currentSong.thumbnail) {
                embed.setThumbnail(currentSong.thumbnail);
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Resume command error:', error);
            await interaction.editReply('❌ An error occurred while trying to resume music.');
        }
    },
};
                        