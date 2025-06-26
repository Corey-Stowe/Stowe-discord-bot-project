const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

class YoutubeApiManager {
    constructor() {
        this.apiKeysFile = path.join(__dirname, '../data/youtube_api_keys.json');
        this.apiKeys = this.loadApiKeys();
        this.currentKeyIndex = 0;
        this.rateLimitDelay = 100; // 100ms between requests
        this.lastRequestTime = 0;
        this.dailyQuotaUsed = 0;
        this.dailyQuotaLimit = 10000; // Default YouTube API quota
        this.lastQuotaReset = this.getTodayTimestamp();
        // Fix: Check environment variable properly - only enabled if explicitly set to 'true'
        this.isEnabled = process.env.YOUTUBE_API_ENABLED === 'true';
    }

    loadApiKeys() {
        try {
            if (fs.existsSync(this.apiKeysFile)) {
                const data = fs.readFileSync(this.apiKeysFile, 'utf8');
                const parsed = JSON.parse(data);
                return {
                    keys: parsed.keys || [],
                    quotaUsage: parsed.quotaUsage || {},
                    lastUpdated: parsed.lastUpdated || Date.now()
                };
            }
        } catch (error) {
            console.warn('Failed to load API keys:', error.message);
        }
        return {
            keys: [],
            quotaUsage: {},
            lastUpdated: Date.now()
        };
    }

    saveApiKeys() {
        try {
            const data = {
                keys: this.apiKeys.keys,
                quotaUsage: this.apiKeys.quotaUsage,
                lastUpdated: Date.now()
            };
            fs.writeFileSync(this.apiKeysFile, JSON.stringify(data, null, 2));
            console.log('✅ API keys saved successfully');
        } catch (error) {
            console.error('Failed to save API keys:', error.message);
        }
    }

    // Add a new API key
    addApiKey(keyData) {
        const newKey = {
            id: this.generateKeyId(),
            key: keyData.key,
            name: keyData.name || `API Key ${this.apiKeys.keys.length + 1}`,
            owner: keyData.owner,
            addedAt: Date.now(),
            isActive: true,
            quotaUsed: 0,
            dailyLimit: keyData.dailyLimit || 10000,
            lastUsed: null,
            errorCount: 0,
            lastError: null
        };

        this.apiKeys.keys.push(newKey);
        this.saveApiKeys();
        return newKey.id;
    }

    // Remove an API key
    removeApiKey(keyId, ownerId) {
        const keyIndex = this.apiKeys.keys.findIndex(k => k.id === keyId);
        if (keyIndex === -1) {
            throw new Error('API key not found');
        }

        const key = this.apiKeys.keys[keyIndex];
        if (key.owner !== ownerId && ownerId !== process.env.ADMIN_ID) {
            throw new Error('You can only remove your own API keys');
        }

        this.apiKeys.keys.splice(keyIndex, 1);
        this.saveApiKeys();
        return true;
    }

    // Fix: Add method to refresh enabled status from environment
    refreshEnabledStatus() {
        this.isEnabled = process.env.YOUTUBE_API_ENABLED === 'true';
        console.log(`🔄 YouTube API Manager - Refreshed enabled status: ${this.isEnabled}`);
        return this.isEnabled;
    }

    // Check if API system is enabled
    isApiEnabled() {
        // Fixed: Only check if API is enabled in environment, not if keys exist
        // The keys check should be done separately when actually using the API
        return this.isEnabled;
    }

    // Check if API system has working keys
    hasWorkingApiKeys() {
        return this.isEnabled && this.apiKeys.keys.length > 0;
    }

    // Get working API key with rotation
    getWorkingApiKey() {
        if (!this.isEnabled) {
            throw new Error('YouTube API system is disabled. Set YOUTUBE_API_ENABLED=true in .env');
        }
        
        // Reset daily quota if it's a new day
        const today = this.getTodayTimestamp();
        if (today !== this.lastQuotaReset) {
            this.resetDailyQuota();
            this.lastQuotaReset = today;
        }

        // Find an active key with available quota
        const activeKeys = this.apiKeys.keys.filter(key => 
            key.isActive && 
            key.quotaUsed < key.dailyLimit &&
            key.errorCount < 5 // Skip keys with too many errors
        );

        if (activeKeys.length === 0) {
            throw new Error('All API keys have exceeded their daily quota or are inactive');
        }

        // Rotate through available keys
        this.currentKeyIndex = this.currentKeyIndex % activeKeys.length;
        const selectedKey = activeKeys[this.currentKeyIndex];
        this.currentKeyIndex++;

        return selectedKey;
    }

    // Create YouTube API client with current key
    async createYouTubeClient() {
        const apiKey = this.getWorkingApiKey();
        
        const youtube = google.youtube({
            version: 'v3',
            auth: apiKey.key
        });

        return {
            client: youtube,
            keyInfo: {
                id: apiKey.id,
                name: apiKey.name,
                quotaUsed: apiKey.quotaUsed,
                dailyLimit: apiKey.dailyLimit
            }
        };
    }

    // Rate limiting
    async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.rateLimitDelay) {
            const waitTime = this.rateLimitDelay - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }

    // Record API usage
    recordApiUsage(keyId, quotaCost = 1, success = true, error = null) {
        const key = this.apiKeys.keys.find(k => k.id === keyId);
        if (key) {
            key.quotaUsed += quotaCost;
            key.lastUsed = Date.now();
            
            if (!success) {
                key.errorCount++;
                key.lastError = error;
                
                // Disable key if too many errors
                if (key.errorCount >= 10) {
                    key.isActive = false;
                    console.warn(`API key ${key.name} disabled due to too many errors`);
                }
            } else {
                // Reset error count on successful use
                key.errorCount = Math.max(0, key.errorCount - 1);
            }
            
            this.saveApiKeys();
        }
    }

    // Search videos using API
    async searchVideos(query, maxResults = 5) {
        await this.rateLimit();
        
        const { client, keyInfo } = await this.createYouTubeClient();
        
        try {
            const response = await client.search.list({
                part: 'snippet',
                q: query,
                type: 'video',
                maxResults: maxResults,
                order: 'relevance'
            });

            this.recordApiUsage(keyInfo.id, 100, true); // Search costs 100 quota units

            return response.data.items.map(item => ({
                videoId: item.id.videoId,
                title: item.snippet.title,
                author: item.snippet.channelTitle,
                thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url,
                description: item.snippet.description,
                publishedAt: item.snippet.publishedAt,
                url: `https://www.youtube.com/watch?v=${item.id.videoId}`
            }));
        } catch (error) {
            this.recordApiUsage(keyInfo.id, 100, false, error.message);
            throw error;
        }
    }

    // Get video details using API
    async getVideoDetails(videoId) {
        await this.rateLimit();
        
        const { client, keyInfo } = await this.createYouTubeClient();
        
        try {
            const response = await client.videos.list({
                part: 'snippet,contentDetails,statistics',
                id: videoId
            });

            this.recordApiUsage(keyInfo.id, 1, true); // Video details costs 1 quota unit

            if (response.data.items.length === 0) {
                throw new Error('Video not found');
            }

            const video = response.data.items[0];
            const duration = this.parseDuration(video.contentDetails.duration);

            return {
                videoId: video.id,
                title: video.snippet.title,
                author: video.snippet.channelTitle,
                thumbnail: video.snippet.thumbnails.maxres?.url || video.snippet.thumbnails.high?.url,
                description: video.snippet.description,
                duration: duration,
                durationFormatted: this.formatDuration(duration),
                viewCount: parseInt(video.statistics.viewCount || 0),
                publishedAt: video.snippet.publishedAt,
                url: `https://www.youtube.com/watch?v=${video.id}`
            };
        } catch (error) {
            this.recordApiUsage(keyInfo.id, 1, false, error.message);
            throw error;
        }
    }

    // Get playlist details using API
    async getPlaylistDetails(playlistId, maxResults = 50) {
        await this.rateLimit();
        
        const { client, keyInfo } = await this.createYouTubeClient();
        
        try {
            // Get playlist info
            const playlistResponse = await client.playlists.list({
                part: 'snippet,contentDetails',
                id: playlistId
            });

            if (playlistResponse.data.items.length === 0) {
                throw new Error('Playlist not found');
            }

            const playlist = playlistResponse.data.items[0];

            // Get playlist items
            const itemsResponse = await client.playlistItems.list({
                part: 'snippet',
                playlistId: playlistId,
                maxResults: maxResults
            });

            this.recordApiUsage(keyInfo.id, 2, true); // Playlist details costs 2 quota units

            const videos = itemsResponse.data.items
                .filter(item => item.snippet.resourceId?.videoId) // Filter out deleted videos
                .map(item => ({
                    videoId: item.snippet.resourceId.videoId,
                    title: item.snippet.title,
                    author: item.snippet.videoOwnerChannelTitle || playlist.snippet.channelTitle,
                    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url,
                    url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
                }));

            return {
                playlistId: playlist.id,
                title: playlist.snippet.title,
                author: playlist.snippet.channelTitle,
                thumbnail: playlist.snippet.thumbnails.medium?.url || playlist.snippet.thumbnails.default.url,
                description: playlist.snippet.description,
                videoCount: videos.length,
                videos: videos
            };
        } catch (error) {
            this.recordApiUsage(keyInfo.id, 2, false, error.message);
            throw error;
        }
    }

    // Test API key validity
    async testApiKey(apiKey) {
        try {
            const youtube = google.youtube({
                version: 'v3',
                auth: apiKey
            });

            // Simple test query
            await youtube.search.list({
                part: 'snippet',
                q: 'test',
                type: 'video',
                maxResults: 1
            });

            return { valid: true, error: null };
        } catch (error) {
            return { 
                valid: false, 
                error: error.message.includes('API key') ? 'Invalid API key' : error.message 
            };
        }
    }

    // Get API key statistics
    getApiKeyStats(ownerId = null) {
        let keys = this.apiKeys.keys;
        
        if (ownerId && ownerId !== process.env.ADMIN_ID) {
            keys = keys.filter(key => key.owner === ownerId);
        }

        return {
            totalKeys: keys.length,
            activeKeys: keys.filter(k => k.isActive).length,
            totalQuotaUsed: keys.reduce((sum, k) => sum + k.quotaUsed, 0),
            totalDailyLimit: keys.reduce((sum, k) => sum + k.dailyLimit, 0),
            keys: keys.map(key => ({
                id: key.id,
                name: key.name,
                owner: key.owner,
                isActive: key.isActive,
                quotaUsed: key.quotaUsed,
                dailyLimit: key.dailyLimit,
                quotaPercentage: ((key.quotaUsed / key.dailyLimit) * 100).toFixed(1),
                lastUsed: key.lastUsed,
                errorCount: key.errorCount,
                addedAt: key.addedAt
            }))
        };
    }

    // Helper methods
    generateKeyId() {
        return 'key_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    getTodayTimestamp() {
        const today = new Date();
        return Math.floor(today.setHours(0, 0, 0, 0) / 1000);
    }

    resetDailyQuota() {
        this.apiKeys.keys.forEach(key => {
            key.quotaUsed = 0;
            key.errorCount = Math.max(0, key.errorCount - 2); // Reduce error count daily
        });
        this.saveApiKeys();
    }

    parseDuration(duration) {
        // Parse ISO 8601 duration (PT4M13S) to seconds
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 0;
        
        const hours = parseInt(match[1] || 0);
        const minutes = parseInt(match[2] || 0);
        const seconds = parseInt(match[3] || 0);
        
        return hours * 3600 + minutes * 60 + seconds;
    }

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    // Clear all API keys
    clearAllApiKeys() {
        this.apiKeys = {
            keys: [],
            quotaUsage: {},
            lastUpdated: Date.now()
        };
        this.saveApiKeys();
    }

    // Update API key settings
    updateApiKey(keyId, ownerId, updates) {
        const key = this.apiKeys.keys.find(k => k.id === keyId);
        if (!key) {
            throw new Error('API key not found');
        }

        if (key.owner !== ownerId && ownerId !== process.env.ADMIN_ID) {
            throw new Error('You can only update your own API keys');
        }

        if (updates.name) key.name = updates.name;
        if (updates.dailyLimit) key.dailyLimit = updates.dailyLimit;
        if (updates.isActive !== undefined) key.isActive = updates.isActive;

        this.saveApiKeys();
        return key;
    }
}

module.exports = new YoutubeApiManager();
