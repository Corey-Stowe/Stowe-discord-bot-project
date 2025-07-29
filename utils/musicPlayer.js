const { createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const Database = require('./database.js');
const Youtube = require('../Plugins/Youtube.js');
const AudioDownloader = require('./audioDownloader.js');
const preset24h = require('./preset24h.js');
const fs = require('fs');
const path = require('path');

// Cache configuration from environment variables
const CACHE_CONFIG = {
    maxSizeMB: parseInt(process.env.CACHE_MAX_SIZE_MB) || 500, // Default 500 MB
    cleanupCountPerBatch: parseInt(process.env.CACHE_CLEANUP_COUNT) || 5, // Delete 5 files per cleanup
    autoCleanupEnabled: process.env.CACHE_AUTO_CLEANUP !== 'false', // Default enabled
    downloadDir: path.join(__dirname, '../downloads')
};

// Store players for each guild
const players = new Map();

class MusicPlayer {
    constructor() {
        this.db = new Database();
        this.youtube = new Youtube();
        this.downloader = new AudioDownloader();
        this.preset24h = preset24h;
        
        // Pre-download queue management
        this.downloadQueue = new Map(); // guildId -> { songs: [], downloading: boolean, lastDownload: timestamp }
        this.downloadCooldown = 35000; // 35 seconds between downloads
        this.maxPreDownloads = 5; // Maximum songs to pre-download per guild
        
        // Disconnect delays
        this.disconnectTimers = new Map(); // guildId -> timeoutId
        this.disconnectDelay = 60000; // 60 seconds before auto-disconnect
    }

    getPlayer(guildId) {
        return players.get(guildId) || null;
    }
    
    // URL detection methods
    isSoundCloudUrl(url) {
        if (!url) return false;
        return url.includes('soundcloud.com');
    }

    isSpotifyUrl(url) {
        if (!url) return false;
        return url.includes('spotify.com') || url.includes('open.spotify.com');
    }

    isYouTubeUrl(url) {
        if (!url) return false;
        return url.includes('youtube.com') || url.includes('youtu.be');
    }

    // Helper method to check if URL is expired (for download optimization)
    isUrlExpired(url) {
        if (!url) return true;
        // YouTube URLs typically expire after ~6 hours
        // This is a simple heuristic - in practice you'd want more sophisticated expiration detection
        return false; // For now, assume URLs are valid
    }

    setPlayer(guildId, player, connection) {
        players.set(guildId, { player, connection, currentSong: null, retryCount: 0 });
        
        // Monitor connection state
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            console.log('Voice connection disconnected');
            try {
                await Promise.race([
                    new Promise((resolve) => connection.once(VoiceConnectionStatus.Connecting, resolve)),
                    new Promise((resolve) => setTimeout(resolve, 5000))
                ]);
                
                if (connection.state.status !== VoiceConnectionStatus.Ready) {
                    console.log('Connection failed to reconnect, cleaning up');
                    players.delete(guildId);
                    connection.destroy();
                }
            } catch (error) {
                console.error('Connection error:', error);
                players.delete(guildId);
                connection.destroy();
            }
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log('Voice connection destroyed');
            players.delete(guildId);
        });
    }

    async refreshStreamUrl(song) {
        try {
            console.log('Refreshing stream URL for:', song.title);
            const videoInfo = await this.youtube.getYoutubeInfo(song.originalUrl || `https://youtube.com/watch?v=${song.videoId}`);
            
            if (videoInfo.streamingData && videoInfo.streamingData.adaptiveFormats) {
                const audioFormats = videoInfo.streamingData.adaptiveFormats.filter(format => 
                    format.mimeType && format.mimeType.includes('audio')
                );
                
                if (audioFormats.length > 0) {
                    const bestAudio = audioFormats.find(format => 
                        format.mimeType.includes('audio/mp4') || format.mimeType.includes('audio/webm')
                    ) || audioFormats[0];
                    
                    return bestAudio.url;
                }
            }
            return null;
        } catch (error) {
            console.error('Error refreshing stream URL:', error);
            return null;
        }
    }

    async playNext(guildId) {
        const playerData = players.get(guildId);
        if (!playerData) return;

        try {
            // Check if 24/7 mode is enabled
            const mode24h = await this.db.get24hMode(guildId);
            
            // Safely get loop mode with fallback
            let loopMode = 'off';
            try {
                loopMode = await this.db.getLoopMode(guildId);
            } catch (error) {
                console.error('Failed to get loop mode, using default:', error);
                loopMode = 'off';
            }
            
            // Handle loop modes for current song
            if (loopMode === 'single' && playerData.currentSong) {
                console.log('Looping current song');
                await this.playSong(guildId, playerData.currentSong);
                return;
            }

            // Get next song from queue
            const queue = await this.db.getQueue(guildId);
            
            // If queue has songs, play from queue
            if (queue.length > 0) {
                const nextSong = queue[0];
                await this.db.removeFromQueue(guildId, 0);
                await this.playSong(guildId, nextSong);

                // If queue loop is enabled, add the song back to the end of queue
                if (loopMode === 'queue') {
                    try {
                        await this.db.addToQueue(guildId, nextSong);
                    } catch (error) {
                        console.error('Failed to add song back to queue for loop:', error);
                    }
                }

                // 🚀 Start pre-downloading remaining songs in queue
                // Check the queue again after removal to get accurate count
                const remainingQueue = await this.db.getQueue(guildId);
                if (remainingQueue.length > 0) { // If there are more songs to download
                    setTimeout(() => {
                        this.startQueuePreDownload(guildId);
                    }, 2000); // Small delay to not interfere with current playback
                }

                return;
            }

            // If no queue songs and 24/7 mode is enabled, play preset music
            if (mode24h.enabled) {
                const presetSong = this.preset24h.getNextSong();
                if (presetSong) {
                    console.log(`Playing 24/7 preset: ${presetSong.title}`);
                    await this.playPresetSong(guildId, presetSong);
                    return;
                } else {
                    console.log('No preset songs available for 24/7 mode');
                }
            }

            // If no songs available, schedule disconnect with delay (only if not in 24/7 mode)
            if (!mode24h.enabled) {
                console.log('Queue empty, scheduling disconnect with 60s delay...');
                this.scheduleDisconnect(guildId, 'Queue empty');
            }

        } catch (error) {
            console.error('Error in playNext:', error);
            const mode24h = await this.db.get24hMode(guildId);
            if (!mode24h.enabled) {
                this.scheduleDisconnect(guildId, 'Error in playNext');
            }
        }
    }

    async playPresetSong(guildId, presetSong) {
        const playerData = players.get(guildId);
        if (!playerData) return;

        try {
            console.log(`Playing preset song: ${presetSong.title}`);
            
            const resource = this.preset24h.createAudioResource(presetSong);
            if (!resource) {
                console.error('Failed to create audio resource for preset song');
                await this.playNext(guildId); // Try next song
                return;
            }
            
            playerData.player.play(resource);
            playerData.currentSong = presetSong;
            playerData.retryCount = 0;
            
            console.log(`Now playing preset: ${presetSong.title}`);
        } catch (error) {
            console.error('Error playing preset song:', error);
            // Try next preset song
            setTimeout(() => {
                this.playNext(guildId);
            }, 3000);
        }
    }

    async start24hMode(guildId, channelId) {
        try {
            // Check if already connected
            if (players.has(guildId)) {
                return { success: false, message: 'Bot is already playing music' };
            }

            // Check if preset playlist has songs
            const playlistInfo = this.preset24h.getPlaylistInfo();
            if (!playlistInfo.hasValidSongs) {
                return { success: false, message: 'No preset songs found. Please add music files to the preset folder.' };
            }

            // Enable 24/7 mode in database
            await this.db.set24hMode(guildId, true, channelId);

            return { success: true, message: '24/7 mode will start when music is played' };
        } catch (error) {
            console.error('Error starting 24/7 mode:', error);
            return { success: false, message: 'Failed to start 24/7 mode' };
        }
    }

    async stop24hMode(guildId) {
        try {
            // Disable 24/7 mode in database
            await this.db.set24hMode(guildId, false);
            
            // Clear queue and disconnect if currently playing preset
            const playerData = players.get(guildId);
            if (playerData && playerData.currentSong && playerData.currentSong.isPreset) {
                await this.db.clearQueue(guildId);
                this.disconnect(guildId);
            }

            return { success: true, message: '24/7 mode disabled' };
        } catch (error) {
            console.error('Error stopping 24/7 mode:', error);
            return { success: false, message: 'Failed to stop 24/7 mode' };
        }
    }

    async get24hStatus(guildId) {
        try {
            const mode24h = await this.db.get24hMode(guildId);
            const playlistInfo = this.preset24h.getPlaylistInfo();
            const playerData = players.get(guildId);
            
            return {
                enabled: mode24h.enabled,
                channelId: mode24h.channelId,
                playlistInfo,
                isPlaying: !!playerData,
                currentSong: playerData?.currentSong || null
            };
        } catch (error) {
            console.error('Error getting 24/7 status:', error);
            return { enabled: false, channelId: null, playlistInfo: { hasValidSongs: false } };
        }
    }

    async playSong(guildId, song, isRetry = false) {
        const playerData = players.get(guildId);
        if (!playerData) return;

        try {
            // Cancel any scheduled disconnect since we're starting a new song
            this.cancelScheduledDisconnect(guildId);

            console.log(`Playing song: ${song.title}`);
              // If song doesn't have audioUrl (from playlist), resolve it now
            if (!song.audioUrl && song.originalUrl) {
                console.log('Resolving audio URL for playlist song...');
                try {                    // Detect platform from URL and use appropriate plugin
                    if (this.isSoundCloudUrl(song.originalUrl)) {
                        console.log('Resolving SoundCloud audio stream...');
                        const SoundCloud = require('../Plugins/SoundCloud.js');
                        const soundcloud = new SoundCloud();
                        
                        // For SoundCloud, we get a stream directly, not a URL
                        // We'll handle this differently - mark it as ready and use originalUrl
                        try {
                            // Test if we can get the stream (but don't store it yet)
                            const testStream = await soundcloud.getStreamUrl(song.originalUrl);
                            if (testStream) {
                                // Mark as ready for streaming
                                song.audioUrl = 'SOUNDCLOUD_STREAM_READY';
                                song.streamReady = true;
                                console.log('SoundCloud stream is available and ready');
                            }
                        } catch (streamError) {
                            console.error('SoundCloud stream test failed:', streamError);
                            throw streamError;
                        }
                    } else if (this.isYouTubeUrl(song.originalUrl)) {
                        console.log('Resolving YouTube audio URL...');
                        const Youtube = require('../Plugins/Youtube.js');
                        const youtube = new Youtube();
                        const videoInfo = await youtube.getYoutubeInfo(song.originalUrl);
                        
                        if (videoInfo.streamingData && videoInfo.streamingData.adaptiveFormats) {
                            const audioFormats = videoInfo.streamingData.adaptiveFormats.filter(format => 
                                format.mimeType && format.mimeType.includes('audio') && 
                                format.url && format.contentLength
                            );
                            
                            if (audioFormats.length > 0) {
                                const sortedFormats = audioFormats.sort((a, b) => {
                                    if (a.mimeType.includes('mp4') && !b.mimeType.includes('mp4')) return -1;
                                    if (!a.mimeType.includes('mp4') && b.mimeType.includes('mp4')) return 1;
                                    return (b.averageBitrate || 0) - (a.averageBitrate || 0);
                                });
                                
                                song.audioUrl = sortedFormats[0].url;
                                song.quality = sortedFormats[0].audioQuality;
                            }
                        }
                    } else if (this.isSpotifyUrl(song.originalUrl)) {
                        console.log('Resolving Spotify track via fallback...');
                        // For Spotify tracks, we need to search for the song on other platforms
                        const searchQuery = song.searchQuery || `${song.author} ${song.title}`;
                        
                        try {
                            // Try YouTube first
                            const Youtube = require('../Plugins/Youtube.js');
                            const youtube = new Youtube();
                            const youtubeResults = await youtube.searchVideos(searchQuery, 1);
                            
                            if (youtubeResults.length > 0) {
                                const videoInfo = await youtube.getYoutubeInfo(youtubeResults[0].url);
                                const audioFormats = videoInfo.streamingData.adaptiveFormats.filter(format => 
                                    format.mimeType && format.mimeType.includes('audio')
                                );
                                
                                if (audioFormats.length > 0) {
                                    song.audioUrl = audioFormats[0].url;
                                    song.fallbackUrl = youtubeResults[0].url;
                                }
                            }
                        } catch (ytError) {
                            console.warn('YouTube fallback failed for Spotify track, trying SoundCloud...');
                            try {
                                const SoundCloud = require('../Plugins/SoundCloud.js');
                                const soundcloud = new SoundCloud();
                                const scResults = await soundcloud.search(searchQuery, 1);
                                
                                if (scResults.length > 0) {
                                    song.audioUrl = await soundcloud.getStreamUrl(scResults[0].url);
                                    song.fallbackUrl = scResults[0].url;
                                }
                            } catch (scError) {
                                console.error('Both YouTube and SoundCloud fallbacks failed for Spotify track:', scError);
                            }
                        }
                    } else {
                        console.warn('Unknown URL format, attempting YouTube resolution as fallback...');
                        const Youtube = require('../Plugins/Youtube.js');
                        const youtube = new Youtube();
                        const videoInfo = await youtube.getYoutubeInfo(song.originalUrl);
                        
                        if (videoInfo.streamingData && videoInfo.streamingData.adaptiveFormats) {
                            const audioFormats = videoInfo.streamingData.adaptiveFormats.filter(format => 
                                format.mimeType && format.mimeType.includes('audio')
                            );
                            
                            if (audioFormats.length > 0) {
                                song.audioUrl = audioFormats[0].url;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Failed to resolve audio URL for playlist song:', error);
                    await this.playNext(guildId);
                    return;
                }
            }            // Handle different audio source types
            let audioSource = null;
            
            // Special handling for SoundCloud streams
            if (song.platform === 'soundcloud' && (song.audioUrl === 'SOUNDCLOUD_STREAM_READY' || song.streamReady)) {
                console.log('Using SoundCloud stream for:', song.title);
                const SoundCloud = require('../Plugins/SoundCloud.js');
                const soundcloud = new SoundCloud();
                try {
                    audioSource = await soundcloud.getStreamUrl(song.originalUrl);
                    console.log('SoundCloud stream obtained successfully');
                } catch (streamError) {
                    console.error('Failed to get SoundCloud stream:', streamError);
                    await this.playNext(guildId);
                    return;
                }
            } else if (song.videoId && this.downloader && this.downloader.fileExists(song.videoId)) {
                // Use downloaded file
                audioSource = this.downloader.getFilePath(song.videoId);
                console.log(`Using downloaded file: ${song.videoId}`);
            } else if (song.videoId && song.originalUrl && this.downloader && !this.isSoundCloudUrl(song.originalUrl)) {
                // Download the audio file (only for YouTube, not SoundCloud)
                try {
                    console.log(`Downloading audio for: ${song.title}`);
                    audioSource = await this.downloader.downloadAudio(song.originalUrl, song.videoId);
                } catch (downloadError) {
                    console.error('Download failed, falling back to stream:', downloadError);
                    audioSource = song.audioUrl;
                }
            } else if (song.audioUrl && song.audioUrl !== 'SOUNDCLOUD_STREAM_READY') {
                // Use direct audio URL (for YouTube and other platforms)
                audioSource = song.audioUrl;
            } else if (this.isSoundCloudUrl(song.originalUrl)) {
                // Fallback SoundCloud stream resolution
                console.log('Fallback SoundCloud stream resolution for:', song.title);
                const SoundCloud = require('../Plugins/SoundCloud.js');
                const soundcloud = new SoundCloud();
                try {
                    audioSource = await soundcloud.getStreamUrl(song.originalUrl);
                } catch (streamError) {
                    console.error('Fallback SoundCloud stream failed:', streamError);
                    await this.playNext(guildId);
                    return;
                }
            } else {
                console.error('No valid audio source found');
                await this.playNext(guildId);
                return;
            }

            if (!audioSource) {
                console.error('No audio source available');
                await this.playNext(guildId);
                return;
            }

            const resource = createAudioResource(audioSource, {
                inlineVolume: true,
                metadata: {
                    title: song.title,
                    artist: song.author
                }
            });
            
            playerData.player.play(resource);
            playerData.currentSong = song;
            playerData.retryCount = 0;
            
            console.log(`Now playing: ${song.title}`);
        } catch (error) {
            console.error('Error playing song:', error);
            
            if (!isRetry && playerData.retryCount < 2) {
                playerData.retryCount++;
                console.log(`Retrying playback (attempt ${playerData.retryCount})`);
                setTimeout(() => {
                    this.playSong(guildId, song, true);
                }, 3000);
            } else {
                console.log('Max retries reached, skipping to next song');
                await this.playNext(guildId);
            }
        }
    }

    /**
     * Start pre-downloading songs in queue with cooldown
     */
    async startQueuePreDownload(guildId) {
        const guildDownloadData = this.downloadQueue.get(guildId) || {
            songs: [],
            downloading: false,
            lastDownload: 0
        };

        if (guildDownloadData.downloading) {
            console.log(`Pre-download already in progress for guild ${guildId}`);
            return;
        }

        try {
            const queue = await this.db.getQueue(guildId);
            if (queue.length === 0) {
                console.log(`No songs in queue for guild ${guildId} to pre-download`);
                return;
            }

            console.log(`Analyzing ${queue.length} songs in queue for pre-download eligibility...`);

            // Filter songs that need downloading with more detailed logging
            const songsToDownload = queue
                .filter(song => {
                    // Check for required fields
                    if (!song.videoId) {
                        console.log(`⚠️ Skipping "${song.title}": no videoId`);
                        return false;
                    }
                    
                    if (!song.originalUrl) {
                        console.log(`⚠️ Skipping "${song.title}": no originalUrl`);
                        return false;
                    }
                    
                    // Check if it's a YouTube URL
                    if (!this.isYouTubeUrl(song.originalUrl)) {
                        console.log(`⚠️ Skipping "${song.title}": not a YouTube URL (${song.originalUrl})`);
                        return false;
                    }
                    
                    // Check if already downloaded
                    if (this.downloader.fileExists(song.videoId)) {
                        console.log(`⚠️ Skipping "${song.title}": already downloaded`);
                        return false;
                    }
                    
                    console.log(`✅ "${song.title}" eligible for pre-download`);
                    return true;
                })
                .slice(0, this.maxPreDownloads);

            if (songsToDownload.length === 0) {
                console.log(`No songs need pre-downloading for guild ${guildId} (all filtered out or already downloaded)`);
                return;
            }

            guildDownloadData.songs = songsToDownload;
            guildDownloadData.downloading = true;
            this.downloadQueue.set(guildId, guildDownloadData);

            console.log(`🚀 Starting pre-download of ${songsToDownload.length} songs for guild ${guildId}`);
            this.processDownloadQueue(guildId);

        } catch (error) {
            console.error('Error starting queue pre-download:', error);
            guildDownloadData.downloading = false;
            this.downloadQueue.set(guildId, guildDownloadData);
        }
    }

    /**
     * Process download queue with cooldown
     */
    async processDownloadQueue(guildId) {
        const guildDownloadData = this.downloadQueue.get(guildId);
        if (!guildDownloadData || !guildDownloadData.downloading) {
            return;
        }

        if (guildDownloadData.songs.length === 0) {
            console.log(`✅ Pre-download completed for guild ${guildId}`);
            guildDownloadData.downloading = false;
            this.downloadQueue.set(guildId, guildDownloadData);
            return;
        }

        const now = Date.now();
        const timeSinceLastDownload = now - guildDownloadData.lastDownload;

        // Apply cooldown if needed
        if (timeSinceLastDownload < this.downloadCooldown && guildDownloadData.lastDownload > 0) {
            const remainingCooldown = this.downloadCooldown - timeSinceLastDownload;
            console.log(`⏳ Download cooldown: waiting ${Math.ceil(remainingCooldown / 1000)}s before next download`);
            
            setTimeout(() => {
                this.processDownloadQueue(guildId);
            }, remainingCooldown);
            return;
        }

        const songToDownload = guildDownloadData.songs.shift();
        console.log(`📥 Pre-downloading: ${songToDownload.title} (${guildDownloadData.songs.length} remaining)`);

        try {
            // Download the song
            await this.downloadSongInBackground(songToDownload);
            guildDownloadData.lastDownload = Date.now();
            
            console.log(`✅ Pre-downloaded: ${songToDownload.title}`);
            
            // Continue with next song after a short delay
            setTimeout(() => {
                this.processDownloadQueue(guildId);
            }, 1000);

        } catch (error) {
            const errorMsg = error.message || 'Unknown error';
            
            // Check if it's a validation error (non-YouTube URL, etc.)
            if (errorMsg.includes('Non-YouTube URL') || errorMsg.includes('Invalid song data')) {
                console.log(`⚠️ Skipping non-downloadable song: ${songToDownload.title} - ${errorMsg}`);
            } else {
                console.error(`❌ Failed to pre-download ${songToDownload.title}: ${errorMsg}`);
            }
            
            // Continue with next song even if this one failed
            setTimeout(() => {
                this.processDownloadQueue(guildId);
            }, 2000);
        }
    }

    /**
     * Download song in background without blocking playback
     */
    async downloadSongInBackground(song) {
        // Validate song data - only proceed with YouTube URLs
        if (!song.videoId || !song.originalUrl) {
            throw new Error(`Invalid song data: missing videoId or originalUrl for "${song.title}"`);
        }

        if (!this.isYouTubeUrl(song.originalUrl)) {
            throw new Error(`Non-YouTube URL cannot be downloaded: "${song.title}" from ${song.originalUrl}`);
        }

        // Check if already downloaded
        if (this.downloader.fileExists(song.videoId)) {
            console.log(`Song ${song.title} already downloaded, skipping`);
            return;
        }

        try {
            // Always resolve fresh YouTube URL for downloads to ensure it's valid
            console.log(`Resolving fresh URL for pre-download: ${song.title}`);
            let downloadUrl = null;

            try {
                const videoInfo = await this.youtube.getYoutubeInfoWithRetry(song.originalUrl);
                
                if (videoInfo.streamingData && videoInfo.streamingData.adaptiveFormats) {
                    const audioFormats = videoInfo.streamingData.adaptiveFormats.filter(format => 
                        format.mimeType && format.mimeType.includes('audio') && 
                        format.url && format.contentLength
                    );
                    
                    if (audioFormats.length > 0) {
                        const bestAudio = audioFormats.find(format => 
                            format.mimeType.includes('audio/mp4')
                        ) || audioFormats[0];
                        
                        downloadUrl = bestAudio.url;
                        console.log(`Resolved download URL for: ${song.title}`);
                    }
                }
            } catch (resolveError) {
                throw new Error(`Failed to resolve YouTube URL for download: ${resolveError.message}`);
            }

            if (!downloadUrl) {
                throw new Error('No valid audio stream URL found for download');
            }

            // Validate the resolved URL before passing to downloader
            if (!downloadUrl.startsWith('http')) {
                throw new Error(`Invalid download URL resolved: ${downloadUrl}`);
            }

            console.log(`Starting download for: ${song.title} (${song.videoId})`);

            // Perform the download using the YouTube watch URL, not the stream URL
            // The ytdl library expects the YouTube watch URL, not the direct stream URL
            await this.downloader.downloadAudio(song.originalUrl, song.videoId, {
                title: song.title,
                author: song.author
            });

            console.log(`✅ Successfully downloaded: ${song.title}`);

            // Trigger cache cleanup check after download
            onFileDownloaded(this.downloader.getFilePath(song.videoId));

        } catch (error) {
            console.error(`Background download failed for ${song.title}:`, error.message);
            throw error;
        }
    }

    /**
     * Add songs to queue and start pre-downloading
     */
    async addToQueueWithPreDownload(guildId, songs) {
        try {
            // Cancel any scheduled disconnect since we're adding new songs
            this.cancelScheduledDisconnect(guildId);
            
            // Add songs to queue first
            if (Array.isArray(songs)) {
                for (const song of songs) {
                    await this.db.addToQueue(guildId, song);
                }
            } else {
                await this.db.addToQueue(guildId, songs);
            }

            // Start pre-downloading new songs
            await this.startQueuePreDownload(guildId);

            return { success: true, preDownloadStarted: true };
        } catch (error) {
            console.error('Error adding songs to queue with pre-download:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop pre-downloading for a guild
     */
    stopQueuePreDownload(guildId) {
        const guildDownloadData = this.downloadQueue.get(guildId);
        if (guildDownloadData) {
            guildDownloadData.downloading = false;
            guildDownloadData.songs = [];
            this.downloadQueue.set(guildId, guildDownloadData);
            console.log(`🛑 Pre-download stopped for guild ${guildId}`);
        }
    }

    /**
     * Get pre-download status
     */
    getPreDownloadStatus(guildId) {
        const guildDownloadData = this.downloadQueue.get(guildId);
        if (!guildDownloadData) {
            return {
                active: false,
                songsRemaining: 0,
                lastDownload: 0
            };
        }

        return {
            active: guildDownloadData.downloading,
            songsRemaining: guildDownloadData.songs.length,
            lastDownload: guildDownloadData.lastDownload,
            cooldownRemaining: Math.max(0, this.downloadCooldown - (Date.now() - guildDownloadData.lastDownload))
        };
    }

    async start24hMode(guildId, channelId) {
        try {
            // Check if already connected
            if (players.has(guildId)) {
                return { success: false, message: 'Bot is already playing music' };
            }

            // Check if preset playlist has songs
            const playlistInfo = this.preset24h.getPlaylistInfo();
            if (!playlistInfo.hasValidSongs) {
                return { success: false, message: 'No preset songs found. Please add music files to the preset folder.' };
            }

            // Enable 24/7 mode in database
            await this.db.set24hMode(guildId, true, channelId);

            return { success: true, message: '24/7 mode will start when music is played' };
        } catch (error) {
            console.error('Error starting 24/7 mode:', error);
            return { success: false, message: 'Failed to start 24/7 mode' };
        }
    }

    async stop24hMode(guildId) {
        try {
            // Disable 24/7 mode in database
            await this.db.set24hMode(guildId, false);
            
            // Clear queue and disconnect if currently playing preset
            const playerData = players.get(guildId);
            if (playerData && playerData.currentSong && playerData.currentSong.isPreset) {
                await this.db.clearQueue(guildId);
                this.disconnect(guildId);
            }

            return { success: true, message: '24/7 mode disabled' };
        } catch (error) {

            console.error('Error stopping 24/7 mode:', error);
            return { success: false, message: 'Failed to stop 24/7 mode' };
        }
    }

    async get24hStatus(guildId) {
        try {
            const mode24h = await this.db.get24hMode(guildId);
            const playlistInfo = this.preset24h.getPlaylistInfo();
            const playerData = players.get(guildId);
            
            return {
                enabled: mode24h.enabled,
                channelId: mode24h.channelId,
                playlistInfo,
                isPlaying: !!playerData,
                currentSong: playerData?.currentSong || null
            };
        } catch (error) {
            console.error('Error getting 24/7 status:', error);
            return { enabled: false, channelId: null, playlistInfo: { hasValidSongs: false } };
        }
    }

    scheduleDisconnect(guildId, reason = 'Queue empty') {
        // Clear any existing timer
        this.cancelScheduledDisconnect(guildId);
        
        console.log(`⏰ Scheduling disconnect for guild ${guildId} in ${this.disconnectDelay / 1000} seconds (${reason})`);
        
        const timerId = setTimeout(() => {
            console.log(`🕐 Auto-disconnecting guild ${guildId} after ${this.disconnectDelay / 1000}s delay`);
            this.disconnect(guildId);
            this.disconnectTimers.delete(guildId);
        }, this.disconnectDelay);
        
        this.disconnectTimers.set(guildId, timerId);
    }

    /**
     * Cancel scheduled disconnection (when new song is added)
     */
    cancelScheduledDisconnect(guildId) {
        const timerId = this.disconnectTimers.get(guildId);
        if (timerId) {
            clearTimeout(timerId);
            this.disconnectTimers.delete(guildId);
            console.log(`⏹️ Cancelled scheduled disconnect for guild ${guildId}`);
            return true;
        }
        return false;
    }

    /**
     * Check if disconnect is scheduled for a guild
     */
    isDisconnectScheduled(guildId) {
        return this.disconnectTimers.has(guildId);
    }

    /**
     * Get remaining time until scheduled disconnect
     */
    getDisconnectTimeRemaining(guildId) {
        if (!this.isDisconnectScheduled(guildId)) {
            return 0;
        }
        
        // This is an approximation since we can't get exact remaining time from setTimeout
        return this.disconnectDelay; // Return max delay as approximation
    }

    /**
     * Disconnect player and clean up resources
     */
    disconnect(guildId) {
        return disconnect(guildId);
    }

    /**
     * Pause player
     */
    pause(guildId) {
        return pause(guildId);
    }

    /**
     * Resume player
     */
    resume(guildId) {
        return resume(guildId);
    }

    /**
     * Skip current song
     */
    skip(guildId) {
        return this.playNext(guildId);
    }

    /**
     * Stop player and clear queue
     */
    async stop(guildId) {
        await this.db.clearQueue(guildId);
        return disconnect(guildId);
    }

    /**
     * Check if player is playing
     */
    isPlaying(guildId) {
        return isPlaying(guildId);
    }

    /**
     * Check if player is paused
     */
    isPaused(guildId) {
        return isPaused(guildId);
    }

    /**
     * Setup player events
     */
    setupPlayerEvents(guildId, player) {
        return setupPlayerEvents(guildId, player);
    }

    // ...existing code...
}

// Check cache size and perform cleanup if necessary
function checkCacheSizeAndCleanup() {
    if (!CACHE_CONFIG.autoCleanupEnabled) {
        return { cleaned: false, reason: 'Auto-cleanup disabled' };
    }

    try {
        const stats = getDownloadStats();
        const currentSizeMB = parseFloat(stats.sizeMB) || 0;
        
        if (currentSizeMB > CACHE_CONFIG.maxSizeMB) {
            console.log(`Cache size (${currentSizeMB} MB) exceeds limit (${CACHE_CONFIG.maxSizeMB} MB). Starting cleanup...`);
            
            // Get all download files with their stats
            const downloadFiles = getDownloadFilesWithStats();
            
            if (downloadFiles.length === 0) {
                return { cleaned: false, reason: 'No files to clean' };
            }

            // Sort by modification time (oldest first)
            downloadFiles.sort((a, b) => a.mtime - b.mtime);
            
            // Delete the oldest files
            const filesToDelete = downloadFiles.slice(0, CACHE_CONFIG.cleanupCountPerBatch);
            let deletedCount = 0;
            let freedSpaceMB = 0;

            for (const file of filesToDelete) {
                try {
                    const fileSizeMB = file.size / (1024 * 1024);
                    fs.unlinkSync(file.path);
                    deletedCount++;
                    freedSpaceMB += fileSizeMB;
                    console.log(`Deleted old download: ${file.name} (${fileSizeMB.toFixed(2)} MB)`);
                } catch (error) {
                    console.error(`Failed to delete ${file.name}:`, error);
                }
            }

            return {
                cleaned: true,
                deletedCount,
                freedSpaceMB: freedSpaceMB.toFixed(2),
                newSizeMB: (currentSizeMB - freedSpaceMB).toFixed(2),
                reason: `Cleaned ${deletedCount} oldest files`
            };
        }

        return { cleaned: false, reason: 'Cache size within limit' };
    } catch (error) {
        console.error('Error during cache size check:', error);
        return { cleaned: false, reason: 'Error during cleanup', error: error.message };
    }
}

function getDownloadFilesWithStats() {
    if (!fs.existsSync(CACHE_CONFIG.downloadDir)) {
        return [];
    }

    const files = [];
    try {
        const fileNames = fs.readdirSync(CACHE_CONFIG.downloadDir);
        
        for (const fileName of fileNames) {
            const filePath = path.join(CACHE_CONFIG.downloadDir, fileName);
            try {
                const stats = fs.statSync(filePath);
                if (stats.isFile()) {
                    files.push({
                        name: fileName,
                        path: filePath,
                        size: stats.size,
                        mtime: stats.mtime.getTime(),
                        created: stats.birthtime.getTime()
                    });
                }
            } catch (error) {
                console.error(`Error getting stats for ${fileName}:`, error);
            }
        }
    } catch (error) {
        console.error('Error reading download directory:', error);
    }

    return files;
}

function getDownloadStats() {
    if (!fs.existsSync(CACHE_CONFIG.downloadDir)) {
        return { sizeMB: '0', count: 0, files: [] };
    }

    try {
        const files = getDownloadFilesWithStats();
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

        return {
            sizeMB,
            count: files.length,
            files: files.map(f => ({
                name: f.name,
                sizeMB: (f.size / (1024 * 1024)).toFixed(2),
                age: Math.floor((Date.now() - f.mtime) / (1000 * 60 * 60)) // hours
            })),
            config: {
                maxSizeMB: CACHE_CONFIG.maxSizeMB,
                autoCleanupEnabled: CACHE_CONFIG.autoCleanupEnabled,
                cleanupCount: CACHE_CONFIG.cleanupCountPerBatch
            }
        };
    } catch (error) {
        console.error('Error getting download stats:', error);
        return { sizeMB: '0', count: 0, files: [], error: error.message };
    }
}

// Enhanced cleanup function with size-based options
function cleanDownloads(forceAll = false, maxAge = 24) {
    if (!fs.existsSync(CACHE_CONFIG.downloadDir)) {
        return 0;
    }

    try {
        const files = getDownloadFilesWithStats();
        let deletedCount = 0;

        if (forceAll) {
            // Delete all files
            for (const file of files) {
                try {
                    fs.unlinkSync(file.path);
                    deletedCount++;
                } catch (error) {
                    console.error(`Failed to delete ${file.name}:`, error);
                }
            }
        } else {
            // Delete files older than maxAge hours
            const maxAgeMs = maxAge * 60 * 60 * 1000;
            const now = Date.now();

            for (const file of files) {
                if (now - file.mtime > maxAgeMs) {
                    try {
                        fs.unlinkSync(file.path);
                        deletedCount++;
                        console.log(`Deleted old download: ${file.name} (${Math.floor((now - file.mtime) / (1000 * 60 * 60))}h old)`);
                    } catch (error) {
                        console.error(`Failed to delete ${file.name}:`, error);
                    }
                }
            }
        }

        return deletedCount;
    } catch (error) {
        console.error('Error cleaning downloads:', error);
        return 0;
    }
}

function getCacheConfig() {
    return CACHE_CONFIG;
}

// Hook into music download/playback to check cache size
function onFileDownloaded(filePath) {
    // Check cache size after each download
    const cleanupResult = checkCacheSizeAndCleanup();
    
    if (cleanupResult.cleaned) {
        console.log(`Auto-cleanup completed: ${cleanupResult.reason}. Freed ${cleanupResult.freedSpaceMB} MB`);
    }
    
    return cleanupResult;
}

function getCurrentSong(guildId) {
    const playerData = players.get(guildId);
    return playerData?.currentSong || null;
}

function isPlaying(guildId) {
    const playerData = players.get(guildId);
    return playerData?.isPlaying || false;
}

function isPaused(guildId) {
    const playerData = players.get(guildId);
    return playerData?.isPaused || false;
}

function pause(guildId) {
    const playerData = players.get(guildId);
    if (playerData?.player) {
        playerData.player.pause();
        playerData.isPaused = true;
        playerData.isPlaying = false;
        return true;
    }
    return false;
}

function resume(guildId) {
    const playerData = players.get(guildId);
    if (playerData?.player) {
        playerData.player.unpause();
        playerData.isPaused = false;
        playerData.isPlaying = true;
        return true;
    }
    return false;
}

function disconnect(guildId) {
    const playerData = players.get(guildId);
    if (playerData) {
        if (playerData.player) {
            playerData.player.stop();
        }
        if (playerData.connection) {
            playerData.connection.destroy();
        }
        players.delete(guildId);
        
        // Clean up disconnect timers and download queue
        if (musicPlayer.disconnectTimers.has(guildId)) {
            clearTimeout(musicPlayer.disconnectTimers.get(guildId));
            musicPlayer.disconnectTimers.delete(guildId);
        }
        
        // Stop any ongoing pre-downloads for this guild
        musicPlayer.stopQueuePreDownload(guildId);
        
        return true;
    }
    return false;
}

function setupPlayerEvents(guildId, player) {
    const playerData = players.get(guildId);
    if (!playerData) return;

    player.on('stateChange', (oldState, newState) => {
        if (newState.status === 'idle') {
            playerData.isPlaying = false;
            playerData.isPaused = false;
            playerData.currentSong = null;
            // Auto-play next song if queue exists - use class method
            musicPlayer.playNext(guildId);
        } else if (newState.status === 'playing') {
            playerData.isPlaying = true;
            playerData.isPaused = false;
        } else if (newState.status === 'paused') {
            playerData.isPlaying = false;
            playerData.isPaused = true;
        }
    });

    player.on('error', (error) => {
        console.error(`Player error in guild ${guildId}:`, error);
        playerData.isPlaying = false;
        playerData.isPaused = false;
        playerData.currentSong = null;
        // Try to play next song on error too
        console.log('Attempting to play next song after error...');
        setTimeout(() => {
            musicPlayer.playNext(guildId);
        }, 2000);
    });
}

async function playNext(guildId) {
    // This would need to be implemented based on your queue system
    // For now, just a placeholder
    const playerData = players.get(guildId);
    if (playerData) {
        console.log(`Playing next song for guild ${guildId}`);
        // Implementation would get next song from queue and play it
    }
}

async function get24hStatus(guildId) {
    // Read guild settings to get 24/7 status
    try {
        const fs = require('fs');
        const path = require('path');
        const settingsPath = path.join(__dirname, '../data/guild_settings.json');
        
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const guildSettings = settings[guildId] || {};
            
            const playerData = players.get(guildId);
            
            return {
                enabled: guildSettings.mode_24h || false,
                channelId: guildSettings.channel_24h || null,
                isPlaying: playerData?.isPlaying || false,
                currentSong: playerData?.currentSong || null,
                playlistInfo: {
                    totalSongs: 0,
                    shuffleMode: false
                }
            };
        }
    } catch (error) {
        console.error('Error getting 24/7 status:', error);
    }
    
    return {
        enabled: false,
        channelId: null,
        isPlaying: false,
        currentSong: null,
        playlistInfo: {
            totalSongs: 0,
            shuffleMode: false
        }
    };
}

async function start24hMode(guildId, channelId) {
    try {
        const fs = require('fs');
        const path = require('path');
        const settingsPath = path.join(__dirname, '../data/guild_settings.json');
        
        let settings = {};
        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
        
        settings[guildId] = {
            ...settings[guildId],
            mode_24h: true,
            channel_24h: channelId,
            updated_at: Date.now()
        };
        
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        
        return { success: true, message: '24/7 mode enabled' };
    } catch (error) {
        console.error('Error starting 24/7 mode:', error);
        return { success: false, message: 'Failed to enable 24/7 mode' };
    }
}

async function stop24hMode(guildId) {
    try {
        const fs = require('fs');
        const path = require('path');
        const settingsPath = path.join(__dirname, '../data/guild_settings.json');
        
        let settings = {};
        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
        
        settings[guildId] = {
            ...settings[guildId],
            mode_24h: false,
            channel_24h: null,
            updated_at: Date.now()
        };
        
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        
        // Disconnect player if exists
        disconnect(guildId);
        
        return { success: true, message: '24/7 mode disabled' };
    } catch (error) {
        console.error('Error stopping 24/7 mode:', error);
        return { success: false, message: 'Failed to disable 24/7 mode' };
    }
}

// Check cache size and perform cleanup if necessary
function checkCacheSizeAndCleanup() {
    if (!CACHE_CONFIG.autoCleanupEnabled) {
        return { cleaned: false, reason: 'Auto-cleanup disabled' };
    }

    try {
        const stats = getDownloadStats();
        const currentSizeMB = parseFloat(stats.sizeMB) || 0;
        
        if (currentSizeMB > CACHE_CONFIG.maxSizeMB) {
            console.log(`Cache size (${currentSizeMB} MB) exceeds limit (${CACHE_CONFIG.maxSizeMB} MB). Starting cleanup...`);
            
            // Get all download files with their stats
            const downloadFiles = getDownloadFilesWithStats();
            
            if (downloadFiles.length === 0) {
                return { cleaned: false, reason: 'No files to clean' };
            }

            // Sort by modification time (oldest first)
            downloadFiles.sort((a, b) => a.mtime - b.mtime);
            
            // Delete the oldest files
            const filesToDelete = downloadFiles.slice(0, CACHE_CONFIG.cleanupCountPerBatch);
            let deletedCount = 0;
            let freedSpaceMB = 0;

            for (const file of filesToDelete) {
                try {
                    const fileSizeMB = file.size / (1024 * 1024);
                    fs.unlinkSync(file.path);
                    deletedCount++;
                    freedSpaceMB += fileSizeMB;
                    console.log(`Deleted old download: ${file.name} (${fileSizeMB.toFixed(2)} MB)`);
                } catch (error) {
                    console.error(`Failed to delete ${file.name}:`, error);
                }
            }

            return {
                cleaned: true,
                deletedCount,
                freedSpaceMB: freedSpaceMB.toFixed(2),
                newSizeMB: (currentSizeMB - freedSpaceMB).toFixed(2),
                reason: `Cleaned ${deletedCount} oldest files`
            };
        }

        return { cleaned: false, reason: 'Cache size within limit' };
    } catch (error) {
        console.error('Error during cache size check:', error);
        return { cleaned: false, reason: 'Error during cleanup', error: error.message };
    }
}

function getDownloadFilesWithStats() {
    if (!fs.existsSync(CACHE_CONFIG.downloadDir)) {
        return [];
    }

    const files = [];
    try {
        const fileNames = fs.readdirSync(CACHE_CONFIG.downloadDir);
        
        for (const fileName of fileNames) {
            const filePath = path.join(CACHE_CONFIG.downloadDir, fileName);
            try {
                const stats = fs.statSync(filePath);
                if (stats.isFile()) {
                    files.push({
                        name: fileName,
                        path: filePath,
                        size: stats.size,
                        mtime: stats.mtime.getTime(),
                        created: stats.birthtime.getTime()
                    });
                }
            } catch (error) {
                console.error(`Error getting stats for ${fileName}:`, error);
            }
        }
    } catch (error) {
        console.error('Error reading download directory:', error);
    }

    return files;
}

function getDownloadStats() {
    if (!fs.existsSync(CACHE_CONFIG.downloadDir)) {
        return { sizeMB: '0', count: 0, files: [] };
    }

    try {
        const files = getDownloadFilesWithStats();
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

        return {
            sizeMB,
            count: files.length,
            files: files.map(f => ({
                name: f.name,
                sizeMB: (f.size / (1024 * 1024)).toFixed(2),
                age: Math.floor((Date.now() - f.mtime) / (1000 * 60 * 60)) // hours
            })),
            config: {
                maxSizeMB: CACHE_CONFIG.maxSizeMB,
                autoCleanupEnabled: CACHE_CONFIG.autoCleanupEnabled,
                cleanupCount: CACHE_CONFIG.cleanupCountPerBatch
            }
        };
    } catch (error) {
        console.error('Error getting download stats:', error);
        return { sizeMB: '0', count: 0, files: [], error: error.message };
    }
}

// Enhanced cleanup function with size-based options
function cleanDownloads(forceAll = false, maxAge = 24) {
    if (!fs.existsSync(CACHE_CONFIG.downloadDir)) {
        return 0;
    }

    try {
        const files = getDownloadFilesWithStats();
        let deletedCount = 0;

        if (forceAll) {
            // Delete all files
            for (const file of files) {
                try {
                    fs.unlinkSync(file.path);
                    deletedCount++;
                } catch (error) {
                    console.error(`Failed to delete ${file.name}:`, error);
                }
            }
        } else {
            // Delete files older than maxAge hours
            const maxAgeMs = maxAge * 60 * 60 * 1000;
            const now = Date.now();

            for (const file of files) {
                if (now - file.mtime > maxAgeMs) {
                    try {
                        fs.unlinkSync(file.path);
                        deletedCount++;
                        console.log(`Deleted old download: ${file.name} (${Math.floor((now - file.mtime) / (1000 * 60 * 60))}h old)`);
                    } catch (error) {
                        console.error(`Failed to delete ${file.name}:`, error);
                    }
                }
            }
        }

        return deletedCount;
    } catch (error) {
        console.error('Error cleaning downloads:', error);
        return 0;
    }
}

function getCacheConfig() {
    return CACHE_CONFIG;
}

// Hook into music download/playback to check cache size
function onFileDownloaded(filePath) {
    // Check cache size after each download
    const cleanupResult = checkCacheSizeAndCleanup();
    
    if (cleanupResult.cleaned) {
        console.log(`Auto-cleanup completed: ${cleanupResult.reason}. Freed ${cleanupResult.freedSpaceMB} MB`);
    }
    
    return cleanupResult;
}

const musicPlayer = new MusicPlayer();

// Export the instance methods and standalone functions
module.exports = {
    // Player management - use instance methods
    getPlayer: (guildId) => musicPlayer.getPlayer(guildId),
    setPlayer: (guildId, player, connection) => musicPlayer.setPlayer(guildId, player, connection),
    getCurrentSong: (guildId) => getCurrentSong(guildId),
    isPlaying: (guildId) => musicPlayer.isPlaying(guildId),
    isPaused: (guildId) => musicPlayer.isPaused(guildId),
    pause: (guildId) => musicPlayer.pause(guildId),
    resume: (guildId) => musicPlayer.resume(guildId),
    skip: (guildId) => musicPlayer.skip(guildId),
    stop: (guildId) => musicPlayer.stop(guildId),
    disconnect: (guildId) => musicPlayer.disconnect(guildId),
    setupPlayerEvents: (guildId, player) => musicPlayer.setupPlayerEvents(guildId, player),
    playNext: (guildId) => musicPlayer.playNext(guildId),
    playSong: (guildId, song, isRetry) => musicPlayer.playSong(guildId, song, isRetry),
    
    // 24/7 mode - use instance methods
    get24hStatus: (guildId) => musicPlayer.get24hStatus(guildId),
    start24hMode: (guildId, channelId) => musicPlayer.start24hMode(guildId, channelId),
    stop24hMode: (guildId) => musicPlayer.stop24hMode(guildId),
    
    // Queue pre-download - NEW METHODS
    addToQueueWithPreDownload: (guildId, songs) => musicPlayer.addToQueueWithPreDownload(guildId, songs),
    startQueuePreDownload: (guildId) => musicPlayer.startQueuePreDownload(guildId),
    stopQueuePreDownload: (guildId) => musicPlayer.stopQueuePreDownload(guildId),
    getPreDownloadStatus: (guildId) => musicPlayer.getPreDownloadStatus(guildId),
    
    // Disconnect timer management - NEW METHODS
    scheduleDisconnect: (guildId, reason) => musicPlayer.scheduleDisconnect(guildId, reason),
    cancelScheduledDisconnect: (guildId) => musicPlayer.cancelScheduledDisconnect(guildId),
    isDisconnectScheduled: (guildId) => musicPlayer.isDisconnectScheduled(guildId),
    getDisconnectTimeRemaining: (guildId) => musicPlayer.getDisconnectTimeRemaining(guildId),
    
    // URL detection methods - NEW METHODS
    isSoundCloudUrl: (url) => musicPlayer.isSoundCloudUrl(url),
    isYouTubeUrl: (url) => musicPlayer.isYouTubeUrl(url),
    isSpotifyUrl: (url) => musicPlayer.isSpotifyUrl(url),
    
    // Cache management - use standalone functions
    getDownloadStats,
    cleanDownloads,
    checkCacheSizeAndCleanup,
    onFileDownloaded,
    getCacheConfig
};
