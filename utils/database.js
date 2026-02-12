const fs = require('fs').promises;
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, '..', 'data');
        this.cacheFile = path.join(this.dbPath, 'cache.json');
        this.queueFile = path.join(this.dbPath, 'queues.json');
        this.settingsFile = path.join(this.dbPath, 'guild_settings.json');
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.dbPath, { recursive: true });
            
            // Initialize cache file
            try {
                await fs.access(this.cacheFile);
            } catch {
                await fs.writeFile(this.cacheFile, JSON.stringify({}));
            }
            
            // Initialize queue file
            try {
                await fs.access(this.queueFile);
            } catch {
                await fs.writeFile(this.queueFile, JSON.stringify({}));
            }

            // Initialize settings file
            try {
                await fs.access(this.settingsFile);
            } catch {
                await fs.writeFile(this.settingsFile, JSON.stringify({}));
            }
        } catch (error) {
            console.error('Database init error:', error);
        }
    }

    async getCache(videoId) {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf8');
            const cache = JSON.parse(data);
            return cache[videoId] || null;
        } catch {
            return null;
        }
    }

    async setCache(videoId, videoInfo) {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf8');
            const cache = JSON.parse(data);
            cache[videoId] = {
                ...videoInfo,
                cachedAt: Date.now()
            };
            await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
        } catch (error) {
            console.error('Cache write error:', error);
        }
    }

    async getQueue(guildId) {
        try {
            const data = await fs.readFile(this.queueFile, 'utf8');
            const queues = JSON.parse(data);
            return queues[guildId] || [];
        } catch {
            return [];
        }
    }

    async setQueue(guildId, queue) {
        try {
            const data = await fs.readFile(this.queueFile, 'utf8');
            const queues = JSON.parse(data);
            queues[guildId] = queue;
            await fs.writeFile(this.queueFile, JSON.stringify(queues, null, 2));
        } catch (error) {
            console.error('Queue write error:', error);
        }
    }

    async addToQueue(guildId, song, priority = 'manual') {
        const queue = await this.getQueue(guildId);
        
        if (priority === 'auto' || song.autoSuggestion) {
            // Auto-suggestions go to the end of the queue
            queue.push(song);
        } else {
            // Manual requests are prioritized
            // Find the insertion point: after all manual songs but before auto-suggestions
            let insertIndex = queue.length;
            for (let i = 0; i < queue.length; i++) {
                if (queue[i].autoSuggestion) {
                    insertIndex = i;
                    break;
                }
            }
            queue.splice(insertIndex, 0, song);
        }
        
        await this.setQueue(guildId, queue);
        return queue;
    }

    async removeFromQueue(guildId, index = 0) {
        const queue = await this.getQueue(guildId);
        if (queue.length > index) {
            queue.splice(index, 1);
            await this.setQueue(guildId, queue);
        }
        return queue;
    }

    async clearQueue(guildId) {
        await this.setQueue(guildId, []);
    }

    async updateSongInQueue(guildId, index, updatedSong) {
        try {
            const queue = await this.getQueue(guildId);
            if (queue.length > index) {
                queue[index] = { ...queue[index], ...updatedSong };
                await this.setQueue(guildId, queue);
            }
            return queue;
        } catch (error) {
            console.error('Update song error:', error);
            return [];
        }
    }

    async cleanExpiredCache() {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf8');
            const cache = JSON.parse(data);
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;
            
            Object.keys(cache).forEach(key => {
                if (cache[key].cachedAt && (now - cache[key].cachedAt) > oneHour) {
                    delete cache[key];
                }
            });
            
            await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
        } catch (error) {
            console.error('Cache cleanup error:', error);
        }
    }

    async getLoopMode(guildId) {
        try {
            const data = await fs.readFile(this.settingsFile, 'utf8');
            const settings = JSON.parse(data);
            return settings[guildId]?.loop_mode || 'off';
        } catch (error) {
            console.error('Error getting loop mode:', error);
            return 'off';
        }
    }

    async setLoopMode(guildId, mode) {
        try {
            const data = await fs.readFile(this.settingsFile, 'utf8');
            const settings = JSON.parse(data);
            
            if (!settings[guildId]) {
                settings[guildId] = {};
            }
            
            settings[guildId].loop_mode = mode;
            settings[guildId].updated_at = Date.now();
            
            await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2));
        } catch (error) {
            console.error('Error setting loop mode:', error);
        }
    }

    async set24hMode(guildId, enabled, channelId = null) {
        try {
            const data = await fs.readFile(this.settingsFile, 'utf8');
            const settings = JSON.parse(data);
            
            if (!settings[guildId]) {
                settings[guildId] = {};
            }
            
            settings[guildId].mode_24h = enabled;
            settings[guildId].channel_24h = channelId;
            settings[guildId].updated_at = Date.now();
            
            await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2));
        } catch (error) {
            console.error('Error setting 24h mode:', error);
        }
    }

    async get24hMode(guildId) {
        try {
            const data = await fs.readFile(this.settingsFile, 'utf8');
            const settings = JSON.parse(data);
            return {
                enabled: settings[guildId]?.mode_24h || false,
                channelId: settings[guildId]?.channel_24h || null
            };
        } catch (error) {
            console.error('Error getting 24h mode:', error);
            return { enabled: false, channelId: null };
        }
    }

    /**
     * Get recent guild activity for auto-suggestion user detection
     */
    async getGuildHistory(guildId, limit = 10) {
        try {
            const recommendationEngine = require('./recommendationEngine.js');
            return recommendationEngine.getServerHistory(guildId, limit);
        } catch (error) {
            console.error('Error getting guild history:', error);
            return [];
        }
    }
}

module.exports = Database;

