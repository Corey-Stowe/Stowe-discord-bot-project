const scdl = require('soundcloud-downloader').default;

class SoundCloud {
    constructor() {
        this.clientId = null;
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            try {
                // Get a client ID automatically
                this.clientId = await scdl.getClientID();
                this.initialized = true;
                console.log('SoundCloud plugin initialized successfully');
            } catch (error) {
                console.error('Failed to initialize SoundCloud plugin:', error);
                throw error;
            }
        }
    }

    isSoundCloudUrl(url) {
        return url && (
            url.includes('soundcloud.com/') ||
            url.includes('snd.sc/') ||
            url.includes('m.soundcloud.com/')
        );
    }

    isPlaylistUrl(url) {
        return this.isSoundCloudUrl(url) && url.includes('/sets/');
    }

    isTrackUrl(url) {
        return this.isSoundCloudUrl(url) && !this.isPlaylistUrl(url) && !url.includes('/likes');
    }

    async getTrackInfo(url) {
        try {
            await this.initialize();
            
            if (!this.isTrackUrl(url)) {
                throw new Error('Invalid SoundCloud track URL');
            }

            const trackInfo = await scdl.getInfo(url, this.clientId);
            
            return {
                title: trackInfo.title,
                author: trackInfo.user.username,
                thumbnail: trackInfo.artwork_url || trackInfo.user.avatar_url,
                duration: trackInfo.duration, // in milliseconds
                durationFormatted: this.formatDuration(trackInfo.duration),
                url: url,
                streamUrl: null, // Will be set when needed
                plays: trackInfo.playback_count,
                likes: trackInfo.likes_count,
                genre: trackInfo.genre,
                description: trackInfo.description
            };
        } catch (error) {
            console.error('Error getting SoundCloud track info:', error);
            throw error;
        }
    }    async getStreamUrl(url) {
        try {
            await this.initialize();
            
            // For SoundCloud, we return the readable stream directly
            // The discord.js audio player can handle readable streams
            const stream = await scdl.download(url, this.clientId);
            
            // Instead of returning a URL, we return the stream
            // This needs to be handled differently in the music player
            return stream;
        } catch (error) {
            console.error('Error getting SoundCloud stream:', error);
            throw error;
        }
    }

    async getDirectStreamUrl(url) {
        try {
            await this.initialize();
            
            // Try to get the direct URL for the track
            const trackInfo = await scdl.getInfo(url, this.clientId);
            
            // Look for a media transcoding with a direct URL
            if (trackInfo.media && trackInfo.media.transcodings) {
                for (const transcoding of trackInfo.media.transcodings) {
                    if (transcoding.url && transcoding.format && transcoding.format.protocol === 'progressive') {
                        // Get the direct stream URL
                        const streamInfo = await scdl.util.getStreamUrl(transcoding.url, this.clientId);
                        return streamInfo;
                    }
                }
            }
            
            // Fallback to download stream
            return await scdl.download(url, this.clientId);
        } catch (error) {
            console.error('Error getting SoundCloud direct stream URL:', error);
            throw error;
        }
    }

    async searchTracks(query, limit = 10) {
        try {
            await this.initialize();
            
            const searchResults = await scdl.search({
                query: query,
                limit: limit,
                resourceType: 'tracks'
            }, this.clientId);

            return searchResults.collection.map(track => ({
                title: track.title,
                author: track.user.username,
                thumbnail: track.artwork_url || track.user.avatar_url,
                url: track.permalink_url,
                duration: track.duration,
                durationFormatted: this.formatDuration(track.duration),
                plays: track.playback_count,
                likes: track.likes_count,
                genre: track.genre
            }));
        } catch (error) {
            console.error('Error searching SoundCloud:', error);
            throw error;
        }
    }

    async getFirstSearchResult(query) {
        try {
            const results = await this.searchTracks(query, 1);
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            console.error('Error getting first search result:', error);
            throw error;
        }
    }

    async getPlaylistInfo(url) {
        try {
            await this.initialize();
            
            if (!this.isPlaylistUrl(url)) {
                throw new Error('Invalid SoundCloud playlist URL');
            }

            const playlistInfo = await scdl.getSetInfo(url, this.clientId);
            
            return {
                title: playlistInfo.title,
                author: playlistInfo.user.username,
                thumbnail: playlistInfo.artwork_url || playlistInfo.user.avatar_url,
                trackCount: playlistInfo.track_count,
                tracks: playlistInfo.tracks.map(track => ({
                    title: track.title,
                    author: track.user.username,
                    url: track.permalink_url,
                    duration: track.duration,
                    durationFormatted: this.formatDuration(track.duration),
                    thumbnail: track.artwork_url || track.user.avatar_url
                })),
                description: playlistInfo.description
            };
        } catch (error) {
            console.error('Error getting SoundCloud playlist info:', error);
            throw error;
        }
    }

    formatDuration(milliseconds) {
        if (!milliseconds) return 'Unknown';
        
        const seconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }

    formatPlays(plays) {
        if (!plays) return 'Unknown';
        if (plays >= 1000000) {
            return `${(plays / 1000000).toFixed(1)}M plays`;
        } else if (plays >= 1000) {
            return `${(plays / 1000).toFixed(1)}K plays`;
        } else {
            return `${plays} plays`;
        }
    }
}

module.exports = SoundCloud;
