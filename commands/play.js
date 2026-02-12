const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const recommendationEngine = require('../utils/recommendationEngine.js');
const i18n = require('../utils/i18n.js');
const logger = require('../utils/logger');
const { search: ytdlpSearch } = require('../utils/ytdlpSearch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from various platforms or search for songs')
        .setDescriptionLocalizations({
            vi: 'Ph\u00e1t nh\u1ea1c t\u1eeb nhi\u1ec1u n\u1ec1n t\u1ea3ng ho\u1eb7c t\u00ecm ki\u1ebfm b\u00e0i h\u00e1t'
        })
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Video URL, music URL, or search query')
                .setDescriptionLocalizations({
                    vi: 'URL video, URL nh\u1ea1c, ho\u1eb7c t\u1eeb kh\u00f3a t\u00ecm ki\u1ebfm'
                })
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('platform')
                .setDescription('Choose platform to search (default: auto-detect)')
                .setDescriptionLocalizations({
                    vi: 'Ch\u1ecdn n\u1ec1n t\u1ea3ng \u0111\u1ec3 t\u00ecm ki\u1ebfm (m\u1eb7c \u0111\u1ecbnh: t\u1ef1 \u0111\u1ed9ng ph\u00e1t hi\u1ec7n)'
                })
                .addChoices(
                    { name: 'Auto-detect', value: 'auto' },
                    { name: 'Video Platform', value: 'youtube' },
                    { name: 'SoundCloud', value: 'soundcloud' },
                    { name: 'Spotify', value: 'spotify' }
                )
                .setRequired(false))
        .addBooleanOption(option =>
            option
                .setName('autoselect')
                .setDescription('Auto-select first result (default: true)')
                .setDescriptionLocalizations({
                    vi: 'T\u1ef1 \u0111\u1ed9ng ch\u1ecdn k\u1ebft qu\u1ea3 \u0111\u1ea7u ti\u00ean (m\u1eb7c \u0111\u1ecbnh: c\u00f3)'
                })
                .setRequired(false)),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const query = interaction.options.getString('query');
        const platform = interaction.options.getString('platform') || 'auto';
        const autoSelect = interaction.options.getBoolean('autoselect') ?? true;

        // Validate query input
        if (!query || query.trim() === '') {
            return interaction.reply({
                content: i18n.t('music.error_processing_request'),
                ephemeral: true
            });
        }

        const lang = await i18n.getLanguage(guildId, userId);

        // Check if user is in a voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({
                content: i18n.translate(lang, 'common.voice_channel_required'),
                flags: [4096]
            });
        }

        await interaction.deferReply();

        try {
            const distube = interaction.client.distube;

            // Reset auto-suggestion counter when user manually plays songs
            musicPlayer.resetAutoSuggestionCounter(guildId);

            // Track play for recommendation engine
            recommendationEngine.trackPlayHistory(guildId, { title: query }, userId, interaction.user.tag);

            // If autoselect is disabled and query is not a URL, show search results
            if (!autoSelect && !this.isUrl(query)) {
                return await this.handleManualSearch(distube, query, interaction, voiceChannel, platform, lang);
            }

            // Build search query with platform hint if specified
            let searchQuery = query;
            if (platform !== 'auto' && !this.isUrl(query)) {
                // For non-URL queries with specific platform, DisTube auto-detects from URL
                // For search queries, we can hint the plugin
                if (platform === 'soundcloud') {
                    searchQuery = query; // SoundCloud plugin will handle
                } else if (platform === 'spotify') {
                    searchQuery = query; // Spotify plugin will handle
                }
                // YouTube/auto is default behavior
            }

            // Show searching message
            const searchingMessage = i18n.translate(lang, 'music.searching_for', { query });
            await interaction.editReply(searchingMessage);

            // DisTube handles everything: URL detection, platform resolution, voice join, queue
            await distube.play(voiceChannel, searchQuery, {
                textChannel: interaction.channel,
                member: interaction.member,
                metadata: {
                    interaction,
                    requestedBy: interaction.user.tag,
                    requestedByUserId: userId,
                    platform: platform,
                },
            });

            // DisTube events (playSong, addSong, addList) in index.js send proper embeds.
            // Delete the "searching" placeholder after a brief delay to avoid visual gap.
            const deleteTimer = setTimeout(async () => {
                try { await interaction.deleteReply(); } catch {}
            }, 3000);

            // Add initial auto-suggestions if enabled
            try {
                const queue = musicPlayer.getQueue(guildId);
                if (queue) {
                    await musicPlayer.addInitialAutoSuggestions(guildId, queue.songs, userId);
                }
            } catch (suggestionError) {
                logger.error('MUSIC', `Error adding initial auto-suggestions: ${suggestionError.message}`);
            }

        } catch (error) {
            logger.error('MUSIC', 'Error in play command', {
                error: error.message,
                stack: error.stack,
                query,
                user: interaction.user.tag,
                guild: interaction.guild.name
            });

            const errorMessage = i18n.translate(lang, 'music.error_processing_request');
            try {
                await interaction.editReply({ content: errorMessage, embeds: [], components: [] });
            } catch (replyErr) {
                // Interaction may have been deleted or expired
            }
        }
    },

    /**
     * Handle manual search with selection menu (autoselect: false)
     */
    async handleManualSearch(distube, query, interaction, voiceChannel, platform, lang) {
        try {
            logger.info('MUSIC', `Manual search for: ${query}`);

            const searchingMessage = i18n.translate(lang, 'music.searching_for', { query });
            await interaction.editReply(searchingMessage);

            // Use yt-dlp to search for results
            let searchResults;
            try {
                searchResults = await ytdlpSearch(query, 5);
            } catch (searchErr) {
                logger.error('MUSIC', `Search failed: ${searchErr.message}`);
                return await interaction.editReply(i18n.translate(lang, 'music.no_search_results_found'));
            }

            if (!searchResults || searchResults.length === 0) {
                return await interaction.editReply(i18n.translate(lang, 'music.no_search_results_found'));
            }

            // Build selection menu
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`music_select_${interaction.user.id}`)
                .setPlaceholder(i18n.translate(lang, 'music.choose_song_to_play'))
                .addOptions(
                    searchResults.map((result, index) => ({
                        label: (result.name || result.title || 'Unknown').substring(0, 100),
                        description: `${result.uploader?.name || result.author || 'Unknown'} \u2022 ${result.formattedDuration || '?:??'}`.substring(0, 100),
                        value: `${index}`,
                        emoji: '\uD83C\uDFB5'
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const searchEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(i18n.translate(lang, 'music.search_results'))
                .setDescription(i18n.translate(lang, 'music.found_results_for', { count: searchResults.length, query }))
                .addFields(
                    searchResults.map((result, index) => ({
                        name: `${index + 1}. ${result.name || result.title || 'Unknown'}`,
                        value: `\uD83D\uDC64 ${result.uploader?.name || result.author || 'Unknown'}\n\u23F1\uFE0F ${result.formattedDuration || '?:??'}`,
                        inline: true
                    }))
                )
                .setFooter({ text: i18n.translate(lang, 'music.selection_expires_30_seconds') })
                .setTimestamp();

            await interaction.editReply({
                content: '',
                embeds: [searchEmbed],
                components: [row]
            });

            // Wait for user selection
            try {
                const filter = (i) => i.customId === `music_select_${interaction.user.id}` && i.user.id === interaction.user.id;
                const collected = await interaction.channel.awaitMessageComponent({
                    filter,
                    time: 30000
                });

                const selectedIndex = parseInt(collected.values[0]);
                const selectedResult = searchResults[selectedIndex];

                await collected.deferUpdate();

                // Show selected song embed
                const selectedEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(i18n.translate(lang, 'music.song_selected'))
                    .setDescription(`**${selectedResult.name || selectedResult.title}**`)
                    .addFields(
                        { name: i18n.translate(lang, 'music.channel'), value: selectedResult.uploader?.name || selectedResult.author || 'Unknown', inline: true },
                        { name: i18n.translate(lang, 'music.duration'), value: selectedResult.formattedDuration || '?:??', inline: true },
                        { name: i18n.translate(lang, 'music.selected_by'), value: interaction.user.tag, inline: true }
                    )
                    .setThumbnail(selectedResult.thumbnail || null)
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [selectedEmbed],
                    components: []
                });

                // Play the selected result via DisTube
                await interaction.client.distube.play(voiceChannel, selectedResult.url || selectedResult, {
                    textChannel: interaction.channel,
                    member: interaction.member,
                    metadata: {
                        interaction,
                        requestedBy: interaction.user.tag,
                        requestedByUserId: interaction.user.id,
                    },
                });

            } catch (timeoutError) {
                // Auto-select first result on timeout
                logger.warn('MUSIC', 'Selection timeout, auto-selecting first result');

                const firstResult = searchResults[0];

                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#ff9500')
                    .setTitle(i18n.translate(lang, 'music.selection_timeout'))
                    .setDescription(i18n.translate(lang, 'music.auto_selected_timeout', { title: firstResult.name || firstResult.title }))
                    .addFields(
                        { name: i18n.translate(lang, 'music.channel'), value: firstResult.uploader?.name || firstResult.author || 'Unknown', inline: true },
                        { name: i18n.translate(lang, 'music.duration'), value: firstResult.formattedDuration || '?:??', inline: true }
                    )
                    .setThumbnail(firstResult.thumbnail || null)
                    .setFooter({ text: i18n.translate(lang, 'music.auto_selected_due_to_timeout') })
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [timeoutEmbed],
                    components: []
                });

                await interaction.client.distube.play(voiceChannel, firstResult.url || firstResult, {
                    textChannel: interaction.channel,
                    member: interaction.member,
                    metadata: {
                        interaction,
                        requestedBy: interaction.user.tag,
                        requestedByUserId: interaction.user.id,
                    },
                });
            }

        } catch (error) {
            logger.error('MUSIC', `Manual search error: ${error.message}`);
            throw error;
        }
    },

    /**
     * Check if a string is a URL
     */
    isUrl(str) {
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    },

    formatViews(views) {
        if (!views) return 'Unknown';
        if (views >= 1000000) {
            return `${(views / 1000000).toFixed(1)}M views`;
        } else if (views >= 1000) {
            return `${(views / 1000).toFixed(1)}K views`;
        } else {
            return `${views} views`;
        }
    },
};
