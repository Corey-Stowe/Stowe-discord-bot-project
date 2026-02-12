const fs = require('fs');
const path = require('path');
const LastFm = require('../Plugins/LastFm.js');
const logger = require('./logger.js');
const { search: ytdlpSearch } = require('./ytdlpSearch');

class RecommendationEngine {
    constructor() {
        this.historyPath = path.join(__dirname, '../data/play_history.json');
        this.settingsPath = path.join(__dirname, '../data/suggestion_settings.json');
        this.lastfm = new LastFm();
        this.distube = null; // Set via setDistube() after DisTube init
        this.ensureDataDir();
    }

    /**
     * Set DisTube instance for search functionality (called from index.js)
     */
    setDistube(distube) {
        this.distube = distube;
    }

    /**
     * Search for videos using yt-dlp directly (DisTube v5 has no public search API)
     * Returns results in compatible format: { title, author, url, thumbnail, duration, durationFormatted, views }
     */
    async searchVideos(query, limit = 5) {
        try {
            return await ytdlpSearch(query, limit);
        } catch (error) {
            logger.error('RECOMMENDATION', `yt-dlp search failed for "${query}": ${error.message}`);
            return [];
        }
    }

    ensureDataDir() {
        const dataDir = path.dirname(this.historyPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    // ==================== HISTORY LOADING METHODS ====================
    
    /**
     * Load play history - V2 format (user-centric)
     */
    loadHistory() {
        if (fs.existsSync(this.historyPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.historyPath, 'utf8'));
                
                // Ensure it's V2 format with users and guilds
                if (data.users && data.guilds) {
                    return data;
                } else {
                    // Initialize empty V2 structure
                    return this.getEmptyHistoryStructure();
                }
            } catch (error) {
                console.error('Error loading history:', error);
                return this.getEmptyHistoryStructure();
            }
        }
        
        return this.getEmptyHistoryStructure();
    }

    getEmptyHistoryStructure() {
        return {
            users: {},
            guilds: {},
            migrationInfo: {
                version: "2.0",
                createdAt: Date.now(),
                description: "User-centric play history with cross-server support"
            }
        };
    }

    /**
     * Save history in V2 format
     */
    saveHistory(data) {
        try {
            fs.writeFileSync(this.historyPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving history:', error);
        }
    }

    // ==================== PLAY HISTORY MANAGEMENT ====================
    
    async trackPlayHistory(guildId, song, userId, userTag) {
        let data = this.loadHistory();
        
        // Initialize structures if needed
        if (!data.users[userId]) {
            data.users[userId] = {
                username: userTag || 'Unknown',
                totalPlays: 0,
                joinedAt: Date.now(),
                lastActivity: Date.now(),
                preferences: {
                    topGenres: [],
                    averageDuration: 0,
                    mostActiveHours: [],
                    totalListeningTime: 0
                },
                globalHistory: [],
                stats: {
                    uniqueArtists: 0,
                    uniqueGenres: 0,
                    totalLastfmData: 0,
                    crossServerActivity: 0
                }
            };
        }

        if (!data.guilds[guildId]) {
            data.guilds[guildId] = {
                name: `Guild ${guildId.substring(0, 6)}...`,
                totalPlays: 0,
                uniqueUsers: 0,
                topGenres: [],
                createdAt: Date.now(),
                lastActivity: Date.now(),
                recentActivity: []
            };
        }

        // 🎵 Enhanced metadata extraction with Last.fm
        const enhancedSong = await this.enhanceMetadata(song);

        const historyEntry = {
            title: enhancedSong.title,
            author: enhancedSong.author,
            thumbnail: enhancedSong.thumbnail,
            originalUrl: enhancedSong.originalUrl,
            platform: enhancedSong.platform || 'youtube',
            guildId: guildId,
            guildName: data.guilds[guildId].name,
            playedAt: Date.now(),
            addedAt: Date.now(),
            genre: enhancedSong.genre || 'unknown',
            duration: enhancedSong.duration || null,
            durationFormatted: enhancedSong.durationFormatted || null,
            tags: enhancedSong.tags || [],
            lastfmData: enhancedSong.lastfmData || null
        };

        // Add to user's global history
        data.users[userId].globalHistory.push(historyEntry);
        data.users[userId].totalPlays++;
        data.users[userId].lastActivity = Date.now();

        // Keep only last 1000 entries per user
        if (data.users[userId].globalHistory.length > 1000) {
            data.users[userId].globalHistory = data.users[userId].globalHistory.slice(-1000);
        }

        // Add to guild's recent activity
        const guildActivity = {
            userId: userId,
            username: userTag || 'Unknown',
            title: enhancedSong.title,
            author: enhancedSong.author,
            playedAt: Date.now(),
            genre: enhancedSong.genre,
            duration: enhancedSong.duration
        };

        data.guilds[guildId].recentActivity.push(guildActivity);
        data.guilds[guildId].totalPlays++;
        data.guilds[guildId].lastActivity = Date.now();

        // Keep only last 100 guild activities
        if (data.guilds[guildId].recentActivity.length > 100) {
            data.guilds[guildId].recentActivity = data.guilds[guildId].recentActivity.slice(-100);
        }

        // Update guild unique users
        const guildUsers = new Set(data.guilds[guildId].recentActivity.map(a => a.userId));
        data.guilds[guildId].uniqueUsers = guildUsers.size;

        // 📊 Update user preferences
        this.updateUserPreferences(data.users[userId], enhancedSong);

        this.saveHistory(data);

        if (enhancedSong.genre && enhancedSong.genre !== 'unknown') {
            logger.info('RECOMMENDATION', `Tracked enhanced play history for ${userTag}: ${enhancedSong.title} [Genre: ${enhancedSong.genre}] [V2]`);
        }

        return historyEntry;
    }

    /**
     * Update user preferences based on played song
     */
    updateUserPreferences(userData, song) {
        if (!userData.preferences) {
            userData.preferences = {
                topGenres: [],
                averageDuration: 0,
                totalListeningTime: 0,
                mostActiveHours: []
            };
        }

        // 🎵 Update genre preferences
        if (song.genre && song.genre !== 'unknown') {
            const existingGenre = userData.preferences.topGenres.find(g => g.genre === song.genre);
            if (existingGenre) {
                existingGenre.count++;
            } else {
                userData.preferences.topGenres.push({ genre: song.genre, count: 1 });
            }
            
            // Sort by count and keep top 10
            userData.preferences.topGenres.sort((a, b) => b.count - a.count);
            userData.preferences.topGenres = userData.preferences.topGenres.slice(0, 10);
        }

        // ⏱️ Update duration preferences
        if (song.duration) {
            const currentTotal = userData.preferences.totalListeningTime || 0;
            const currentAvg = userData.preferences.averageDuration || 0;
            const totalPlays = userData.totalPlays;
            
            userData.preferences.totalListeningTime = currentTotal + song.duration;
            userData.preferences.averageDuration = Math.round(
                (currentAvg * (totalPlays - 1) + song.duration) / totalPlays
            );
        }

        // 🕐 Update active hours
        const playTime = song.playedAt || song.addedAt || Date.now();
        const currentHour = new Date(playTime).getHours();
        const existingHour = userData.preferences.mostActiveHours.find(h => h.hour === currentHour);
        if (existingHour) {
            existingHour.count++;
        } else {
            userData.preferences.mostActiveHours.push({ hour: currentHour, count: 1 });
        }
        
        // Sort by count and keep top 24 (all hours)
        userData.preferences.mostActiveHours.sort((a, b) => b.count - a.count);
        userData.preferences.mostActiveHours = userData.preferences.mostActiveHours.slice(0, 24);
    }

    // ==================== METADATA ENHANCEMENT ====================

    /**
     * Clean artist name for Last.fm lookup
     */
    cleanArtistName(author) {
        if (!author) return author;
        
        // Handle VEVO channels
        if (author.toLowerCase().includes('vevo')) {
            let withoutVEVO = author.replace(/VEVO$/i, '');
            
            // Handle special cases for known artists
            const artistMap = {
                'dojacat': 'Doja Cat',
                'postmalone': 'Post Malone',
                'stephensanchez': 'Stephen Sanchez',
                'arianagrande': 'Ariana Grande',
                'taylorswift': 'Taylor Swift',
                'justinbieber': 'Justin Bieber',
                'billieeilish': 'Billie Eilish',
                'theweeknd': 'The Weeknd',
                'dualipa': 'Dua Lipa'
            };
            
            const lowerArtist = withoutVEVO.toLowerCase();
            if (artistMap[lowerArtist]) {
                return artistMap[lowerArtist];
            }
            
            // Try camelCase splitting for regular cases
            if (/[A-Z]/.test(withoutVEVO)) {
                const words = withoutVEVO.split(/(?=[A-Z])/).filter(word => word.length > 0);
                return words.join(' ').trim();
            }
            
            // For all lowercase, try to split known patterns
            if (lowerArtist.length > 6) {
                // Common patterns like "firstname lastname"
                const commonSplits = [
                    [lowerArtist.slice(0, 4), lowerArtist.slice(4)], // 4-char first name
                    [lowerArtist.slice(0, 5), lowerArtist.slice(5)], // 5-char first name
                    [lowerArtist.slice(0, 6), lowerArtist.slice(6)]  // 6-char first name
                ];
                
                // Return the first reasonable split
                for (const [first, last] of commonSplits) {
                    if (first.length >= 3 && last.length >= 3) {
                        return `${first.charAt(0).toUpperCase()}${first.slice(1)} ${last.charAt(0).toUpperCase()}${last.slice(1)}`;
                    }
                }
            }
            
            // Fallback: capitalize first letter
            return withoutVEVO.charAt(0).toUpperCase() + withoutVEVO.slice(1);
        }
        
        return author
            .replace(/Official$/i, '')       // Remove Official suffix  
            .replace(/Music$/i, '')          // Remove Music suffix
            .replace(/Channel$/i, '')        // Remove Channel suffix
            .replace(/Records$/i, '')        // Remove Records suffix
            .replace(/Entertainment$/i, '')  // Remove Entertainment suffix
            .replace(/\s+/g, ' ')           // Normalize whitespace
            .trim();
    }

    /**
     * Clean track title for Last.fm lookup
     */
    cleanTrackTitle(title) {
        if (!title) return title;
        
        let cleaned = title
            .replace(/\[Official.*?\]/gi, '')           // Remove [Official Video] etc
            .replace(/\(Official.*?\)/gi, '')           // Remove (Official Video) etc
            .replace(/\[.*?Music Video.*?\]/gi, '')     // Remove [Music Video] etc
            .replace(/\(.*?Music Video.*?\)/gi, '')     // Remove (Music Video) etc
            .replace(/\[HD\]/gi, '')                    // Remove [HD]
            .replace(/\(HD\)/gi, '')                    // Remove (HD)
            .replace(/\s+/g, ' ')                       // Normalize whitespace
            .trim();
            
        // Handle cases where artist name is included in title (like "Pink Sweat$ - At My Worst")
        // Extract just the song part after the dash
        const dashIndex = cleaned.indexOf(' - ');
        if (dashIndex !== -1) {
            // Check if the part before the dash might be an artist name
            const beforeDash = cleaned.substring(0, dashIndex).trim();
            const afterDash = cleaned.substring(dashIndex + 3).trim();
            
            // If both parts exist and the first part looks like an artist name,
            // return just the song part
            if (beforeDash.length > 0 && afterDash.length > 0) {
                return afterDash;
            }
        }
        
        return cleaned;
    }

    async enhanceMetadata(song) {
        const startTime = Date.now();
        
        try {
            const enhanced = {
                title: song.title,
                author: song.author,
                thumbnail: song.thumbnail,
                originalUrl: song.originalUrl,
                platform: song.platform || 'youtube',
                duration: song.duration,
                durationFormatted: song.durationFormatted,
                genre: null,
                tags: [],
                lastfmData: null
            };

            // 🎵 Last.fm enhancement
            if (this.lastfm?.isEnabled() && song.title && song.author) {
                // Clean artist and title for better Last.fm matching
                const cleanArtist = this.cleanArtistName(song.author);
                const cleanTitle = this.cleanTrackTitle(song.title);
                
                console.log(`🎵 Fetching Last.fm metadata for: ${cleanArtist} - ${cleanTitle}`);
                
                try {
                    const lastfmData = await this.lastfm.getEnhancedMetadata(cleanArtist, cleanTitle);
                    
                    if (lastfmData) {
                        enhanced.genre = lastfmData.genre || enhanced.genre;
                        enhanced.duration = lastfmData.duration || enhanced.duration;
                        enhanced.tags = lastfmData.tags || enhanced.tags;
                        enhanced.lastfmData = {
                            trackListeners: lastfmData.popularity?.trackListeners || 0,
                            trackPlaycount: lastfmData.popularity?.trackPlaycount || 0,
                            artistListeners: lastfmData.popularity?.artistListeners || 0,
                            artistPlaycount: lastfmData.popularity?.artistPlaycount || 0,
                            summary: lastfmData.summary || ''
                        };
                        
                        if (enhanced.duration && !enhanced.durationFormatted) {
                            enhanced.durationFormatted = this.formatDuration(enhanced.duration);
                        }
                        
                        console.log(`✅ Last.fm data found: Genre=${enhanced.genre}, Duration=${enhanced.durationFormatted}`);
                    } else {
                        console.log(`⚠️ No Last.fm data found for: ${cleanArtist} - ${cleanTitle}`);
                    }
                } catch (lastfmError) {
                    console.log(`❌ Last.fm error: ${lastfmError.message}`);
                }
            }

            // 🔍 YouTube duration fallback if still missing
            if (!enhanced.duration && enhanced.platform === 'youtube' && (enhanced.title || enhanced.author)) {
                try {
                    const artist = enhanced.author || '';
                    const title = enhanced.title || '';
                    logger.info('RECOMMENDATION', `Fetching duration from YouTube for: ${artist} - ${title}`);
                    const durationSearchQuery = `${artist} ${title}`.trim();
                    const searchResults = await this.searchVideos(durationSearchQuery, 1);
                    
                    if (searchResults && searchResults.length > 0) {
                        const firstResult = searchResults[0];
                        if (firstResult.duration) {
                            enhanced.duration = firstResult.duration;
                            enhanced.durationFormatted = firstResult.durationFormatted || this.formatDuration(firstResult.duration);
                            console.log(`✅ YouTube duration found: ${enhanced.durationFormatted}`);
                        }
                    }
                } catch (youtubeError) {
                    console.log(`❌ YouTube duration lookup error: ${youtubeError.message}`);
                }
            }

            // 🔍 Local genre detection fallback
            if (!enhanced.genre || enhanced.genre === 'unknown') {
                enhanced.genre = this.detectGenreLocally(song.title, song.author);
                console.log(`🔍 Local genre detection: ${enhanced.genre}`);
            }

            // 📊 Estimate duration if still missing (last resort)
            if (!enhanced.duration) {
                enhanced.duration = this.estimateDuration(enhanced.title);
                enhanced.durationFormatted = this.formatDuration(enhanced.duration);
                console.log(`🔮 Estimated duration: ${enhanced.durationFormatted}`);
            }

            const processingTime = Date.now() - startTime;
            if (processingTime > 1000) {
                console.log(`⏱️ Metadata enhancement took ${processingTime}ms`);
            }

            return enhanced;
            
        } catch (error) {
            console.error('Metadata enhancement error:', error);
            return {
                title: song.title,
                author: song.author,
                thumbnail: song.thumbnail,
                originalUrl: song.originalUrl,
                platform: song.platform || 'youtube',
                duration: song.duration,
                durationFormatted: song.durationFormatted,
                genre: 'unknown',
                tags: [],
                lastfmData: null
            };
        }
    }

    detectGenreLocally(title, author) {
        const genreKeywords = {
            'electronic': ['electronic', 'edm', 'dubstep', 'techno', 'house', 'trance', 'dnb', 'drum and bass'],
            'rock': ['rock', 'metal', 'punk', 'alternative', 'indie rock', 'hard rock'],
            'pop': ['pop', 'mainstream', 'chart', 'hit'],
            'hip-hop': ['hip hop', 'rap', 'trap', 'drill', 'freestyle'],
            'jazz': ['jazz', 'swing', 'blues', 'bebop'],
            'classical': ['classical', 'orchestra', 'symphony', 'piano', 'violin'],
            'country': ['country', 'folk', 'bluegrass', 'western'],
            'r&b': ['r&b', 'soul', 'funk', 'motown'],
            'reggae': ['reggae', 'ska', 'dub']
        };

        const searchText = `${title} ${author}`.toLowerCase();
        
        for (const [genre, keywords] of Object.entries(genreKeywords)) {
            if (keywords.some(keyword => searchText.includes(keyword))) {
                return genre;
            }
        }
        
        return 'unknown';
    }

    formatDuration(seconds) {
        if (!seconds) return null;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    estimateDuration(title) {
        // Estimate duration based on song title patterns and type
        if (!title) return 180; // Default 3 minutes
        
        const titleLower = title.toLowerCase();
        
        // Extended versions or mixes tend to be longer
        if (titleLower.includes('extended') || titleLower.includes('remix') || 
            titleLower.includes('mix') || titleLower.includes('version')) {
            return 240; // 4 minutes
        }
        
        // Live versions tend to be longer
        if (titleLower.includes('live') || titleLower.includes('concert')) {
            return 300; // 5 minutes
        }
        
        // Classical or instrumental tend to be longer
        if (titleLower.includes('symphony') || titleLower.includes('concerto') || 
            titleLower.includes('sonata') || titleLower.includes('instrumental')) {
            return 360; // 6 minutes
        }
        
        // Electronic dance music tends to be longer
        if (titleLower.includes('trance') || titleLower.includes('house') || 
            titleLower.includes('techno') || titleLower.includes('progressive')) {
            return 420; // 7 minutes
        }
        
        // Short formats
        if (titleLower.includes('intro') || titleLower.includes('outro') || 
            titleLower.includes('interlude') || titleLower.includes('skit')) {
            return 60; // 1 minute
        }
        
        // Default popular song length
        return 210; // 3.5 minutes
    }

    // ==================== USER HISTORY METHODS ====================

    getUserHistory(guildId, userId, limit = 50) {
        const data = this.loadHistory();
        const userData = data.users[userId];
        
        if (!userData) return [];
        
        let userHistory = userData.globalHistory;
        
        // Filter by guild if specified (not 'all')
        if (guildId !== 'all') {
            userHistory = userHistory.filter(song => song.guildId === guildId);
        }
        
        return userHistory
            .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0))
            .slice(0, limit);
    }

    /**
     * Get user's complete global history across all servers
     */
    getUserGlobalHistory(userId, limit = 1000) {
        const data = this.loadHistory();
        const userData = data.users[userId];
        
        if (!userData) return [];
        
        return userData.globalHistory
            .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0))
            .slice(0, limit);
    }

    getServerHistory(guildId, limit = 100) {
        const data = this.loadHistory();
        const guildData = data.guilds[guildId];
        
        if (!guildData) return [];
        
        return guildData.recentActivity
            .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0))
            .slice(0, limit);
    }

    clearUserHistory(guildId, userId) {
        const data = this.loadHistory();
        let clearedCount = 0;
        
        // Clear user's global history
        if (data.users[userId]) {
            if (guildId === 'all') {
                clearedCount = data.users[userId].globalHistory.length;
                data.users[userId].globalHistory = [];
                data.users[userId].totalPlays = 0;
            } else {
                const originalLength = data.users[userId].globalHistory.length;
                data.users[userId].globalHistory = 
                    data.users[userId].globalHistory.filter(song => song.guildId !== guildId);
                clearedCount = originalLength - data.users[userId].globalHistory.length;
                data.users[userId].totalPlays = data.users[userId].globalHistory.length;
            }
        }
        
        // Clear from guild activities
        if (guildId !== 'all' && data.guilds[guildId]) {
            data.guilds[guildId].recentActivity = 
                data.guilds[guildId].recentActivity.filter(activity => activity.userId !== userId);
        } else if (guildId === 'all') {
            // Clear from all guilds
            for (const guild of Object.values(data.guilds)) {
                guild.recentActivity = guild.recentActivity.filter(activity => activity.userId !== userId);
            }
        }
        
        this.saveHistory(data);
        logger.info('RECOMMENDATION', `Cleared ${clearedCount} entries for user ${userId} in ${guildId === 'all' ? 'all guilds' : 'guild ' + guildId}`);
        return clearedCount > 0;
    }

    // ==================== AUTO-SUGGESTION SETTINGS ====================
    
    loadSettings() {
        if (!fs.existsSync(this.settingsPath)) {
            return {};
        }
        try {
            return JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        } catch (error) {
            console.error('Error loading settings:', error);
            return {};
        }
    }

    saveSettings(settings) {
        try {
            fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    setAutoSuggestion(guildId, userId, enabled) {
        const settings = this.loadSettings();
        
        if (!settings[guildId]) {
            settings[guildId] = {};
        }
        
        if (!settings[guildId].autoSuggestions) {
            settings[guildId].autoSuggestions = {};
        }
        
        settings[guildId].autoSuggestions[userId] = {
            enabled: enabled,
            updatedAt: Date.now()
        };
        
        this.saveSettings(settings);
        logger.info('RECOMMENDATION', `Auto-suggestion ${enabled ? 'enabled' : 'disabled'} for user ${userId} in guild ${guildId}`);
    }

    isAutoSuggestionEnabled(guildId, userId) {
        const settings = this.loadSettings();
        return settings[guildId]?.autoSuggestions?.[userId]?.enabled || false;
    }

    getAllAutoSuggestionUsers(guildId) {
        const settings = this.loadSettings();
        const guildSettings = settings[guildId]?.autoSuggestions || {};
        
        const enabledUsers = [];
        for (const [userId, userSettings] of Object.entries(guildSettings)) {
            if (userSettings.enabled) {
                enabledUsers.push(userId);
            }
        }
        
        return enabledUsers;
    }

    // ==================== RECOMMENDATION GENERATION ====================

    async generateRecommendations(guildId, userId, type, count = 5, currentSong = null) {
        const userHistory = this.getUserHistory(guildId, userId, 100);
        
        // 🚫 Get already suggested songs to avoid duplicates
        const alreadySuggested = await this.getRecentSuggestions(guildId, userId);
        
        let recommendations = [];

        switch (type) {
            case 'auto':
                // 🎵 NEW PRIORITY: Use currently playing song's genre if available
                if (currentSong && currentSong.genre && currentSong.genre !== 'unknown') {
                    console.log(`🎯 Prioritizing current song genre: ${currentSong.genre} (from "${currentSong.title}")`);
                    
                    // 70% current genre + 30% similar genres/fallback
                    const currentGenreCount = Math.ceil(count * 0.7);
                    const fallbackCount = count - currentGenreCount;
                    
                    // Get recommendations based on current song's genre
                    const currentGenreRecs = await this.getCurrentGenreRecommendations(guildId, userId, currentSong, currentGenreCount * 3);
                    console.log(`🔍 Current genre mode: Generated ${currentGenreRecs.length} recommendations for ${currentSong.genre}`);
                    
                    // Get some fallback recommendations (similar genres or Last.fm)
                    const fallbackRecs = await this.getSimilarGenreRecommendations(guildId, userId, currentSong.genre, fallbackCount * 2);
                    console.log(`🔍 Fallback mode: Generated ${fallbackRecs.length} similar genre recommendations`);
                    
                    recommendations = [...currentGenreRecs, ...fallbackRecs];
                } else {
                    // 🔄 Fallback to old behavior if no current song or genre
                    console.log(`🔄 No current song genre available, using mixed recommendations`);
                    
                    // Mixed recommendations: 40% Last.fm + 60% personal
                    const lastfmCount = Math.ceil(count * 0.4);
                    const personalCount = count - lastfmCount;
                    
                    // Generate more candidates for better filtering (4x instead of 2x)
                    const lastfmRecs = await this.getLastFmRecommendations(guildId, userId, lastfmCount * 4);
                    console.log(`🔍 Auto-mode: Generated ${lastfmRecs.length} Last.fm recommendations`);
                    
                    // If Last.fm is not working, generate more personal recommendations
                    const adjustedPersonalCount = lastfmRecs.length > 0 ? personalCount * 4 : count * 4;
                    const personalRecs = await this.getPersonalRecommendations(guildId, userId, adjustedPersonalCount);
                    console.log(`🔍 Auto-mode: Generated ${personalRecs.length} personal recommendations`);
                    
                    recommendations = [...lastfmRecs, ...personalRecs];
                }
                break;
                
            case 'current_genre':
                // 🎯 NEW: Pure current genre recommendations
                if (currentSong && currentSong.genre && currentSong.genre !== 'unknown') {
                    console.log(`🎯 Pure current genre mode: ${currentSong.genre}`);
                    recommendations = await this.getCurrentGenreRecommendations(guildId, userId, currentSong, count * 3);
                } else {
                    console.log(`🔄 No current genre available, falling back to personal recommendations`);
                    recommendations = await this.getPersonalRecommendations(guildId, userId, count * 2);
                }
                break;
                
            case 'personal':
                recommendations = await this.getPersonalRecommendations(guildId, userId, count * 2);
                break;
                
            case 'server':
                recommendations = await this.getServerRecommendations(guildId, count * 2);
                break;
                
            case 'genre':
                recommendations = await this.getGenreRecommendations(guildId, userId, count * 2);
                break;
                
            case 'artist':
                recommendations = await this.getArtistRecommendations(guildId, userId, count * 2);
                break;
                
            case 'trending':
                recommendations = await this.getTrendingRecommendations(count * 2);
                break;
                
            case 'lastfm':
                recommendations = await this.getLastFmRecommendations(guildId, userId, count * 2);
                break;
                
            default:
                recommendations = await this.getPersonalRecommendations(guildId, userId, count * 2);
        }

        // 🔍 Enhanced filtering and deduplication
        console.log(`🔍 Pre-filtering: ${recommendations.length} total recommendations`);
        const qualityRecommendations = this.filterHighQualityRecommendations(recommendations, alreadySuggested, userHistory);
        console.log(`🔍 Post-filtering: ${qualityRecommendations.length} quality recommendations`);
        
        // 📊 Score and rank recommendations based on user preferences
        const scoredRecommendations = this.scoreRecommendations(qualityRecommendations, guildId, userId);
        console.log(`🔍 Post-scoring: ${scoredRecommendations.length} scored recommendations`);
        
        // 🎯 Return top scored recommendations
        const finalRecommendations = scoredRecommendations.slice(0, count);
        console.log(`🎯 Final: Returning ${finalRecommendations.length}/${count} requested recommendations`);
        
        // 💾 Track these suggestions to avoid future duplicates
        await this.trackSuggestions(guildId, userId, finalRecommendations);
        
        console.log(`🎯 Generated ${finalRecommendations.length}/${count} recommendations for user ${userId}`);
        
        return finalRecommendations;
    }

    /**
     * 🔍 Filter out low-quality and duplicate recommendations
     */
    filterHighQualityRecommendations(recommendations, alreadySuggested, userHistory) {
        // Get user's preferred genres for better filtering
        const userGenres = userHistory.map(song => song.genre).filter(g => g && g !== 'unknown');
        const genreCounts = {};
        userGenres.forEach(g => genreCounts[g] = (genreCounts[g] || 0) + 1);
        const preferredGenres = Object.keys(genreCounts);
        
        console.log(`🎯 User preferred genres: ${preferredGenres.join(', ')}`);
        
        const filtered = recommendations.filter(rec => {
            // ❌ Filter out low-quality content
            if (!rec.title || !rec.author) return false;
            
            // ❌ Filter out "Unknown" content
            if (rec.title.toLowerCase().includes('unknown') || 
                rec.author.toLowerCase().includes('unknown')) return false;
            
            // ❌ Filter out test/quiz content
            if (rec.title.toLowerCase().includes('test') ||
                rec.title.toLowerCase().includes('quiz') ||
                rec.title.toLowerCase().includes('blind test') ||
                rec.title.toLowerCase().includes('knowledge')) return false;
            
            // ❌ Filter out very short titles (likely corrupted)
            if (rec.title.length < 3) return false;

            // ⏱️ Filter out videos that are too long to avoid bot overload
            if (rec.duration) {
                const durationInSeconds = rec.duration;
                const maxAbsoluteDuration = 3600; // 1 hour absolute maximum
                const maxPreferredDuration = 2100; // 35 minutes = 2100 seconds
                
                // Reject videos longer than 1 hour (strict limit)
                if (durationInSeconds > maxAbsoluteDuration) {
                    console.log(`⏱️ Filtered out long video: ${rec.title} (${Math.round(durationInSeconds/60)}min > 60min limit)`);
                    return false;
                }
                
                // Be more lenient for current genre recommendations
                const isCurrentGenreRec = rec.source === 'Current Genre Match' || rec.source === 'Similar Genre Match';
                const maxDurationForGenre = isCurrentGenreRec ? 1800 : maxPreferredDuration; // 30min for genre recs, 35min for others
                
                // Also filter out videos longer than preferred duration
                if (durationInSeconds > maxDurationForGenre) {
                    console.log(`⏱️ Filtered out medium-long video: ${rec.title} (${Math.round(durationInSeconds/60)}min > ${Math.round(maxDurationForGenre/60)}min preferred)`);
                    return false;
                }
                
                // Score based on duration - prefer videos under preferred duration
                if (durationInSeconds <= maxDurationForGenre) {
                    rec.durationScore = 1.0; // Perfect score for videos ≤ preferred duration
                } else {
                    rec.durationScore = 0.8; // Lower score for longer videos
                }
            } else {
                // If no duration available, estimate based on title keywords
                const titleLower = rec.title.toLowerCase();
                const hasLongIndicators = titleLower.includes("full album") ||
                                        titleLower.includes("full set") ||
                                        titleLower.includes("complete") ||
                                        titleLower.includes("compilation") ||
                                        titleLower.includes("mix)") ||
                                        titleLower.includes("hours") ||
                                        titleLower.includes("extended") ||
                                        titleLower.includes("playlist") ||
                                        titleLower.includes("collection") ||
                                        titleLower.includes("marathon") ||
                                        titleLower.includes("mega mix") ||
                                        titleLower.includes("ultra mix") ||
                                        titleLower.includes("continuous") ||
                                        titleLower.includes("non-stop");
                
                // Be more lenient for current genre recommendations
                const isCurrentGenreRec = rec.source === 'Current Genre Match' || rec.source === 'Similar Genre Match';
                if (hasLongIndicators && !isCurrentGenreRec) {
                    console.log(`⏱️ Filtered out potential long content: ${rec.title}`);
                    return false;
                }
                
                rec.durationScore = isCurrentGenreRec ? 0.9 : 0.8; // Higher score for current genre recs
            }
            
            // ❌ Filter out completely unrelated genre content
            if (preferredGenres.length > 0 && rec.expectedGenre) {
                const isGenreCompatible = preferredGenres.includes(rec.expectedGenre) || 
                                        this.areGenresCompatible(preferredGenres, rec.expectedGenre);
                if (!isGenreCompatible) {
                    console.log(`🚫 Genre mismatch: "${rec.title}" (expected: ${rec.expectedGenre}, user likes: ${preferredGenres.join(', ')})`);
                    return false;
                }
            }
            
            // ❌ Filter out duplicates with already suggested songs
            const isDuplicate = alreadySuggested.some(suggested => 
                this.isSimilarSong(rec, suggested)
            );
            if (isDuplicate) return false;
            
            // ❌ Filter out songs already in user history
            const isInHistory = userHistory.some(historyItem => 
                this.isSimilarSong(rec, historyItem)
            );
            if (isInHistory) return false;
            
            return true;
        });
        
        // 🎯 Remove duplicates within current recommendations
        const uniqueRecommendations = [];
        for (const rec of filtered) {
            const isDupe = uniqueRecommendations.some(existing => 
                this.isSimilarSong(rec, existing)
            );
            if (!isDupe) {
                uniqueRecommendations.push(rec);
            }
        }
        
        return uniqueRecommendations;
    }

    /**
     * 🔍 Enhanced similarity detection
     */
    isSimilarSong(song1, song2) {
        if (!song1 || !song2) return false;
        
        const title1 = (song1.title || '').toLowerCase().trim();
        const title2 = (song2.title || '').toLowerCase().trim();
        const author1 = (song1.author || song1.artist || '').toLowerCase().trim();
        const author2 = (song2.author || song2.artist || '').toLowerCase().trim();
        
        // Exact match
        if (title1 === title2 && author1 === author2) return true;
        
        // Similar title and same author
        if (author1 === author2 && this.calculateSimilarity(title1, title2) > 0.8) return true;
        
        // Same title and similar author
        if (title1 === title2 && this.calculateSimilarity(author1, author2) > 0.8) return true;
        
        return false;
    }

    /**
     * 🎯 Check if search result is relevant to the target artist
     */
    isArtistRelevant(targetArtist, videoTitle, videoAuthor) {
        const target = targetArtist.toLowerCase().trim();
        const title = (videoTitle || '').toLowerCase().trim();
        const author = (videoAuthor || '').toLowerCase().trim();
        
        // Artist name should appear in either title or author
        const artistInTitle = title.includes(target);
        const artistInAuthor = author.includes(target);
        
        // Special handling for "A.L.I.S.O.N" type cases
        if (target.includes('.')) {
            const cleanTarget = target.replace(/\./g, '').replace(/\s/g, '');
            const cleanTitle = title.replace(/\./g, '').replace(/\s/g, '');
            const cleanAuthor = author.replace(/\./g, '').replace(/\s/g, '');
            
            if (cleanTitle.includes(cleanTarget) || cleanAuthor.includes(cleanTarget)) {
                return true;
            }
        }
        
        // Avoid completely unrelated results (like "Alison" for "A.L.I.S.O.N")
        if (!artistInTitle && !artistInAuthor) {
            // Check if it's just a similar sounding but unrelated word
            const targetWords = target.split(/[\s\.-]+/).filter(w => w.length > 2);
            const hasRelevantWords = targetWords.some(word => 
                title.includes(word) || author.includes(word)
            );
            
            if (!hasRelevantWords) {
                console.log(`🚫 Filtered irrelevant result: "${videoTitle}" by "${videoAuthor}" for artist "${targetArtist}"`);
                return false;
            }
        }
        
        return artistInTitle || artistInAuthor;
    }

    /**
     * 🎵 Check if genres are compatible for recommendations
     */
    areGenresCompatible(userGenres, targetGenre) {
        if (!targetGenre) return true;
        
        const compatibilityMap = {
            'electronic': ['synthwave', 'ambient', 'chillwave', 'retrowave', 'vaporwave', 'edm', 'techno'],
            'synthwave': ['synthwave', 'retrowave', 'chillwave', 'vaporwave', 'ambient'],
            'rock': ['alternative', 'indie', 'pop rock', 'alternative rock'],
            'pop': ['pop rock', 'indie pop', 'alternative'],
            'ambient': ['electronic', 'synthwave', 'chillwave'],
            'chillwave': ['electronic', 'synthwave', 'ambient', 'vaporwave'],
            'vaporwave': ['synthwave', 'electronic', 'chillwave'],
            'retrowave': ['synthwave', 'electronic']
        };
        
        // Check if any user genre is compatible with target genre
        for (const userGenre of userGenres) {
            if (userGenre === targetGenre) return true;
            
            const compatibleGenres = compatibilityMap[userGenre] || [];
            if (compatibleGenres.includes(targetGenre)) return true;
            
            // Reverse check
            const targetCompatibleGenres = compatibilityMap[targetGenre] || [];
            if (targetCompatibleGenres.includes(userGenre)) return true;
        }
        
        return false;
    }

    /**
     * 📊 Score recommendations based on user preferences
     */
    scoreRecommendations(recommendations, guildId, userId) {
        const userData = this.loadHistory().users[userId];
        if (!userData) return this.shuffleArray(recommendations);
        
        const scoredRecs = recommendations.map(rec => {
            let score = Math.random() * 0.2; // Reduced base randomness (0-0.2)
            
            // 🎯 NEW: Priority score from current genre matching (0-0.5) - HIGHEST PRIORITY
            if (rec.priorityScore) {
                score += rec.priorityScore * 0.5;
                console.log(`🎯 Priority boost: +${(rec.priorityScore * 0.5).toFixed(2)} for "${rec.title}" (${rec.source})`);
            }
            
            // 🎵 Genre preference bonus (0-0.3) - REDUCED from 0.4
            if (rec.genre && userData.preferences?.topGenres) {
                const genreMatch = userData.preferences.topGenres.find(g => 
                    g.genre.toLowerCase() === rec.genre.toLowerCase()
                );
                if (genreMatch) {
                    score += (genreMatch.count / userData.totalPlays) * 0.3;
                }
            }
            
            // 👤 Artist preference bonus (0-0.2) - REDUCED from 0.3
            if (rec.author && userData.globalHistory) {
                const artistPlays = userData.globalHistory.filter(h => 
                    (h.author || '').toLowerCase() === rec.author.toLowerCase()
                ).length;
                if (artistPlays > 0) {
                    score += Math.min(artistPlays / userData.totalPlays, 0.2);
                }
            }
            
            // 🔥 Source-based bonuses (0-0.15)
            if (rec.source === 'Current Genre Match') {
                score += 0.15; // Bonus for exact genre match
            } else if (rec.source === 'Similar Genre Match') {
                score += 0.12; // Bonus for similar genre
            } else if (rec.source === 'Last.fm Current Genre') {
                score += 0.13; // Bonus for Last.fm current genre
            } else if (rec.source === 'Last.fm Similar Tracks') {
                score += 0.1; // Reduced from 0.2
            }

            // ⏱️ Duration preference bonus (0-0.1) - REDUCED from 0.15
            if (rec.durationScore) {
                score += rec.durationScore * 0.1;
            }
            
            // ⭐ Quality bonus (0-0.05) - REDUCED from 0.1
            if (rec.title && rec.author && 
                !rec.title.includes('-') && 
                rec.title.length > 10) {
                score += 0.05;
            }
            
            return { ...rec, score };
        });
        
        // Sort by score (highest first)
        return scoredRecs.sort((a, b) => b.score - a.score);
    }

    /**
     * 📊 Calculate text similarity (0-1)
     */
    calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    /**
     * 🔢 Levenshtein distance calculation
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * 🗂️ Get recently suggested songs to avoid duplicates
     */
    async getRecentSuggestions(guildId, userId) {
        try {
            const database = require('./database.js');
            const db = new database();
            const queue = await db.getQueue(guildId);
            
            // Get auto-suggested songs from current queue
            const autoSuggested = queue.filter(song => song.autoSuggestion === true);
            
            return autoSuggested;
        } catch (error) {
            console.error('Error getting recent suggestions:', error);
            return [];
        }
    }

    /**
     * 💾 Track suggestions to avoid future duplicates
     */
    async trackSuggestions(guildId, userId, recommendations) {
        // This could be enhanced to store in a separate file/database
        // For now, we rely on queue filtering
        console.log(`📝 Tracked ${recommendations.length} suggestions for user ${userId}`);
    }

    /**
     * 🎵 Get recommendations based on currently playing song's genre
     */
    async getCurrentGenreRecommendations(guildId, userId, currentSong, count) {
        console.log(`🎯 Getting recommendations for current genre: ${currentSong.genre}`);
        const recommendations = [];
        
        try {
            // Enhanced search terms for the current genre
            const genreSearchTerms = [
                `${currentSong.genre} music 2024`,
                `${currentSong.genre} songs`,
                `best ${currentSong.genre}`,
                `${currentSong.genre} playlist`,
                `popular ${currentSong.genre}`,
                `new ${currentSong.genre}`,
                `${currentSong.genre} hits`
            ];
            
            // Use multiple search terms to get diverse results
            for (const searchTerm of genreSearchTerms) {
                if (recommendations.length >= count) break;
                
                try {
                    const searchResults = await this.searchVideos(searchTerm, 3);
                    
                    for (const video of searchResults) {
                        if (recommendations.length >= count) break;
                        
                        recommendations.push({
                            title: video.title || 'Unknown Song',
                            author: video.author || 'Unknown Artist',
                            artist: video.author || 'Unknown Artist',
                            url: video.url,
                            platform: 'youtube',
                            reason: `Same genre as current song (${currentSong.genre})`,
                            source: 'Current Genre Match',
                            genre: currentSong.genre,
                            expectedGenre: currentSong.genre,
                            duration: video.duration,
                            durationFormatted: video.durationFormatted || 'Unknown',
                            priorityScore: 1.0 // Highest priority
                        });
                    }
                } catch (searchError) {
                    console.error(`Error searching for ${searchTerm}:`, searchError.message);
                }
            }
            
            // If we still need more and Last.fm is available, get genre-specific tracks
            if (recommendations.length < count && this.lastfm?.isEnabled()) {
                try {
                    const lastfmGenreTracks = await this.lastfm.getTopTracksByTag(currentSong.genre, count - recommendations.length);
                    
                    for (const track of lastfmGenreTracks) {
                        if (recommendations.length >= count) break;
                        
                        recommendations.push({
                            title: track.title || 'Unknown Song',
                            author: track.artist || 'Unknown Artist',
                            artist: track.artist || 'Unknown Artist',
                            platform: 'lastfm',
                            reason: `${currentSong.genre} from Last.fm`,
                            source: 'Last.fm Current Genre',
                            genre: currentSong.genre,
                            expectedGenre: currentSong.genre,
                            durationFormatted: 'Unknown',
                            url: null, // Will be resolved during playback
                            priorityScore: 0.9 // High priority
                        });
                    }
                } catch (lastfmError) {
                    console.error(`Error getting Last.fm tracks for ${currentSong.genre}:`, lastfmError.message);
                }
            }
            
        } catch (error) {
            console.error('Error in getCurrentGenreRecommendations:', error);
        }
        
        console.log(`✅ Generated ${recommendations.length} current genre recommendations for ${currentSong.genre}`);
        return recommendations.slice(0, count);
    }

    /**
     * 🔄 Get recommendations for genres similar to current song's genre
     */
    async getSimilarGenreRecommendations(guildId, userId, currentGenre, count) {
        const recommendations = [];
        
        // Define genre compatibility/similarity
        const genreSimilarity = {
            'electronic': ['synthwave', 'ambient', 'chillwave', 'retrowave', 'vaporwave', 'edm', 'techno', 'house', 'trance'],
            'synthwave': ['electronic', 'retrowave', 'chillwave', 'vaporwave', 'ambient', 'cyberpunk'],
            'rock': ['alternative', 'indie', 'pop rock', 'alternative rock', 'indie rock', 'hard rock'],
            'pop': ['pop rock', 'indie pop', 'alternative', 'mainstream', 'chart pop'],
            'ambient': ['electronic', 'synthwave', 'chillwave', 'atmospheric', 'downtempo'],
            'chillwave': ['electronic', 'synthwave', 'ambient', 'vaporwave', 'downtempo'],
            'vaporwave': ['synthwave', 'electronic', 'chillwave', 'ambient', 'retro'],
            'retrowave': ['synthwave', 'electronic', 'cyberpunk', 'vaporwave'],
            'hip-hop': ['rap', 'trap', 'drill', 'urban', 'r&b'],
            'r&b': ['soul', 'hip-hop', 'urban', 'funk', 'neo-soul'],
            'jazz': ['smooth jazz', 'blues', 'soul', 'funk', 'fusion'],
            'classical': ['orchestral', 'instrumental', 'piano', 'symphony', 'neoclassical'],
            'country': ['folk', 'americana', 'bluegrass', 'western', 'indie folk'],
            'reggae': ['ska', 'dub', 'reggaeton', 'dancehall', 'caribbean']
        };
        
        const similarGenres = genreSimilarity[currentGenre.toLowerCase()] || [];
        console.log(`🔄 Finding similar genres to ${currentGenre}: ${similarGenres.join(', ')}`);
        
        try {
            // Search for tracks in similar genres
            for (const similarGenre of similarGenres.slice(0, 3)) { // Limit to top 3 similar genres
                if (recommendations.length >= count) break;
                
                try {
                    const searchResults = await this.searchVideos(`${similarGenre} music`, 2);
                    
                    for (const video of searchResults) {
                        if (recommendations.length >= count) break;
                        
                        recommendations.push({
                            title: video.title || 'Unknown Song',
                            author: video.author || 'Unknown Artist',
                            artist: video.author || 'Unknown Artist',
                            url: video.url,
                            platform: 'youtube',
                            reason: `Similar genre to current song (${similarGenre} ≈ ${currentGenre})`,
                            source: 'Similar Genre Match',
                            genre: similarGenre,
                            expectedGenre: similarGenre,
                            duration: video.duration,
                            durationFormatted: video.durationFormatted || 'Unknown',
                            priorityScore: 0.7 // Medium-high priority
                        });
                    }
                } catch (searchError) {
                    console.error(`Error searching for similar genre ${similarGenre}:`, searchError.message);
                }
            }
        } catch (error) {
            console.error('Error in getSimilarGenreRecommendations:', error);
        }
        
        console.log(`✅ Generated ${recommendations.length} similar genre recommendations`);
        return recommendations.slice(0, count);
    }

    async getLastFmRecommendations(guildId, userId, count) {
        if (!this.lastfm?.isEnabled()) {
            return [];
        }

        const userHistory = this.getUserGlobalHistory(userId, 50);
        const recommendations = [];

        try {
            // Get recommendations based on recent tracks
            for (const song of userHistory.slice(0, 10)) {
                if (recommendations.length >= count) break;

                try {
                    const similarTracks = await this.lastfm.getSimilarTracks(song.author, song.title, 3);
                    
                    for (const track of similarTracks) {
                        if (recommendations.length >= count) break;
                        
                        recommendations.push({
                            title: track.title || 'Unknown Song',
                            author: track.artist || 'Unknown Artist',
                            artist: track.artist || 'Unknown Artist', // Backward compatibility
                            platform: 'lastfm',
                            reason: `Similar to ${song.author} - ${song.title}`,
                            match: track.match || 0,
                            source: 'Last.fm Similar Tracks',
                            durationFormatted: 'Unknown',
                            url: null // Will be resolved during playback
                        });
                    }
                } catch (error) {
                    console.error(`Error searching for ${song.author} - ${song.title}:`, error);
                }
            }

            // Fill remaining slots with top tracks from user's favorite genres
            if (recommendations.length < count) {
                const userData = this.loadHistory().users[userId];
                const topGenres = userData?.preferences?.topGenres || [];
                
                for (const genreData of topGenres.slice(0, 3)) {
                    if (recommendations.length >= count) break;
                    
                    try {
                        const topTracks = await this.lastfm.getTopTracksByTag(genreData.genre, 5);
                        
                        for (const track of topTracks) {
                            if (recommendations.length >= count) break;
                            
                            recommendations.push({
                                title: track.title || 'Unknown Song',
                                author: track.artist || 'Unknown Artist',
                                artist: track.artist || 'Unknown Artist', // Backward compatibility
                                platform: 'lastfm',
                                reason: `Popular in ${genreData.genre}`,
                                source: 'Last.fm Genre Recommendations',
                                durationFormatted: 'Unknown',
                                url: null // Will be resolved during playback
                            });
                        }
                    } catch (error) {
                        console.error(`Error searching for ${genreData.genre}:`, error);
                    }
                }
            }

        } catch (error) {
            console.error('Last.fm recommendations error:', error);
        }

        return recommendations.slice(0, count);
    }

    async getPersonalRecommendations(guildId, userId, count) {
        const userHistory = this.getUserHistory(guildId, userId, 50);
        
        if (userHistory.length === 0) {
            return this.getServerRecommendations(guildId, count);
        }

        const recommendations = [];
        const artistCounts = {};
        const genreCounts = {};

        // Analyze user preferences
        userHistory.forEach(song => {
            artistCounts[song.author] = (artistCounts[song.author] || 0) + 1;
            if (song.genre && song.genre !== 'unknown') {
                genreCounts[song.genre] = (genreCounts[song.genre] || 0) + 1;
            }
        });

        const topArtists = Object.entries(artistCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([artist]) => artist);

        const topGenres = Object.entries(genreCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 2)
            .map(([genre]) => genre);

        // Get recommendations based on favorite artists
        for (const artist of topArtists) {
            if (recommendations.length >= count) break;
            
            try {
                // Better search query - focus on music/electronic genre
                const artistSearchQueries = [
                    `${artist} electronic music`,
                    `${artist} synthwave`,
                    `${artist} music`,
                    `${artist} tracks`
                ];
                
                for (const searchQuery of artistSearchQueries) {
                    if (recommendations.length >= count) break;
                    
                    try {
                        const searches = await this.searchVideos(searchQuery, 3);
                        searches.forEach(video => {
                            if (recommendations.length < count && !userHistory.some(h => h.title === video.title)) {
                                // Additional quality check - avoid unrelated songs
                                const isRelevant = this.isArtistRelevant(artist, video.title, video.author);
                                if (isRelevant) {
                                    recommendations.push({
                                        title: video.title || 'Unknown Song',
                                        author: video.author || 'Unknown Artist',
                                        artist: video.author || 'Unknown Artist',
                                        url: video.url,
                                        platform: 'youtube',
                                        reason: `More from ${artist}`,
                                        source: 'Personal Preferences',
                                        durationFormatted: video.durationFormatted || 'Unknown',
                                        expectedGenre: topGenres[0] || 'electronic'
                                    });
                                }
                            }
                        });
                    } catch (searchError) {
                        // Log individual search failures but continue with other queries
                        if (searchError.message.includes('redirect count exceeded') || 
                            searchError.message.includes('fetch failed')) {
                            console.log(`🔄 Network issue with search "${searchQuery}", continuing...`);
                        } else {
                            console.error(`Error searching "${searchQuery}":`, searchError.message);
                        }
                        // Continue with next search query instead of failing entire artist
                        continue;
                    }
                }
            } catch (error) {
                console.error(`Error searching for artist ${artist}:`, error);
            }
        }

        // Add genre-based recommendations for better quality
        for (const genre of topGenres) {
            if (recommendations.length >= count) break;
            
            try {
                const genreSearches = await this.searchVideos(`${genre} music 2024`, 4);
                genreSearches.forEach(video => {
                    if (recommendations.length < count && !userHistory.some(h => h.title === video.title)) {
                        recommendations.push({
                            title: video.title || 'Unknown Song',
                            author: video.author || 'Unknown Artist',
                            artist: video.author || 'Unknown Artist',
                            url: video.url,
                            platform: 'youtube',
                            reason: `${genre.charAt(0).toUpperCase() + genre.slice(1)} music`,
                            source: 'Genre Preferences',
                            durationFormatted: video.durationFormatted || 'Unknown',
                            expectedGenre: genre
                        });
                    }
                });
            } catch (error) {
                console.error(`Error searching for genre ${genre}:`, error);
            }
        }

        // 🔄 Fallback: If we don't have enough recommendations, search for popular music
        if (recommendations.length < count) {
            const needed = count - recommendations.length;
            console.log(`🔄 Personal recs fallback: Need ${needed} more songs`);
            
            try {
                const fallbackSearches = [
                    'popular music 2024',
                    'trending songs',
                    'top hits',
                    'best music'
                ];
                
                for (const searchTerm of fallbackSearches) {
                    if (recommendations.length >= count) break;
                    
                    const fallbackResults = await this.searchVideos(searchTerm, 3);
                    fallbackResults.forEach(video => {
                        if (recommendations.length < count && !userHistory.some(h => h.title === video.title)) {
                            recommendations.push({
                                title: video.title || 'Unknown Song',
                                author: video.author || 'Unknown Artist',
                                artist: video.author || 'Unknown Artist',
                                url: video.url,
                                platform: 'youtube',
                                reason: `Popular music discovery`,
                                source: 'Trending Music',
                                durationFormatted: video.durationFormatted || 'Unknown'
                            });
                        }
                    });
                }
            } catch (error) {
                console.error('Error in personal recommendations fallback:', error);
            }
        }

        console.log(`✅ Personal recommendations: Generated ${recommendations.length} total songs`);
        return recommendations.slice(0, count);
    }

    async getServerRecommendations(guildId, count) {
        const serverHistory = this.getServerHistory(guildId, 100);
        
        if (serverHistory.length === 0) {
            return [];
        }

        const songCounts = {};
        serverHistory.forEach(song => {
            const key = `${song.author} - ${song.title}`;
            songCounts[key] = (songCounts[key] || 0) + 1;
        });

        const popularSongs = Object.entries(songCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, count)
            .map(([song, plays]) => ({
                title: song.split(' - ')[1] || 'Unknown Song',
                author: song.split(' - ')[0] || 'Unknown Artist',
                artist: song.split(' - ')[0] || 'Unknown Artist', // Backward compatibility
                platform: 'youtube',
                reason: `Popular in server (${plays} plays)`,
                source: 'Server Trends',
                durationFormatted: 'Unknown'
            }));

        return popularSongs;
    }

    async getGenreRecommendations(guildId, userId, count) {
        const userHistory = this.getUserHistory(guildId, userId, 50);
        const genreCounts = {};

        userHistory.forEach(song => {
            if (song.genre && song.genre !== 'unknown') {
                genreCounts[song.genre] = (genreCounts[song.genre] || 0) + 1;
            }
        });

        if (Object.keys(genreCounts).length === 0) {
            return [];
        }

        const topGenre = Object.entries(genreCounts)
            .sort(([,a], [,b]) => b - a)[0][0];

        const recommendations = [];

        try {
            const searches = await this.searchVideos(`${topGenre} music`, count);
            searches.forEach(video => {
                recommendations.push({
                    title: video.title || 'Unknown Song',
                    author: video.author || 'Unknown Artist',
                    artist: video.author || 'Unknown Artist', // Backward compatibility
                    url: video.url,
                    platform: 'youtube',
                    reason: `${topGenre} recommendations`,
                    source: 'Genre-based',
                    durationFormatted: video.durationFormatted || 'Unknown'
                });
            });
        } catch (error) {
            console.error(`Error searching for genre ${topGenre}:`, error);
        }

        return recommendations.slice(0, count);
    }

    async getArtistRecommendations(guildId, userId, count) {
        const userHistory = this.getUserHistory(guildId, userId, 20);
        
        if (userHistory.length === 0) {
            return [];
        }

        const artistCounts = {};
        userHistory.forEach(song => {
            artistCounts[song.author] = (artistCounts[song.author] || 0) + 1;
        });

        const topArtist = Object.entries(artistCounts)
            .sort(([,a], [,b]) => b - a)[0][0];

        const recommendations = [];

        try {
            const searches = await this.searchVideos(`${topArtist} top songs`, count);
            searches.forEach(video => {
                if (!userHistory.some(h => h.title === video.title)) {
                    recommendations.push({
                        title: video.title || 'Unknown Song',
                        author: video.author || 'Unknown Artist',
                        artist: video.author || 'Unknown Artist', // Backward compatibility
                        url: video.url,
                        platform: 'youtube',
                        reason: `More from ${topArtist}`,
                        source: 'Artist-based',
                        durationFormatted: video.durationFormatted || 'Unknown'
                    });
                }
            });
        } catch (error) {
            console.error(`Error searching for artist ${topArtist}:`, error);
        }

        return recommendations.slice(0, count);
    }

    async getTrendingRecommendations(count) {
        const recommendations = [];

        try {
            // Get trending from YouTube
            const searches = await this.searchVideos('trending music 2025', count);
            searches.forEach(video => {
                recommendations.push({
                    title: video.title || 'Unknown Song',
                    author: video.author || 'Unknown Artist',
                    artist: video.author || 'Unknown Artist', // Backward compatibility
                    url: video.url,
                    platform: 'youtube',
                    reason: 'Trending globally',
                    source: 'Global Trends',
                    durationFormatted: video.durationFormatted || 'Unknown'
                });
            });
        } catch (error) {
            console.error('Error getting trending recommendations:', error);
        }

        return recommendations.slice(0, count);
    }

    // ==================== STATS AND ANALYTICS ====================
    
    getUserStats(guildId, userId) {
        const userHistory = this.getUserHistory(guildId, userId, 1000);
        
        if (userHistory.length === 0) {
            return null;
        }

        const artists = {};
        const platforms = {};
        const genres = {};
        const tags = {};
        let totalDuration = 0;
        let totalLastfmListeners = 0;
        let songsWithLastfm = 0;

        userHistory.forEach(song => {
            // Count artists
            const artist = song.author || 'Unknown';
            artists[artist] = (artists[artist] || 0) + 1;

            // Count platforms
            platforms[song.platform] = (platforms[song.platform] || 0) + 1;

            // Count genres
            if (song.genre && song.genre !== 'unknown') {
                genres[song.genre] = (genres[song.genre] || 0) + 1;
            }

            // Count Last.fm tags
            if (song.tags && Array.isArray(song.tags)) {
                song.tags.forEach(tag => {
                    const tagName = typeof tag === 'object' ? tag.name : tag;
                    if (tagName) {
                        tags[tagName] = (tags[tagName] || 0) + 1;
                    }
                });
            }

            // Duration stats
            if (song.duration) {
                totalDuration += song.duration;
            }

            // Last.fm stats
            if (song.lastfmData) {
                songsWithLastfm++;
                if (song.lastfmData.trackListeners) {
                    totalLastfmListeners += song.lastfmData.trackListeners;
                }
            }
        });

        // Calculate preferences
        const topArtist = Object.entries(artists)
            .sort(([,a], [,b]) => b - a)[0];

        const topPlatform = Object.entries(platforms)
            .sort(([,a], [,b]) => b - a)[0];

        const topGenres = Object.entries(genres)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([genre, count]) => ({ genre, count }));

        const lastfmTags = Object.entries(tags)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        const firstPlay = Math.min(...userHistory.map(s => s.playedAt || s.addedAt));
        const lastPlay = Math.max(...userHistory.map(s => s.playedAt || s.addedAt));

        return {
            totalSongs: userHistory.length,
            uniqueArtists: Object.keys(artists).length,
            totalDuration: totalDuration,
            averageDuration: totalDuration / userHistory.length,
            topArtist: topArtist ? { name: topArtist[0], count: topArtist[1] } : null,
            topPlatform: topPlatform ? { name: topPlatform[0], count: topPlatform[1] } : null,
            topGenres: topGenres,
            lastfmTags: lastfmTags,
            firstPlay: firstPlay,
            lastPlay: lastPlay,
            autoSuggestionEnabled: this.isAutoSuggestionEnabled(guildId, userId),
            dataQuality: {
                lastfmIntegration: this.lastfm?.isEnabled() || false,
                songsWithMetadata: songsWithLastfm,
                metadataPercentage: Math.round((songsWithLastfm / userHistory.length) * 100)
            }
        };
    }

    // ==================== UTILITY METHODS ====================

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // ==================== LAST.FM INTEGRATION METHODS ====================

    async enhanceExistingHistory(guildId, limit = 50) {
        if (!this.lastfm?.isEnabled()) {
            return { processed: 0, enhanced: 0, lastfmAvailable: false };
        }

        const data = this.loadHistory();
        let processed = 0;
        let enhanced = 0;

        // Process all users' histories
        for (const [userId, userData] of Object.entries(data.users)) {
            if (processed >= limit) break;

            const toProcess = userData.globalHistory
                .filter(song => !song.lastfmData || song.genre === 'unknown')
                .slice(0, limit - processed);

            for (const song of toProcess) {
                if (processed >= limit) break;

                try {
                    const enhancedMetadata = await this.lastfm.getEnhancedMetadata(song.author, song.title);
                    
                    if (enhancedMetadata) {
                        song.genre = enhancedMetadata.genre || song.genre;
                        song.duration = enhancedMetadata.duration || song.duration;
                        song.tags = enhancedMetadata.tags || song.tags;
                        song.lastfmData = {
                            trackListeners: enhancedMetadata.listeners || 0,
                            trackPlaycount: enhancedMetadata.playcount || 0,
                            artistListeners: enhancedMetadata.artistListeners || 0,
                            artistPlaycount: enhancedMetadata.artistPlaycount || 0,
                            summary: enhancedMetadata.summary || ''
                        };
                        
                        if (song.duration && !song.durationFormatted) {
                            song.durationFormatted = this.formatDuration(song.duration);
                        }
                        
                        enhanced++;
                    }
                    
                    processed++;
                    
                    // Rate limiting
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                } catch (error) {
                    console.error(`Enhancement error for ${song.author} - ${song.title}:`, error.message);
                    processed++;
                }
            }
        }

        this.saveHistory(data);

        return {
            processed,
            enhanced,
            lastfmAvailable: true
        };
    }
}

module.exports = new RecommendationEngine();
