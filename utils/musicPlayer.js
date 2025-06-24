const { createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const Database = require('./database.js');
const Youtube = require('../Plugins/Youtube.js');
const AudioDownloader = require('./audioDownloader.js');
const preset24h = require('./preset24h.js');

class MusicPlayer {
    constructor() {
        this.players = new Map();
        this.db = new Database();
        this.youtube = new Youtube();
        this.downloader = new AudioDownloader();
        this.preset24h = preset24h;
    }

    getPlayer(guildId) {
        return this.players.get(guildId);
    }

    setPlayer(guildId, player, connection) {
        this.players.set(guildId, { player, connection, currentSong: null, retryCount: 0 });
        
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
                    this.players.delete(guildId);
                    connection.destroy();
                }
            } catch (error) {
                console.error('Connection error:', error);
                this.players.delete(guildId);
                connection.destroy();
            }
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log('Voice connection destroyed');
            this.players.delete(guildId);
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
        const playerData = this.players.get(guildId);
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
        const playerData = this.players.get(guildId);
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
            if (this.players.has(guildId)) {
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
            const playerData = this.players.get(guildId);
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
            const playerData = this.players.get(guildId);
            
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
        const playerData = this.players.get(guildId);
        if (!playerData) return;

        try {
            console.log(`Playing song: ${song.title}`);
            
            // If song doesn't have audioUrl (from playlist), resolve it now
            if (!song.audioUrl && song.originalUrl) {
                console.log('Resolving audio URL for playlist song...');
                try {
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
                } catch (error) {
                    console.error('Failed to resolve audio URL for playlist song:', error);
                    await this.playNext(guildId);
                    return;
                }
            }

            // Try to use downloaded file first
            let audioSource = null;
            
            if (song.videoId && this.downloader && this.downloader.fileExists(song.videoId)) {
                // Use downloaded file
                audioSource = this.downloader.getFilePath(song.videoId);
                console.log(`Using downloaded file: ${song.videoId}`);
            } else if (song.videoId && song.originalUrl && this.downloader) {
                // Download the audio file
                try {
                    console.log(`Downloading audio for: ${song.title}`);
                    audioSource = await this.downloader.downloadAudio(song.originalUrl, song.videoId);
                } catch (downloadError) {
                    console.error('Download failed, falling back to stream:', downloadError);
                    audioSource = song.audioUrl;
                }
            } else {
                // Fallback to stream URL
                audioSource = song.audioUrl;
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
        const playerData = this.players.get(guildId);
        if (!playerData) return false;

        playerData.player.stop();
        return true;
    }

    async stop(guildId) {
        const playerData = this.players.get(guildId);
        if (!playerData) return false;

        await this.db.clearQueue(guildId);
        playerData.player.stop();
        playerData.connection.destroy();
        this.players.delete(guildId);
        return true;
    }

    pause(guildId) {
        const playerData = this.players.get(guildId);
        if (playerData && playerData.player) {
            playerData.player.pause();
            return true;
        }
        return false;
    }

    resume(guildId) {
        const playerData = this.players.get(guildId);
        if (playerData && playerData.player) {
            playerData.player.unpause();
            return true;
        }
        return false;
    }

    disconnect(guildId) {
        const playerData = this.players.get(guildId);
        if (playerData) {
            try {
                if (playerData.connection) {
                    playerData.connection.destroy();
                }
                if (playerData.player) {
                    playerData.player.stop();
                }
                this.players.delete(guildId);
                console.log(`Disconnected from guild: ${guildId}`);
            } catch (error) {
                console.error('Error disconnecting:', error);
            }
        }
    }

    isPlaying(guildId) {
        const playerData = this.players.get(guildId);
        return playerData && playerData.player && playerData.player.state.status === AudioPlayerStatus.Playing;
    }

    isPaused(guildId) {
        const playerData = this.players.get(guildId);
        return playerData && playerData.player && playerData.player.state.status === AudioPlayerStatus.Paused;
    }

    setupPlayerEvents(guildId, player) {
        player.on(AudioPlayerStatus.Playing, () => {
            console.log('Audio player started playing');
            const playerData = this.players.get(guildId);
            if (playerData) {
                playerData.retryCount = 0; // Reset retry count on successful playback
            }
        });

        player.on(AudioPlayerStatus.Idle, () => {
            console.log('Audio player is idle, playing next song');
            // Add delay to prevent rapid switching
            setTimeout(() => {
                if (this.players.has(guildId)) {
                    this.playNext(guildId);
                }
            }, 1500);
        });

        player.on(AudioPlayerStatus.Buffering, () => {
            console.log('Audio player is buffering...');
        });

        player.on('error', async (error) => {
            console.error('Audio player error:', error.message);
            const playerData = this.players.get(guildId);
            
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
}

module.exports = new MusicPlayer();
