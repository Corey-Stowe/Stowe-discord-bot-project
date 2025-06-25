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
    }

    getPlayer(guildId) {
        return players.get(guildId) || null;
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

            // If no songs available, disconnect (only if not in 24/7 mode)
            if (!mode24h.enabled) {
                console.log('Queue empty, disconnecting');
                this.disconnect(guildId);
            }

        } catch (error) {
            console.error('Error in playNext:', error);
            const mode24h = await this.db.get24hMode(guildId);
            if (!mode24h.enabled) {
                this.disconnect(guildId);
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

    isUrlExpired(url) {
        if (!url) return true;
        
        try {
            const urlObj = new URL(url);
            const expire = urlObj.searchParams.get('expire');
            if (expire) {
                const expireTime = parseInt(expire) * 1000; // Convert to milliseconds
                const now = Date.now();
                const timeUntilExpire = expireTime - now;
                
                // Consider URL expired if less than 30 seconds remaining
                return timeUntilExpire < 30000;
            }
        } catch (error) {
            console.error('Error checking URL expiration:', error);
        }
        
        return false;
    }

    async skip(guildId) {
        const playerData = players.get(guildId);
        if (!playerData) return false;

        playerData.player.stop();
        return true;
    }

    async stop(guildId) {
        const playerData = players.get(guildId);
        if (!playerData) return false;

        await this.db.clearQueue(guildId);
        playerData.player.stop();
        playerData.connection.destroy();
        players.delete(guildId);
        return true;
    }

    pause(guildId) {
        const playerData = players.get(guildId);
        if (playerData && playerData.player) {
            playerData.player.pause();
            return true;
        }
        return false;
    }

    resume(guildId) {
        const playerData = players.get(guildId);
        if (playerData && playerData.player) {
            playerData.player.unpause();
            return true;
        }
        return false;
    }

    disconnect(guildId) {
        const playerData = players.get(guildId);
        if (playerData) {
            try {
                if (playerData.connection) {
                    playerData.connection.destroy();
                }
                if (playerData.player) {
                    playerData.player.stop();
                }
                players.delete(guildId);
                console.log(`Disconnected from guild: ${guildId}`);
            } catch (error) {
                console.error('Error disconnecting:', error);
            }
        }
    }

    isPlaying(guildId) {
        const playerData = players.get(guildId);
        return playerData && playerData.player && playerData.player.state.status === AudioPlayerStatus.Playing;
    }

    isPaused(guildId) {
        const playerData = players.get(guildId);
        return playerData && playerData.player && playerData.player.state.status === AudioPlayerStatus.Paused;
    }

    setupPlayerEvents(guildId, player) {
        player.on(AudioPlayerStatus.Playing, () => {
            console.log('Audio player started playing');
            const playerData = players.get(guildId);
            if (playerData) {
                playerData.retryCount = 0; // Reset retry count on successful playback
            }
        });

        player.on(AudioPlayerStatus.Idle, () => {
            console.log('Audio player is idle, playing next song');
            // Add delay to prevent rapid switching
            setTimeout(() => {
                if (players.has(guildId)) {
                    this.playNext(guildId);
                }
            }, 1500);
        });

        player.on(AudioPlayerStatus.Buffering, () => {
            console.log('Audio player is buffering...');
        });

        player.on('error', async (error) => {
            console.error('Audio player error:', error.message);
            const playerData = players.get(guildId);
            
            if (playerData && playerData.currentSong) {
                // Delete corrupted file if it exists
                if (playerData.currentSong.videoId) {
                    this.downloader.deleteFile(playerData.currentSong.videoId);
                }
                
                if (playerData.retryCount < 3) {
                    playerData.retryCount++;
                    console.log(`Player error, retrying (attempt ${playerData.retryCount})`);
                    setTimeout(() => {
                        this.playSong(guildId, playerData.currentSong, true);
                    }, 3000);
                } else {
                    console.log('Max retries reached, skipping to next song');
                    await this.playNext(guildId);
                }
            } else {
                await this.playNext(guildId);
            }
        });
    }

    // Add method to clean downloads
    cleanDownloads(immediate = false) {
        return this.downloader.cleanOldFiles(immediate);
    }

    // Get download stats
    getDownloadStats() {
        const size = this.downloader.getDirectorySize();
        return {
            sizeBytes: size,
            sizeMB: (size / (1024 * 1024)).toFixed(2)
        };
    }

    // URL detection helper methods
    isYouTubeUrl(url) {
        return url && (
            url.includes('youtube.com/') ||
            url.includes('youtu.be/') ||
            url.includes('m.youtube.com/')
        );
    }

    isSoundCloudUrl(url) {
        return url && (
            url.includes('soundcloud.com/') ||
            url.includes('snd.sc/')
        );
    }

    isSpotifyUrl(url) {
        return url && (
            url.includes('spotify.com/') ||
            url.includes('open.spotify.com/') ||
            url.includes('spotify:')
        );
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
            // Auto-play next song if queue exists
            playNext(guildId);
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
    
    // Cache management - use standalone functions
    getDownloadStats,
    cleanDownloads,
    checkCacheSizeAndCleanup,
    onFileDownloaded,
    getCacheConfig
};
