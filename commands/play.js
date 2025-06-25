const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer } = require('@discordjs/voice');
const Database = require('../utils/database.js');
const Youtube = require('../Plugins/Youtube.js');
const SoundCloud = require('../Plugins/SoundCloud.js');
const Spotify = require('../Plugins/Spotify.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a YouTube video or search for music')
        .setDescriptionLocalizations({
            vi: 'Phát video YouTube hoặc tìm kiếm nhạc'
        })
        .addStringOption(option =>
            option                .setName('query')
                .setDescription('YouTube URL, SoundCloud URL, Spotify URL, or search query')
                .setDescriptionLocalizations({
                    vi: 'URL YouTube, URL SoundCloud, URL Spotify, hoặc từ khóa tìm kiếm'
                })
                .setRequired(true))        .addStringOption(option =>
            option
                .setName('platform')
                .setDescription('Choose platform to search (default: auto-detect)')
                .setDescriptionLocalizations({
                    vi: 'Chọn nền tảng để tìm kiếm (mặc định: tự động phát hiện)'
                })                .addChoices(
                    { name: 'Auto-detect', value: 'auto' },
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'SoundCloud', value: 'soundcloud' },
                    { name: 'Spotify', value: 'spotify' }
                )
                .setRequired(false))
        .addBooleanOption(option =>
            option
                .setName('autoselect')
                .setDescription('Auto-select first result (default: true)')
                .setDescriptionLocalizations({
                    vi: 'Tự động chọn kết quả đầu tiên (mặc định: có)'
                })
                .setRequired(false)),    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const query = interaction.options.getString('query');
        const platform = interaction.options.getString('platform') || 'auto';
        const autoSelect = interaction.options.getBoolean('autoselect') ?? true;
        
        const lang = await i18n.getLanguage(guildId, userId);
        
        // Check if user is in a voice channel
        if (!interaction.member.voice.channel) {
            return interaction.reply({
                content: i18n.translate(lang, 'common.voice_channel_required'),
                flags: [4096]
            });
        }

        await interaction.deferReply();        try {
            const db = new Database();
            const youtube = new Youtube();
            const soundcloud = new SoundCloud();
            const spotify = new Spotify();
            let songToPlay = null;

            // Determine platform and URL type
            if (youtube.isVideoUrl(query)) {
                // Handle YouTube direct URL
                songToPlay = await this.handleYouTubeDirectUrl(youtube, query, interaction, lang);
            } else if (youtube.isPlaylistUrl(query)) {
                // Handle YouTube playlist URL
                return await this.handleYouTubePlaylist(youtube, query, interaction, db, guildId, lang);
            } else if (soundcloud.isSoundCloudUrl(query)) {
                if (soundcloud.isTrackUrl(query)) {
                    // Handle SoundCloud track URL
                    songToPlay = await this.handleSoundCloudDirectUrl(soundcloud, query, interaction, lang);
                } else if (soundcloud.isPlaylistUrl(query)) {
                    // Handle SoundCloud playlist URL
                    return await this.handleSoundCloudPlaylist(soundcloud, query, interaction, db, guildId, lang);
                }
            } else if (spotify.isSpotifyUrl(query)) {
                if (spotify.isTrackUrl(query)) {
                    // Handle Spotify track URL (with YouTube/SoundCloud fallback)
                    songToPlay = await this.handleSpotifyTrack(spotify, youtube, soundcloud, query, interaction, lang);
                } else if (spotify.isPlaylistUrl(query)) {
                    // Handle Spotify playlist URL
                    return await this.handleSpotifyPlaylist(spotify, youtube, soundcloud, query, interaction, db, guildId, lang);
                } else if (spotify.isAlbumUrl(query)) {
                    // Handle Spotify album URL
                    return await this.handleSpotifyAlbum(spotify, youtube, soundcloud, query, interaction, db, guildId, lang);
                }
            } else {
                // Handle search query
                if (autoSelect) {
                    songToPlay = await this.handleAutoSearch(youtube, soundcloud, spotify, query, interaction, platform, lang);
                } else {
                    return await this.handleManualSearch(youtube, soundcloud, spotify, query, interaction, db, guildId, platform, lang);
                }
            }

            if (!songToPlay) {
                return await interaction.editReply('❌ Could not find or process the requested song.');
            }

            // Add to queue and play
            await this.playOrQueue(songToPlay, interaction, db, guildId, lang);

        } catch (error) {
            logger.error('MUSIC', 'Error in play command', {
                error: error.message,
                stack: error.stack,
                query,
                user: interaction.user.tag,
                guild: interaction.guild.name
            });

            await interaction.editReply('❌ An error occurred while processing your request.');
        }
    },

    async handleYouTubeDirectUrl(youtube, url, interaction, lang) {
        try {
            logger.info('MUSIC', `Processing direct URL: ${url}`);
            
            const videoInfo = await youtube.getYoutubeInfo(url);
            
            if (!videoInfo.streamingData || !videoInfo.streamingData.adaptiveFormats) {
                throw new Error('No audio streams available');
            }

            const audioFormats = videoInfo.streamingData.adaptiveFormats.filter(format => 
                format.mimeType && format.mimeType.includes('audio') && 
                format.url && format.contentLength
            );

            if (audioFormats.length === 0) {
                throw new Error('No valid audio formats found');
            }

            const sortedFormats = audioFormats.sort((a, b) => {
                if (a.mimeType.includes('mp4') && !b.mimeType.includes('mp4')) return -1;
                if (!a.mimeType.includes('mp4') && b.mimeType.includes('mp4')) return 1;
                return (b.averageBitrate || 0) - (a.averageBitrate || 0);
            });

            const bestFormat = sortedFormats[0];
            const videoId = this.extractVideoId(url);

            return {
                title: videoInfo.title,
                author: videoInfo.author,
                thumbnail: videoInfo.thumbnail,
                audioUrl: bestFormat.url,
                originalUrl: url,
                videoId: videoId,
                quality: bestFormat.audioQuality,
                requestedBy: interaction.user.tag,
                addedAt: Date.now()
            };
        } catch (error) {
            console.error('Error handling direct URL:', error);
            throw error;
        }
    },    async handleAutoSearch(youtube, soundcloud, spotify, query, interaction, platform, lang) {
        try {
            // Check if query is null, undefined, or empty
            if (!query || query.trim() === '') {
                await interaction.editReply('❌ No search query provided.');
                return null;
            }

            logger.info('MUSIC', `Auto-searching for: ${query} on platform: ${platform}`);
              // Use fallback text if i18n fails with the query parameter
            let searchingMessage;
            try {
                searchingMessage = i18n.translate(lang, 'music.searching_for', { query });
            } catch (i18nError) {
                console.error('i18n error in search message:', i18nError);
                searchingMessage = `🔍 Searching for: **${query}**...`;
            }
            
            await interaction.editReply(searchingMessage);
            
            let firstResult = null;
            let usedPlatform = platform;

            // Search based on platform preference
            if (platform === 'spotify') {
                firstResult = await spotify.getFirstSearchResult(query);
                if (firstResult) {
                    usedPlatform = 'spotify';
                } else if (platform === 'auto') {
                    // Fallback to YouTube then SoundCloud
                    try {
                        firstResult = await youtube.getFirstSearchResult(query);
                        usedPlatform = 'youtube';
                    } catch (error) {
                        firstResult = await soundcloud.getFirstSearchResult(query);
                        usedPlatform = 'soundcloud';
                    }
                }
            } else if (platform === 'soundcloud') {
                firstResult = await soundcloud.getFirstSearchResult(query);
                if (!firstResult && platform === 'auto') {
                    // Fallback to YouTube
                    firstResult = await youtube.getFirstSearchResult(query);
                    usedPlatform = 'youtube';
                }
            } else if (platform === 'youtube') {
                firstResult = await youtube.getFirstSearchResult(query);
            } else { // auto
                // Try YouTube first, then SoundCloud, then Spotify
                try {
                    firstResult = await youtube.getFirstSearchResult(query);
                    usedPlatform = 'youtube';
                } catch (error) {
                    try {
                        console.log('YouTube search failed, trying SoundCloud...');
                        firstResult = await soundcloud.getFirstSearchResult(query);
                        usedPlatform = 'soundcloud';
                    } catch (scError) {
                        console.log('SoundCloud search failed, trying Spotify...');
                        firstResult = await spotify.getFirstSearchResult(query);
                        usedPlatform = 'spotify';
                    }
                }
            }

            if (!firstResult) {                let noResultsMessage;
                try {
                    noResultsMessage = i18n.translate(lang, 'music.no_search_results_found');
                } catch (i18nError) {
                    console.error('i18n error in no results message:', i18nError);
                    noResultsMessage = '❌ No search results found.';
                }
                await interaction.editReply(noResultsMessage);
                return null;
            }

            // Get detailed info for the first result
            let songInfo;
            if (usedPlatform === 'spotify') {
                // For Spotify, we need to find audio source from YouTube/SoundCloud
                songInfo = await this.handleSpotifyTrack(spotify, youtube, soundcloud, firstResult.url, interaction, lang);
            } else if (usedPlatform === 'soundcloud') {
                songInfo = await this.handleSoundCloudDirectUrl(soundcloud, firstResult.url, interaction, lang);
            } else {
                songInfo = await this.handleYouTubeDirectUrl(youtube, firstResult.url, interaction, lang);
            }
            
            // Update the reply to show what was auto-selected with safe i18n calls
            let autoSelectedTitle, channelLabel, durationLabel, searchQueryLabel, footerText, platformLabel;
              try {
                autoSelectedTitle = i18n.translate(lang, 'music.auto_selected');
                channelLabel = i18n.translate(lang, 'music.channel');
                durationLabel = i18n.translate(lang, 'music.duration');
                searchQueryLabel = i18n.translate(lang, 'music.search_query');
                platformLabel = i18n.translate(lang, 'music.platform');
                footerText = i18n.translate(lang, 'music.auto_selected_footer');
            } catch (i18nError) {
                console.error('i18n error in auto-selected labels:', i18nError);
                autoSelectedTitle = '🎵 Auto-Selected';
                channelLabel = '👤 Channel';
                durationLabel = '⏱️ Duration';
                searchQueryLabel = '🔍 Search Query';
                platformLabel = '🌐 Platform';
                footerText = 'Auto-selected first result • Use autoselect:false for manual selection';
            }

            const platformName = usedPlatform === 'spotify' ? 'Spotify' : 
                                 usedPlatform === 'soundcloud' ? 'SoundCloud' : 'YouTube';
            const platformEmoji = usedPlatform === 'spotify' ? '🟢' : 
                                  usedPlatform === 'soundcloud' ? '🟠' : '🔴';
            const embedColor = usedPlatform === 'spotify' ? '#1db954' : 
                              usedPlatform === 'soundcloud' ? '#ff5500' : '#ff0000';

            const autoSelectEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(autoSelectedTitle)
                .setDescription(`**${firstResult.title}**`)
                .addFields(
                    { name: channelLabel, value: firstResult.author, inline: true },
                    { name: durationLabel, value: firstResult.durationFormatted, inline: true },
                    { name: platformLabel, value: `${platformEmoji} ${platformName}`, inline: true },
                    { name: searchQueryLabel, value: query, inline: true }
                )
                .setThumbnail(firstResult.thumbnail)
                .setFooter({ text: footerText })
                .setTimestamp();

            // Add Spotify-specific information if it's from Spotify
            if (usedPlatform === 'spotify' && firstResult.popularity) {
                autoSelectEmbed.addFields(
                    { name: '🔥 Popularity', value: spotify.formatPopularity(firstResult.popularity), inline: true }
                );
            }

            await interaction.editReply({ content: '', embeds: [autoSelectEmbed] });
            
            return songInfo;
        } catch (error) {
            console.error('Error in auto search:', error);
            throw error;
        }
    },

    async handleManualSearch(youtube, soundcloud, spotify, query, interaction, db, guildId, platform, lang) {
        try {
            // Check if query is null, undefined, or empty
            if (!query || query.trim() === '') {
                await interaction.editReply('❌ No search query provided.');
                return;
            }

            logger.info('MUSIC', `Manual search for: ${query}`);
              // Use fallback text if i18n fails with the query parameter
            let searchingMessage;
            try {
                searchingMessage = i18n.translate(lang, 'music.searching_for', { query });
            } catch (i18nError) {
                console.error('i18n error in manual search message:', i18nError);
                searchingMessage = `🔍 Searching for: **${query}**...`;
            }
            
            await interaction.editReply(searchingMessage);
            
            const searchResults = await youtube.searchVideos(query, 5);
            if (searchResults.length === 0) {                let noResultsMessage;
                try {
                    noResultsMessage = i18n.translate(lang, 'music.no_search_results_found');
                } catch (i18nError) {
                    console.error('i18n error in manual search no results:', i18nError);
                    noResultsMessage = '❌ No search results found.';
                }
                return await interaction.editReply(noResultsMessage);
            }            // Safe i18n translations with fallbacks
            let chooseLabel, searchResultsTitle, foundResultsText, selectionExpires, waitingText;
            
            try {
                chooseLabel = i18n.translate(lang, 'music.choose_song_to_play');
                searchResultsTitle = i18n.translate(lang, 'music.search_results');
                foundResultsText = i18n.translate(lang, 'music.found_results_for', { count: searchResults.length, query });
                selectionExpires = i18n.translate(lang, 'music.selection_expires_30_seconds');
                waitingText = i18n.translate(lang, 'music.waiting_for_selection');
            } catch (i18nError) {
                console.error('i18n error in manual search labels:', i18nError);
                chooseLabel = 'Choose a song to play';
                searchResultsTitle = '🔍 Search Results';
                foundResultsText = `Found ${searchResults.length} results for: **${query}**\n\nSelect a song from the menu below:`;
                selectionExpires = 'Selection expires in 30 seconds';
                waitingText = 'Waiting for selection...';
            }

            // Create selection menu
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`music_select_${interaction.user.id}`)
                .setPlaceholder(chooseLabel)
                .addOptions(
                    searchResults.map((result, index) => ({
                        label: result.title.length > 100 ? result.title.substring(0, 97) + '...' : result.title,
                        description: `${result.author} • ${result.durationFormatted}`,
                        value: `${index}`,
                        emoji: '🎵'
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const searchEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(searchResultsTitle)
                .setDescription(foundResultsText)
                .addFields(
                    searchResults.map((result, index) => ({
                        name: `${index + 1}. ${result.title}`,
                        value: `👤 ${result.author}\n⏱️ ${result.durationFormatted}\n👀 ${this.formatViews(result.views)}`,
                        inline: true
                    }))
                )
                .setFooter({ text: selectionExpires })
                .setTimestamp();

            await interaction.editReply({
                content: '',
                embeds: [searchEmbed],
                components: [row]
            });

            // Wait for user selection
            try {
                const filter = (i) => i.customId === `music_select_${interaction.user.id}` && i.user.id === interaction.user.id;
                const collected = await interaction.followUp({ 
                    content: waitingText, 
                    flags: [4096] // ephemeral
                }).then(() => 
                    interaction.channel.awaitMessageComponent({ 
                        filter, 
                        time: 30000 
                    })
                );

                const selectedIndex = parseInt(collected.values[0]);
                const selectedResult = searchResults[selectedIndex];

                await collected.deferUpdate();                // Process the selected song
                const songInfo = await this.handleYouTubeDirectUrl(youtube, selectedResult.url, interaction, lang);
                  // Safe i18n for selected song embed
                let songSelectedTitle, channelLabel, durationLabel, viewsLabel, selectedByLabel;
                
                try {
                    songSelectedTitle = i18n.translate(lang, 'music.song_selected');
                    channelLabel = i18n.translate(lang, 'music.channel');
                    durationLabel = i18n.translate(lang, 'music.duration');
                    viewsLabel = i18n.translate(lang, 'music.views');
                    selectedByLabel = i18n.translate(lang, 'music.selected_by');
                } catch (i18nError) {
                    console.error('i18n error in selected song labels:', i18nError);
                    songSelectedTitle = '🎵 Song Selected';
                    channelLabel = '👤 Channel';
                    durationLabel = '⏱️ Duration';
                    viewsLabel = '👀 Views';
                    selectedByLabel = '👤 Selected by';
                }

                // Update the original message
                const selectedEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(songSelectedTitle)
                    .setDescription(`**${selectedResult.title}**`)
                    .addFields(
                        { name: channelLabel, value: selectedResult.author, inline: true },
                        { name: durationLabel, value: selectedResult.durationFormatted, inline: true },
                        { name: viewsLabel, value: this.formatViews(selectedResult.views), inline: true },
                        { name: selectedByLabel, value: interaction.user.tag, inline: true }
                    )
                    .setThumbnail(selectedResult.thumbnail)
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [selectedEmbed],
                    components: []
                });

                await this.playOrQueue(songInfo, interaction, db, guildId, lang);

            } catch (timeoutError) {
                // Auto-select first result on timeout
                logger.warn('MUSIC', 'Selection timeout, auto-selecting first result');
                  const firstResult = searchResults[0];
                const songInfo = await this.handleYouTubeDirectUrl(youtube, firstResult.url, interaction, lang);                // Safe i18n for timeout embed
                let timeoutTitle, autoSelectedTimeoutText, channelLabel, durationLabel, footerText;
                
                try {
                    timeoutTitle = i18n.translate(lang, 'music.selection_timeout');
                    autoSelectedTimeoutText = i18n.translate(lang, 'music.auto_selected_timeout', { title: firstResult.title });
                    channelLabel = i18n.translate(lang, 'music.channel');
                    durationLabel = i18n.translate(lang, 'music.duration');
                    footerText = i18n.translate(lang, 'music.auto_selected_due_to_timeout');
                } catch (i18nError) {
                    console.error('i18n error in timeout labels:', i18nError);
                    timeoutTitle = '⏰ Selection Timeout';
                    autoSelectedTimeoutText = `Auto-selected: **${firstResult.title}**`;
                    channelLabel = '👤 Channel';
                    durationLabel = '⏱️ Duration';
                    footerText = 'Auto-selected due to timeout';
                }

                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#ff9500')
                    .setTitle(timeoutTitle)
                    .setDescription(autoSelectedTimeoutText)
                    .addFields(
                        { name: channelLabel, value: firstResult.author, inline: true },
                        { name: durationLabel, value: firstResult.durationFormatted, inline: true }
                    )
                    .setThumbnail(firstResult.thumbnail)
                    .setFooter({ text: footerText })
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [timeoutEmbed],
                    components: []
                });

                await this.playOrQueue(songInfo, interaction, db, guildId, lang);
            }

        } catch (error) {
            console.error('Error in manual search:', error);
            throw error;
        }
    },    async handleYouTubePlaylist(youtube, url, interaction, db, guildId, lang) {
        try {
            const playlistInfo = await youtube.getPlaylistInfo(url);
            
            const embed = new EmbedBuilder()
                .setColor('#9932cc')                .setTitle(i18n.translate(lang, 'music.playlist_added'))
                .setDescription(`**${playlistInfo.title}**`)
                .addFields(
                    { name: i18n.translate(lang, 'music.author'), value: playlistInfo.author, inline: true },
                    { name: i18n.translate(lang, 'music.videos'), value: `${playlistInfo.videoCount}`, inline: true },
                    { name: i18n.translate(lang, 'music.requested_by'), value: interaction.user.tag, inline: true }
                )
                .setThumbnail(playlistInfo.thumbnail)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Check if music is currently playing to decide whether to start immediately
            const playerData = musicPlayer.getPlayer(guildId);
            const isCurrentlyPlaying = playerData && musicPlayer.isPlaying(guildId);
            let firstSong = null;

            // Add all videos to queue
            for (let i = 0; i < playlistInfo.videos.length; i++) {
                const video = playlistInfo.videos[i];
                if (video.title && video.url) {
                    const song = {
                        title: video.title,
                        author: video.author,
                        thumbnail: video.thumbnail,
                        originalUrl: video.url,
                        videoId: video.videoId,
                        requestedBy: interaction.user.tag,
                        addedAt: Date.now()
                    };

                    if (i === 0 && !isCurrentlyPlaying) {
                        // Keep first song to play immediately if nothing is playing
                        firstSong = song;
                    } else {
                        // Add the rest to queue
                        await db.addToQueue(guildId, song);
                    }
                }
            }

            // If nothing is playing, start with the first song
            if (firstSong && !isCurrentlyPlaying) {
                await this.playOrQueue(firstSong, interaction, db, guildId, lang);
            }

            logger.music('Playlist Added', interaction.guild, {
                title: playlistInfo.title,
                videoCount: playlistInfo.videoCount
            });

        } catch (error) {
            console.error('Error handling playlist:', error);
            throw error;
        }
    },

    async handleSoundCloudPlaylist(soundcloud, url, interaction, db, guildId, lang) {
        try {
            const playlistInfo = await soundcloud.getPlaylistInfo(url);
            
            const embed = new EmbedBuilder()
                .setColor('#ff5500')                .setTitle(i18n.translate(lang, 'music.playlist_added'))
                .setDescription(`**${playlistInfo.title}**`)
                .addFields(
                    { name: i18n.translate(lang, 'music.author'), value: playlistInfo.author, inline: true },
                    { name: i18n.translate(lang, 'music.tracks'), value: `${playlistInfo.trackCount}`, inline: true },
                    { name: i18n.translate(lang, 'music.platform'), value: '🟠 SoundCloud', inline: true },
                    { name: i18n.translate(lang, 'music.requested_by'), value: interaction.user.tag, inline: true }
                )
                .setThumbnail(playlistInfo.thumbnail)
                .setTimestamp();            await interaction.editReply({ embeds: [embed] });

            // Check if music is currently playing to decide whether to start immediately
            const playerData = musicPlayer.getPlayer(guildId);
            const isCurrentlyPlaying = playerData && musicPlayer.isPlaying(guildId);
            let firstSong = null;

            // Add all tracks to queue
            for (let i = 0; i < playlistInfo.tracks.length; i++) {
                const track = playlistInfo.tracks[i];
                if (track.title && track.url) {
                    // Don't pre-resolve SoundCloud streams as they need to be fresh
                    const song = {
                        title: track.title,
                        author: track.author,
                        thumbnail: track.thumbnail,
                        audioUrl: 'SOUNDCLOUD_STREAM_READY', // Special marker
                        originalUrl: track.url,
                        platform: 'soundcloud',
                        streamReady: true,
                        duration: track.duration,
                        durationFormatted: track.durationFormatted,
                        requestedBy: interaction.user.tag,
                        addedAt: Date.now()
                    };

                    if (i === 0 && !isCurrentlyPlaying) {
                        // Keep first song to play immediately if nothing is playing
                        firstSong = song;
                    } else {
                        // Add the rest to queue
                        await db.addToQueue(guildId, song);
                    }
                }
            }

            // If nothing is playing, start with the first song
            if (firstSong && !isCurrentlyPlaying) {
                await this.playOrQueue(firstSong, interaction, db, guildId, lang);
            }

            logger.music('SoundCloud Playlist Added', interaction.guild, {
                title: playlistInfo.title,
                trackCount: playlistInfo.trackCount
            });

        } catch (error) {
            console.error('Error handling SoundCloud playlist:', error);
            throw error;
        }
    },    async handleSpotifyTrack(spotify, youtube, soundcloud, url, interaction, lang) {
        try {
            logger.info('MUSIC', `Processing Spotify track: ${url}`);
            
            // Get Spotify track info
            const spotifyTrack = await spotify.getTrackInfo(url);
            
            // Warn user about Spotify limitations
            const warningEmbed = new EmbedBuilder()
                .setColor('#ff6b35')
                .setTitle('⚠️ Spotify Audio Limitation')
                .setDescription(
                    `**${spotifyTrack.title}** by ${spotifyTrack.author}\n\n` +
                    '🔒 Spotify doesn\'t allow direct audio streaming for bots.\n' +
                    '🔍 Searching for best match on YouTube/SoundCloud...\n' +
                    '⏱️ Duration matching: ±10 seconds tolerance'
                )
                .setThumbnail(spotifyTrack.thumbnail)
                .setFooter({ text: 'Searching for high-quality match...' })
                .setTimestamp();

            await interaction.editReply({ embeds: [warningEmbed] });
            
            // Use enhanced matching algorithm
            let audioSource = null;
            let matchQuality = 'none';
            
            try {
                const matchResult = await spotify.findBestMatch(spotifyTrack, youtube, soundcloud);
                audioSource = matchResult;
                matchQuality = matchResult.matchQuality;
                
                console.log(`Found ${matchQuality} quality match on ${matchResult.platform}`);
            } catch (error) {
                console.error('Enhanced matching failed:', error);
                
                // Final fallback - basic search
                try {
                    const youtubeResult = await youtube.getFirstSearchResult(spotify.createFallbackSearchQuery(spotifyTrack));
                    if (youtubeResult) {
                        audioSource = await this.handleYouTubeDirectUrl(youtube, youtubeResult.url, interaction, lang);
                        audioSource.platform = 'youtube';
                        audioSource.matchQuality = 'fallback';
                        matchQuality = 'fallback';
                    }
                } catch (fallbackError) {
                    console.error('All fallback attempts failed:', fallbackError);
                    throw new Error('Unable to find any audio source for this Spotify track');
                }
            }
            
            if (!audioSource || !audioSource.audioUrl) {
                throw new Error('No audio source available for this Spotify track');
            }
            
            // Update the warning embed with match results
            const matchEmoji = matchQuality === 'high' ? '✅' : matchQuality === 'low' ? '⚠️' : '❌';
            const matchText = matchQuality === 'high' ? 'High Quality Match' : 
                             matchQuality === 'low' ? 'Approximate Match' : 'Basic Fallback';
            const platformEmoji = audioSource.platform === 'youtube' ? '🔴' : '🟠';
            const platformName = audioSource.platform === 'youtube' ? 'YouTube' : 'SoundCloud';
            
            const resultEmbed = new EmbedBuilder()
                .setColor(matchQuality === 'high' ? '#00ff00' : matchQuality === 'low' ? '#ffaa00' : '#ff5500')
                .setTitle(`${matchEmoji} ${matchText} Found`)
                .setDescription(`**${spotifyTrack.title}** by ${spotifyTrack.author}`)
                .addFields(
                    { name: '🎵 Original', value: `🟢 Spotify`, inline: true },
                    { name: '🔊 Audio Source', value: `${platformEmoji} ${platformName}`, inline: true },
                    { name: '📊 Match Quality', value: matchText, inline: true },
                    { name: '⏱️ Duration', value: spotifyTrack.durationFormatted, inline: true },
                    { name: '💿 Album', value: spotifyTrack.album, inline: true },
                    { name: '🗓️ Release', value: spotifyTrack.releaseDate, inline: true }
                )
                .setThumbnail(spotifyTrack.thumbnail)
                .setFooter({ 
                    text: matchQuality === 'high' ? 
                        'High quality match found with duration verification' :
                        matchQuality === 'low' ?
                        'Approximate match - may not be identical to Spotify version' :
                        'Basic fallback - quality not guaranteed'
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [resultEmbed] });
            
            // Combine Spotify metadata with audio source
            return {
                title: spotifyTrack.title,
                author: spotifyTrack.author,
                album: spotifyTrack.album,
                thumbnail: spotifyTrack.thumbnail,
                audioUrl: audioSource.audioUrl,
                originalUrl: url, // Keep Spotify URL as original
                spotifyUrl: url,
                fallbackUrl: audioSource.originalUrl || audioSource.url,
                platform: 'spotify',
                fallbackPlatform: audioSource.platform || 'youtube',
                matchQuality: matchQuality,
                duration: spotifyTrack.duration,
                durationFormatted: spotifyTrack.durationFormatted,
                popularity: spotifyTrack.popularity,
                explicit: spotifyTrack.explicit,
                releaseDate: spotifyTrack.releaseDate,
                requestedBy: interaction.user.tag,
                addedAt: Date.now()            };
        } catch (error) {
            console.error('Error handling Spotify track:', error);
            
            // Provide helpful error message
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Spotify Track Unavailable')
                .setDescription(
                    '**Unable to play this Spotify track**\n\n' +
                    '🚫 Spotify doesn\'t allow direct audio streaming\n' +
                    '🔍 No matching content found on YouTube/SoundCloud\n\n' +
                    '**Suggestions:**\n' +
                    '• Try searching for the song directly: `/play query:artist song name`\n' +
                    '• Use YouTube or SoundCloud URLs instead\n' +
                    '• Check if the song is available on other platforms'
                )
                .setFooter({ text: 'Try a different song or platform' })
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
            throw error;
        }
    },

    async handleSpotifyPlaylist(spotify, youtube, soundcloud, url, interaction, db, guildId, lang) {
        try {
            const playlistInfo = await spotify.getPlaylistInfo(url);
            
            const embed = new EmbedBuilder()
                .setColor('#1db954') // Spotify green                .setTitle(i18n.translate(lang, 'music.playlist_added'))
                .setDescription(`**${playlistInfo.title}**`)
                .addFields(
                    { name: i18n.translate(lang, 'music.author'), value: playlistInfo.author, inline: true },
                    { name: i18n.translate(lang, 'music.tracks'), value: `${playlistInfo.trackCount}`, inline: true },
                    { name: i18n.translate(lang, 'music.platform'), value: '🟢 Spotify', inline: true },
                    { name: i18n.translate(lang, 'music.requested_by'), value: interaction.user.tag, inline: true }
                )
                .setThumbnail(playlistInfo.thumbnail)
                .setFooter({ text: 'Audio will be sourced from YouTube/SoundCloud' })
                .setTimestamp();            await interaction.editReply({ embeds: [embed] });

            // Check if music is currently playing to decide whether to start immediately
            const playerData = musicPlayer.getPlayer(guildId);
            const isCurrentlyPlaying = playerData && musicPlayer.isPlaying(guildId);
            let firstSong = null;

            // Add tracks to queue (this will be processed when they're played)
            for (let i = 0; i < playlistInfo.tracks.length; i++) {
                const track = playlistInfo.tracks[i];
                if (track.title && track.searchQuery) {
                    const song = {
                        title: track.title,
                        author: track.author,
                        album: track.album,
                        thumbnail: track.thumbnail,
                        originalUrl: track.url, // Spotify URL
                        platform: 'spotify',
                        duration: track.duration,
                        durationFormatted: track.durationFormatted,
                        searchQuery: track.searchQuery, // For fallback search
                        requestedBy: interaction.user.tag,
                        addedAt: Date.now()
                    };

                    if (i === 0 && !isCurrentlyPlaying) {
                        // Keep first song to play immediately if nothing is playing
                        firstSong = song;
                    } else {
                        // Add the rest to queue
                        await db.addToQueue(guildId, song);
                    }
                }
            }

            // If nothing is playing, start with the first song
            if (firstSong && !isCurrentlyPlaying) {
                await this.playOrQueue(firstSong, interaction, db, guildId, lang);
            }

            logger.music('Spotify Playlist Added', interaction.guild, {
                title: playlistInfo.title,
                trackCount: playlistInfo.trackCount
            });

        } catch (error) {
            console.error('Error handling Spotify playlist:', error);
            throw error;
        }
    },

    async handleSpotifyAlbum(spotify, youtube, soundcloud, url, interaction, db, guildId, lang) {
        try {
            const albumInfo = await spotify.getAlbumInfo(url);
            
            const embed = new EmbedBuilder()
                .setColor('#1db954') // Spotify green                .setTitle(i18n.translate(lang, 'music.album_added'))
                .setDescription(`**${albumInfo.title}**`)
                .addFields(
                    { name: i18n.translate(lang, 'music.author'), value: albumInfo.author, inline: true },
                    { name: i18n.translate(lang, 'music.tracks'), value: `${albumInfo.trackCount}`, inline: true },
                    { name: i18n.translate(lang, 'music.platform'), value: '🟢 Spotify', inline: true },
                    { name: i18n.translate(lang, 'music.release_date'), value: albumInfo.releaseDate, inline: true },
                    { name: i18n.translate(lang, 'music.requested_by'), value: interaction.user.tag, inline: true }
                )
                .setThumbnail(albumInfo.thumbnail)
                .setFooter({ text: 'Audio will be sourced from YouTube/SoundCloud' })
                .setTimestamp();            await interaction.editReply({ embeds: [embed] });

            // Check if music is currently playing to decide whether to start immediately
            const playerData = musicPlayer.getPlayer(guildId);
            const isCurrentlyPlaying = playerData && musicPlayer.isPlaying(guildId);
            let firstSong = null;

            // Add tracks to queue
            for (let i = 0; i < albumInfo.tracks.length; i++) {
                const track = albumInfo.tracks[i];
                if (track.title && track.searchQuery) {
                    const song = {
                        title: track.title,
                        author: track.author,
                        album: track.album,
                        thumbnail: track.thumbnail,
                        originalUrl: track.url, // Spotify URL
                        platform: 'spotify',
                        duration: track.duration,
                        durationFormatted: track.durationFormatted,
                        searchQuery: track.searchQuery, // For fallback search
                        requestedBy: interaction.user.tag,
                        addedAt: Date.now()
                    };

                    if (i === 0 && !isCurrentlyPlaying) {
                        // Keep first song to play immediately if nothing is playing
                        firstSong = song;
                    } else {
                        // Add the rest to queue
                        await db.addToQueue(guildId, song);
                    }
                }
            }

            // If nothing is playing, start with the first song
            if (firstSong && !isCurrentlyPlaying) {
                await this.playOrQueue(firstSong, interaction, db, guildId, lang);
            }

            logger.music('Spotify Album Added', interaction.guild, {
                title: albumInfo.title,
                trackCount: albumInfo.trackCount
            });

        } catch (error) {
            console.error('Error handling Spotify album:', error);
            throw error;
        }
    },

    async playOrQueue(song, interaction, db, guildId, lang) {
        const playerData = musicPlayer.getPlayer(guildId);
        
        if (!playerData || !musicPlayer.isPlaying(guildId)) {
            // Start playing immediately
            const connection = joinVoiceChannel({
                channelId: interaction.member.voice.channel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            const player = createAudioPlayer();
            musicPlayer.setPlayer(guildId, player, connection);
            musicPlayer.setupPlayerEvents(guildId, player);
            connection.subscribe(player);            // Get detailed audio info if needed
            if (!song.audioUrl) {
                if (song.platform === 'spotify') {
                    // For Spotify, we need to search for the audio on YouTube/SoundCloud
                    const spotify = new Spotify();
                    const youtube = new Youtube();
                    const soundcloud = new SoundCloud();
                    
                    let searchQuery = song.searchQuery || `${song.author} ${song.title}`;
                    
                    try {
                        // Try YouTube first
                        const youtubeResult = await youtube.getFirstSearchResult(searchQuery);
                        if (youtubeResult) {
                            const audioSource = await this.handleYouTubeDirectUrl(youtube, youtubeResult.url, interaction, lang);
                            song.audioUrl = audioSource.audioUrl;
                            song.fallbackUrl = youtubeResult.url;
                            song.fallbackPlatform = 'youtube';
                        }
                    } catch (error) {
                        try {
                            // Try SoundCloud as fallback
                            const soundcloudResult = await soundcloud.getFirstSearchResult(searchQuery);
                            if (soundcloudResult) {
                                song.audioUrl = await soundcloud.getStreamUrl(soundcloudResult.url);
                                song.fallbackUrl = soundcloudResult.url;
                                song.fallbackPlatform = 'soundcloud';
                            }
                        } catch (scError) {
                            console.error('Failed to find audio source for Spotify track:', scError);
                            throw new Error('Could not find audio source for Spotify track');
                        }
                    }
                } else if (song.platform === 'soundcloud') {
                    const soundcloud = new SoundCloud();
                    song.audioUrl = await soundcloud.getStreamUrl(song.originalUrl);
                } else {
                    const youtube = new Youtube();
                    const detailedInfo = await youtube.getYoutubeInfo(song.originalUrl);
                    const audioFormats = detailedInfo.streamingData.adaptiveFormats.filter(format => 
                        format.mimeType && format.mimeType.includes('audio')
                    );
                    song.audioUrl = audioFormats[0]?.url;
                }
            }

            await musicPlayer.playSong(guildId, song);            const playingEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(i18n.translate(lang, 'music.now_playing'))
                .setDescription(`**${song.title}**`)
                .addFields(
                    { name: i18n.translate(lang, 'music.channel'), value: song.author, inline: true },
                    { name: i18n.translate(lang, 'music.requested_by'), value: song.requestedBy, inline: true }
                )
                .setThumbnail(song.thumbnail)
                .setTimestamp();

            await interaction.followUp({ embeds: [playingEmbed] });

            logger.music('Now Playing', interaction.guild, song);
        } else {
            // Add to queue
            await db.addToQueue(guildId, song);
            const queuePosition = (await db.getQueue(guildId)).length;            const queueEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(i18n.translate(lang, 'music.added_to_queue'))
                .setDescription(`**${song.title}**`)
                .addFields(
                    { name: i18n.translate(lang, 'music.channel'), value: song.author, inline: true },
                    { name: '📍 Queue Position', value: `${queuePosition}`, inline: true },
                    { name: i18n.translate(lang, 'music.requested_by'), value: song.requestedBy, inline: true }
                )
                .setThumbnail(song.thumbnail)
                .setTimestamp();

            await interaction.followUp({ embeds: [queueEmbed] });

            logger.music('Added to Queue', interaction.guild, song);
        }
    },

    extractVideoId(url) {
        const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
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
    },    async handleSoundCloudDirectUrl(soundcloud, url, interaction, lang) {
        try {
            logger.info('MUSIC', `Processing SoundCloud URL: ${url}`);
            
            const trackInfo = await soundcloud.getTrackInfo(url);
            
            // Don't pre-resolve stream URL since SoundCloud streams need to be fresh
            // Mark it as ready for streaming instead
            return {
                title: trackInfo.title,
                author: trackInfo.author,
                thumbnail: trackInfo.thumbnail,
                audioUrl: 'SOUNDCLOUD_STREAM_READY', // Special marker
                originalUrl: url,
                platform: 'soundcloud',
                streamReady: true,
                duration: trackInfo.duration,
                durationFormatted: trackInfo.durationFormatted,
                plays: trackInfo.plays,
                genre: trackInfo.genre,
                requestedBy: interaction.user.tag,
                addedAt: Date.now()
            };
        } catch (error) {
            console.error('Error handling SoundCloud direct URL:', error);
            throw error;
        }
    },
};