const Database = require('./database.js');
const recommendationEngine = require('./recommendationEngine.js');
const preset24h = require('./preset24h.js');
const logger = require('./logger.js');
const fs = require('fs');
const path = require('path');

// Cache configuration from environment variables (kept for legacy cleanup)
const CACHE_CONFIG = {
    maxSizeMB: parseInt(process.env.CACHE_MAX_SIZE_MB) || 500,
    cleanupCountPerBatch: parseInt(process.env.CACHE_CLEANUP_COUNT) || 5,
    autoCleanupEnabled: process.env.CACHE_AUTO_CLEANUP !== 'false',
    downloadDir: path.join(__dirname, '../downloads')
};

class MusicPlayer {
    constructor() {
        this.db = new Database();
        this.distube = null; // Set via setDistube() after DisTube init in index.js
        this.preset24h = preset24h;

        // Auto-suggestion management
        this.autoSuggestionCooldown = 10000; // 10 seconds cooldown
        this.lastAutoSuggestion = new Map(); // guildId -> timestamp
        this.autoSuggestionCount = new Map(); // guildId -> count
        this.maxAutoSuggestions = 10;

        // Disconnect timers
        this.disconnectTimers = new Map(); // guildId -> timeoutId
        this.disconnectDelay = 60000; // 60 seconds

        // Scheduled cleanup for legacy downloads/
        this.scheduledCleanupInterval = null;
        this.startScheduledCleanup();
    }

    // ==================== DISTUBE INTEGRATION ====================

    /**
     * Set the DisTube instance (called from index.js after init)
     */
    setDistube(distube) {
        this.distube = distube;
        logger.info('MUSIC', 'DisTube instance connected to MusicPlayer');
    }

    /**
     * Get DisTube queue for a guild
     */
    getQueue(guildId) {
        if (!this.distube) return null;
        return this.distube.getQueue(guildId) || null;
    }

    /**
     * Get player data - compatibility wrapper for old code
     * Returns an object that mimics the old players Map entries
     */
    getPlayer(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue) return null;

        const currentSong = queue.songs[0] || null;
        return {
            player: queue, // DisTube queue acts as the player
            connection: queue.voice,
            currentSong: currentSong ? this._convertSong(currentSong) : null,
            retryCount: 0,
            isPlaying: !queue.paused && queue.songs.length > 0,
            isPaused: queue.paused
        };
    }

    /**
     * Convert DisTube Song to StoweBot song format for compatibility
     */
    _convertSong(distubeSong) {
        if (!distubeSong) return null;
        return {
            title: distubeSong.name || distubeSong.title || 'Unknown',
            author: distubeSong.uploader?.name || distubeSong.author || 'Unknown',
            thumbnail: distubeSong.thumbnail || null,
            duration: distubeSong.duration || 0,
            formattedDuration: distubeSong.formattedDuration || '0:00',
            originalUrl: distubeSong.url || null,
            platform: distubeSong.source || 'unknown',
            requestedBy: distubeSong.user?.tag || distubeSong.member?.user?.tag || 'Unknown',
            requestedByUserId: distubeSong.user?.id || distubeSong.member?.user?.id || null,
            // Preserve any custom metadata
            ...distubeSong.metadata
        };
    }

    // ==================== PLAYBACK CONTROL ====================

    getCurrentSong(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue || queue.songs.length === 0) return null;
        return this._convertSong(queue.songs[0]);
    }

    isPlaying(guildId) {
        const queue = this.getQueue(guildId);
        return queue ? !queue.paused && queue.songs.length > 0 : false;
    }

    isPaused(guildId) {
        const queue = this.getQueue(guildId);
        return queue?.paused || false;
    }

    pause(guildId) {
        const queue = this.getQueue(guildId);
        if (queue && !queue.paused) {
            queue.pause();
            return true;
        }
        return false;
    }

    resume(guildId) {
        const queue = this.getQueue(guildId);
        if (queue && queue.paused) {
            queue.resume();
            return true;
        }
        return false;
    }

    async skip(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue) return false;

        try {
            if (queue.songs.length <= 1) {
                // No next song - let finish event handle 24/7 or disconnect
                queue.stop();
            } else {
                await queue.skip();
            }
            return true;
        } catch (error) {
            logger.error('MUSIC', `Skip error: ${error.message}`);
            return false;
        }
    }

    async stop(guildId) {
        const queue = this.getQueue(guildId);
        if (queue) {
            try {
                queue.stop();
            } catch (error) {
                logger.error('MUSIC', `Stop error: ${error.message}`);
            }
        }
        // Cancel any scheduled disconnect
        this.cancelScheduledDisconnect(guildId);
        return true;
    }

    disconnect(guildId) {
        const queue = this.getQueue(guildId);
        if (queue) {
            try {
                queue.stop();
                if (queue.voice) {
                    queue.voice.leave();
                }
            } catch (error) {
                logger.error('MUSIC', `Disconnect error: ${error.message}`);
            }
        }
        this.cancelScheduledDisconnect(guildId);
        return true;
    }

    // ==================== LOOP MODES ====================
    // DisTube RepeatMode: 0 = off, 1 = song (single), 2 = queue

    setRepeatMode(guildId, mode) {
        const queue = this.getQueue(guildId);
        if (queue) {
            queue.setRepeatMode(mode);
            return true;
        }
        return false;
    }

    getRepeatMode(guildId) {
        const queue = this.getQueue(guildId);
        return queue?.repeatMode || 0;
    }

    /**
     * Convert old loop mode string to DisTube repeat mode number
     */
    loopModeToRepeatMode(loopMode) {
        switch (loopMode) {
            case 'single': return 1;
            case 'queue': return 2;
            default: return 0; // 'off'
        }
    }

    /**
     * Convert DisTube repeat mode number to old loop mode string
     */
    repeatModeToLoopMode(repeatMode) {
        switch (repeatMode) {
            case 1: return 'single';
            case 2: return 'queue';
            default: return 'off';
        }
    }

    // ==================== 24/7 MODE ====================

    async playPreset24h(guildId) {
        try {
            const mode24h = await this.db.get24hMode(guildId);
            if (!mode24h.enabled) return;

            const presetSong = this.preset24h.getNextSong();
            if (!presetSong) {
                logger.warn('MUSIC', 'No preset songs available for 24/7 mode');
                return;
            }

            logger.info('MUSIC', `Playing 24/7 preset: ${presetSong.title}`);

            // Use DisTube direct-link to play local file
            if (this.distube && mode24h.channelId) {
                const guild = this.distube.client.guilds.cache.find(g => {
                    return g.channels.cache.has(mode24h.channelId);
                });
                if (guild) {
                    const voiceChannel = guild.channels.cache.get(mode24h.channelId);
                    if (voiceChannel) {
                        await this.distube.play(voiceChannel, presetSong.filePath, {
                            metadata: {
                                isPreset: true,
                                title: presetSong.title,
                                author: presetSong.author || 'Preset Music'
                            }
                        });
                    }
                }
            }
        } catch (error) {
            logger.error('MUSIC', `Error playing preset 24/7: ${error.message}`);
        }
    }

    async start24hMode(guildId, channelId) {
        try {
            const playlistInfo = this.preset24h.getPlaylistInfo();
            if (!playlistInfo.hasValidSongs) {
                return { success: false, message: 'No preset songs found. Please add music files to the preset folder.' };
            }

            await this.db.set24hMode(guildId, true, channelId);
            return { success: true, message: '24/7 mode enabled' };
        } catch (error) {
            logger.error('MUSIC', `Error starting 24/7 mode: ${error.message}`);
            return { success: false, message: 'Failed to start 24/7 mode' };
        }
    }

    async stop24hMode(guildId) {
        try {
            await this.db.set24hMode(guildId, false);
            this.disconnect(guildId);
            return { success: true, message: '24/7 mode disabled' };
        } catch (error) {
            logger.error('MUSIC', `Error stopping 24/7 mode: ${error.message}`);
            return { success: false, message: 'Failed to stop 24/7 mode' };
        }
    }

    async get24hStatus(guildId) {
        try {
            const mode24h = await this.db.get24hMode(guildId);
            const playlistInfo = this.preset24h.getPlaylistInfo();
            const queue = this.getQueue(guildId);

            return {
                enabled: mode24h.enabled,
                channelId: mode24h.channelId,
                playlistInfo,
                isPlaying: !!queue && queue.songs.length > 0,
                currentSong: queue ? this._convertSong(queue.songs[0]) : null
            };
        } catch (error) {
            logger.error('MUSIC', `Error getting 24/7 status: ${error.message}`);
            return { enabled: false, channelId: null, playlistInfo: { hasValidSongs: false } };
        }
    }

    // ==================== AUTO-SUGGESTION SYSTEM ====================

    async checkAndAddAutoSuggestions(guildId, queueSongs) {
        try {
            // Disable in 24/7 mode
            const mode24h = await this.db.get24hMode(guildId);
            if (mode24h.enabled) return;

            // Disable in single loop mode
            const queue = this.getQueue(guildId);
            if (queue && queue.repeatMode === 1) return;

            // Check suggestion limit
            const currentCount = this.autoSuggestionCount.get(guildId) || 0;
            if (currentCount >= this.maxAutoSuggestions) return;

            // Check cooldown
            const lastSuggestion = this.lastAutoSuggestion.get(guildId) || 0;
            const now = Date.now();
            if (now - lastSuggestion < this.autoSuggestionCooldown) return;

            // Only add when queue is low (1 song or less = currently playing only)
            const songCount = queueSongs?.length || (queue ? queue.songs.length : 0);
            if (songCount > 1) return;

            // Find user with auto-suggestion enabled
            let targetUserId = null;

            // Try current song requester
            if (queue && queue.songs[0]?.user?.id) {
                const userId = queue.songs[0].user.id;
                if (recommendationEngine.isAutoSuggestionEnabled(guildId, userId)) {
                    targetUserId = userId;
                }
            }

            // Fallback: check recent history
            if (!targetUserId) {
                const guildHistory = await this.db.getGuildHistory(guildId, 10);
                for (const activity of guildHistory) {
                    if (recommendationEngine.isAutoSuggestionEnabled(guildId, activity.userId)) {
                        targetUserId = activity.userId;
                        break;
                    }
                }
            }

            // Fallback: any enabled user
            if (!targetUserId) {
                const allEnabledUsers = recommendationEngine.getAllAutoSuggestionUsers(guildId);
                if (allEnabledUsers.length > 0) targetUserId = allEnabledUsers[0];
            }

            if (!targetUserId) return;

            const remainingSuggestions = this.maxAutoSuggestions - currentCount;
            const suggestionsToAdd = Math.min(2, remainingSuggestions);
            if (suggestionsToAdd <= 0) return;

            // Get current song for context
            const currentSong = queue?.songs[0] ? this._convertSong(queue.songs[0]) : null;

            logger.info('MUSIC', `Generating ${suggestionsToAdd} auto-suggestions...`);
            const suggestions = await recommendationEngine.generateRecommendations(
                guildId, targetUserId, 'auto', suggestionsToAdd, currentSong
            );

            if (suggestions.length === 0) return;

            // Add suggestions via DisTube
            let addedCount = 0;
            for (const suggestion of suggestions) {
                if (!suggestion.title || !suggestion.author) continue;

                try {
                    const searchQuery = suggestion.url || `${suggestion.author} ${suggestion.title}`;

                    if (queue && queue.voice?.channel) {
                        await this.distube.play(queue.voice.channel, searchQuery, {
                            textChannel: queue.textChannel,
                            metadata: {
                                suggestion: true,
                                autoSuggestion: true,
                                suggestionReason: suggestion.reason,
                                requestedBy: `AutoSuggestion [${currentCount + addedCount + 1}/${this.maxAutoSuggestions}]`
                            }
                        });
                        addedCount++;
                        logger.info('MUSIC', `Auto-added: ${suggestion.title} by ${suggestion.author}`);
                    }
                } catch (error) {
                    logger.error('MUSIC', `Failed to add auto-suggestion: ${error.message}`);
                }
            }

            if (addedCount > 0) {
                this.lastAutoSuggestion.set(guildId, now);
                this.autoSuggestionCount.set(guildId, currentCount + addedCount);
            }
        } catch (error) {
            logger.error('MUSIC', `Auto-suggestion error: ${error.message}`);
        }
    }

    async addInitialAutoSuggestions(guildId, currentQueue, userId) {
        try {
            if (!recommendationEngine.isAutoSuggestionEnabled(guildId, userId)) return;

            const mode24h = await this.db.get24hMode(guildId);
            if (mode24h.enabled) return;

            const currentCount = this.autoSuggestionCount.get(guildId) || 0;
            if (currentCount >= this.maxAutoSuggestions) return;

            const remainingSuggestions = this.maxAutoSuggestions - currentCount;
            const suggestionsToAdd = Math.min(10, remainingSuggestions);
            if (suggestionsToAdd <= 0) return;

            const queue = this.getQueue(guildId);
            const currentSong = queue?.songs[0] ? this._convertSong(queue.songs[0]) : null;

            logger.info('MUSIC', `Generating ${suggestionsToAdd} initial auto-suggestions...`);
            const suggestions = await recommendationEngine.generateRecommendations(
                guildId, userId, 'auto', suggestionsToAdd, currentSong
            );

            if (suggestions.length === 0) return;

            let addedCount = 0;
            for (const suggestion of suggestions) {
                if (!suggestion.title || !suggestion.author) continue;

                try {
                    const searchQuery = suggestion.url || `${suggestion.author} ${suggestion.title}`;

                    if (queue && queue.voice?.channel) {
                        await this.distube.play(queue.voice.channel, searchQuery, {
                            textChannel: queue.textChannel,
                            metadata: {
                                suggestion: true,
                                autoSuggestion: true,
                                suggestionReason: suggestion.reason,
                                requestedBy: `AutoSuggestion [${currentCount + addedCount + 1}/${this.maxAutoSuggestions}]`
                            }
                        });
                        addedCount++;
                        logger.info('MUSIC', `Initial suggestion added: ${suggestion.title}`);
                    }
                } catch (error) {
                    logger.error('MUSIC', `Failed to add initial suggestion: ${error.message}`);
                }
            }

            if (addedCount > 0) {
                this.lastAutoSuggestion.set(guildId, Date.now());
                this.autoSuggestionCount.set(guildId, currentCount + addedCount);
                logger.info('MUSIC', `Added ${addedCount} initial auto-suggestions`);
            }
        } catch (error) {
            logger.error('MUSIC', `Initial auto-suggestion error: ${error.message}`);
        }
    }

    resetAutoSuggestionCounter(guildId) {
        this.autoSuggestionCount.set(guildId, 0);
    }

    getAutoSuggestionStats(guildId) {
        const currentCount = this.autoSuggestionCount.get(guildId) || 0;
        return {
            used: currentCount,
            max: this.maxAutoSuggestions,
            remaining: this.maxAutoSuggestions - currentCount,
            limitReached: currentCount >= this.maxAutoSuggestions
        };
    }

    // ==================== DISCONNECT TIMERS ====================

    scheduleDisconnect(guildId, reason = 'Queue empty') {
        this.cancelScheduledDisconnect(guildId);

        logger.info('MUSIC', `Scheduling disconnect for guild ${guildId} in ${this.disconnectDelay / 1000}s (${reason})`);

        const timerId = setTimeout(() => {
            logger.info('MUSIC', `Auto-disconnecting guild ${guildId}`);
            this.disconnect(guildId);
            this.disconnectTimers.delete(guildId);
        }, this.disconnectDelay);

        this.disconnectTimers.set(guildId, timerId);
    }

    cancelScheduledDisconnect(guildId) {
        const timerId = this.disconnectTimers.get(guildId);
        if (timerId) {
            clearTimeout(timerId);
            this.disconnectTimers.delete(guildId);
            return true;
        }
        return false;
    }

    // ==================== LEGACY CACHE CLEANUP ====================
    // Kept for cleaning up old downloads/ folder from pre-DisTube era

    startScheduledCleanup() {
        if (this.scheduledCleanupInterval) {
            clearInterval(this.scheduledCleanupInterval);
        }

        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        this.scheduledCleanupInterval = setInterval(() => {
            this.performScheduledCleanup();
        }, TWENTY_FOUR_HOURS);

        // Initial cleanup after 1 hour
        setTimeout(() => {
            this.performScheduledCleanup();
        }, 60 * 60 * 1000);

        logger.info('CACHE', 'Scheduled automatic cleanup started - runs every 24 hours');
    }

    async performScheduledCleanup() {
        try {
            logger.info('CACHE', 'Starting scheduled cleanup...');
            const beforeStats = getDownloadStats();
            const deletedCount = cleanDownloads(false, 24);
            const afterStats = getDownloadStats();
            const freedSpaceMB = (parseFloat(beforeStats.sizeMB) - parseFloat(afterStats.sizeMB)).toFixed(2);
            logger.info('CACHE', `Cleanup done: deleted ${deletedCount} files, freed ${freedSpaceMB} MB`);

            const cacheCheckResult = checkCacheSizeAndCleanup();
            if (cacheCheckResult.cleaned) {
                logger.info('CACHE', `Additional cleanup: freed ${cacheCheckResult.freedSpaceMB} MB`);
            }
        } catch (error) {
            logger.error('CACHE', `Scheduled cleanup error: ${error.message}`);
        }
    }

    stopScheduledCleanup() {
        if (this.scheduledCleanupInterval) {
            clearInterval(this.scheduledCleanupInterval);
            this.scheduledCleanupInterval = null;
            logger.info('CACHE', 'Scheduled cleanup stopped');
        }
    }
}

// ==================== STANDALONE CACHE FUNCTIONS ====================

function checkCacheSizeAndCleanup() {
    if (!CACHE_CONFIG.autoCleanupEnabled) {
        return { cleaned: false, reason: 'Auto-cleanup disabled' };
    }

    try {
        const stats = getDownloadStats();
        const currentSizeMB = parseFloat(stats.sizeMB) || 0;

        if (currentSizeMB > CACHE_CONFIG.maxSizeMB) {
            const downloadFiles = getDownloadFilesWithStats();
            if (downloadFiles.length === 0) {
                return { cleaned: false, reason: 'No files to clean' };
            }

            downloadFiles.sort((a, b) => a.mtime - b.mtime);
            const filesToDelete = downloadFiles.slice(0, CACHE_CONFIG.cleanupCountPerBatch);
            let deletedCount = 0;
            let freedSpaceMB = 0;

            for (const file of filesToDelete) {
                try {
                    const fileSizeMB = file.size / (1024 * 1024);
                    fs.unlinkSync(file.path);
                    deletedCount++;
                    freedSpaceMB += fileSizeMB;
                } catch (error) {
                    // Ignore individual file deletion errors
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
        return { cleaned: false, reason: 'Error during cleanup', error: error.message };
    }
}

function getDownloadFilesWithStats() {
    if (!fs.existsSync(CACHE_CONFIG.downloadDir)) return [];

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
            } catch (error) { /* skip */ }
        }
    } catch (error) { /* skip */ }
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
                age: Math.floor((Date.now() - f.mtime) / (1000 * 60 * 60))
            })),
            config: {
                maxSizeMB: CACHE_CONFIG.maxSizeMB,
                autoCleanupEnabled: CACHE_CONFIG.autoCleanupEnabled,
                cleanupCount: CACHE_CONFIG.cleanupCountPerBatch
            }
        };
    } catch (error) {
        return { sizeMB: '0', count: 0, files: [], error: error.message };
    }
}

function cleanDownloads(forceAll = false, maxAge = 24) {
    if (!fs.existsSync(CACHE_CONFIG.downloadDir)) return 0;

    try {
        const files = getDownloadFilesWithStats();
        let deletedCount = 0;

        if (forceAll) {
            for (const file of files) {
                try {
                    fs.unlinkSync(file.path);
                    deletedCount++;
                } catch (error) { /* skip */ }
            }
        } else {
            const maxAgeMs = maxAge * 60 * 60 * 1000;
            const now = Date.now();
            for (const file of files) {
                if (now - file.mtime > maxAgeMs) {
                    try {
                        fs.unlinkSync(file.path);
                        deletedCount++;
                    } catch (error) { /* skip */ }
                }
            }
        }

        return deletedCount;
    } catch (error) {
        return 0;
    }
}

function getCacheConfig() {
    return CACHE_CONFIG;
}

// ==================== SINGLETON & EXPORTS ====================

const musicPlayer = new MusicPlayer();

module.exports = {
    // DisTube integration
    setDistube: (distube) => musicPlayer.setDistube(distube),
    getQueue: (guildId) => musicPlayer.getQueue(guildId),

    // Player management
    getPlayer: (guildId) => musicPlayer.getPlayer(guildId),
    getCurrentSong: (guildId) => musicPlayer.getCurrentSong(guildId),
    isPlaying: (guildId) => musicPlayer.isPlaying(guildId),
    isPaused: (guildId) => musicPlayer.isPaused(guildId),
    pause: (guildId) => musicPlayer.pause(guildId),
    resume: (guildId) => musicPlayer.resume(guildId),
    skip: (guildId) => musicPlayer.skip(guildId),
    stop: (guildId) => musicPlayer.stop(guildId),
    disconnect: (guildId) => musicPlayer.disconnect(guildId),

    // Loop/repeat mode
    setRepeatMode: (guildId, mode) => musicPlayer.setRepeatMode(guildId, mode),
    getRepeatMode: (guildId) => musicPlayer.getRepeatMode(guildId),
    loopModeToRepeatMode: (mode) => musicPlayer.loopModeToRepeatMode(mode),
    repeatModeToLoopMode: (mode) => musicPlayer.repeatModeToLoopMode(mode),

    // 24/7 mode
    get24hStatus: (guildId) => musicPlayer.get24hStatus(guildId),
    start24hMode: (guildId, channelId) => musicPlayer.start24hMode(guildId, channelId),
    stop24hMode: (guildId) => musicPlayer.stop24hMode(guildId),
    playPreset24h: (guildId) => musicPlayer.playPreset24h(guildId),

    // Auto-suggestion management
    checkAndAddAutoSuggestions: (guildId, queue) => musicPlayer.checkAndAddAutoSuggestions(guildId, queue),
    addInitialAutoSuggestions: (guildId, queue, userId) => musicPlayer.addInitialAutoSuggestions(guildId, queue, userId),
    resetAutoSuggestionCounter: (guildId) => musicPlayer.resetAutoSuggestionCounter(guildId),
    getAutoSuggestionStats: (guildId) => musicPlayer.getAutoSuggestionStats(guildId),

    // Disconnect timer management
    scheduleDisconnect: (guildId, reason) => musicPlayer.scheduleDisconnect(guildId, reason),
    cancelScheduledDisconnect: (guildId) => musicPlayer.cancelScheduledDisconnect(guildId),

    // Scheduled cleanup
    startScheduledCleanup: () => musicPlayer.startScheduledCleanup(),
    stopScheduledCleanup: () => musicPlayer.stopScheduledCleanup(),
    performScheduledCleanup: () => musicPlayer.performScheduledCleanup(),

    // Legacy cache management
    getDownloadStats,
    cleanDownloads,
    checkCacheSizeAndCleanup,
    getCacheConfig,

    // Song conversion utility
    _convertSong: (song) => musicPlayer._convertSong(song)
};
