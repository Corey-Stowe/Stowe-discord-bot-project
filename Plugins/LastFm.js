const axios = require('axios');

class LastFm {
    constructor() {
        this.apiKey = process.env.LASTFM_API_KEY;
        this.sharedSecret = process.env.LASTFM_SHARED_SECRET;
        this.baseUrl = 'http://ws.audioscrobbler.com/2.0/';
        this.userAgent = 'StoweBot/2.6';
        
        if (!this.apiKey) {
            console.warn('Last.fm API key not provided. Some features may be limited.');
        }
    }

    /**
     * Check if Last.fm API is enabled and configured
     */
    isEnabled() {
        return !!(this.apiKey && this.sharedSecret);
    }

    /**
     * Get detailed track information including genre, tags, and similar tracks
     */
    async getTrackInfo(artist, track) {
        if (!this.apiKey) {
            return null;
        }

        try {
            const params = {
                method: 'track.getinfo',
                api_key: this.apiKey,
                artist: artist,
                track: track,
                format: 'json'
            };

            const response = await axios.get(this.baseUrl, {
                params,
                headers: { 'User-Agent': this.userAgent },
                timeout: 10000
            });

            const trackData = response.data.track;
            
            if (trackData && !trackData.error) {
                return {
                    title: trackData.name,
                    artist: trackData.artist?.name || artist,
                    album: trackData.album?.title,
                    duration: trackData.duration ? Math.round(parseInt(trackData.duration) / 1000) : null,
                    listeners: parseInt(trackData.listeners) || 0,
                    playcount: parseInt(trackData.playcount) || 0,
                    tags: trackData.toptags?.tag?.map(tag => ({ name: tag.name, count: tag.count })) || [],
                    genre: trackData.toptags?.tag?.[0]?.name || null,
                    url: trackData.url,
                    summary: trackData.wiki?.summary,
                    published: trackData.wiki?.published
                };
            }
        } catch (error) {
            console.error('Last.fm track info error:', error.message);
        }

        return null;
    }

    /**
     * Get similar tracks for recommendations
     */
    async getSimilarTracks(artist, track, limit = 10) {
        if (!this.apiKey) {
            return [];
        }

        try {
            const params = {
                method: 'track.getsimilar',
                api_key: this.apiKey,
                artist: artist,
                track: track,
                limit: limit,
                format: 'json'
            };

            const response = await axios.get(this.baseUrl, {
                params,
                headers: { 'User-Agent': this.userAgent },
                timeout: 10000
            });

            const similarTracks = response.data.similartracks?.track;
            
            if (similarTracks && Array.isArray(similarTracks)) {
                return similarTracks.map(track => ({
                    title: track.name,
                    artist: track.artist?.name,
                    match: parseFloat(track.match) || 0,
                    url: track.url,
                    reason: `Similar to ${artist} - ${track.name}`
                }));
            }
        } catch (error) {
            console.error('Last.fm similar tracks error:', error.message);
        }

        return [];
    }

    /**
     * Get similar artists for artist-based recommendations
     */
    async getSimilarArtists(artist, limit = 10) {
        if (!this.apiKey) {
            return [];
        }

        try {
            const params = {
                method: 'artist.getsimilar',
                api_key: this.apiKey,
                artist: artist,
                limit: limit,
                format: 'json'
            };

            const response = await axios.get(this.baseUrl, {
                params,
                headers: { 'User-Agent': this.userAgent },
                timeout: 10000
            });

            const similarArtists = response.data.similarartists?.artist;
            
            if (similarArtists && Array.isArray(similarArtists)) {
                return similarArtists.map(artist => ({
                    name: artist.name,
                    match: parseFloat(artist.match) || 0,
                    url: artist.url,
                    listeners: parseInt(artist.listeners) || 0,
                    playcount: parseInt(artist.playcount) || 0
                }));
            }
        } catch (error) {
            console.error('Last.fm similar artists error:', error.message);
        }

        return [];
    }

    /**
     * Get artist information including tags/genres
     */
    async getArtistInfo(artist) {
        if (!this.apiKey) {
            return null;
        }

        try {
            const params = {
                method: 'artist.getinfo',
                api_key: this.apiKey,
                artist: artist,
                format: 'json'
            };

            const response = await axios.get(this.baseUrl, {
                params,
                headers: { 'User-Agent': this.userAgent },
                timeout: 10000
            });

            const artistData = response.data.artist;
            
            if (artistData && !artistData.error) {
                return {
                    name: artistData.name,
                    listeners: parseInt(artistData.stats?.listeners) || 0,
                    playcount: parseInt(artistData.stats?.playcount) || 0,
                    tags: artistData.tags?.tag?.map(tag => ({ name: tag.name, count: tag.count })) || [],
                    genre: artistData.tags?.tag?.[0]?.name || null,
                    url: artistData.url,
                    biography: artistData.bio?.summary,
                    similar: artistData.similar?.artist?.map(a => a.name) || []
                };
            }
        } catch (error) {
            console.error('Last.fm artist info error:', error.message);
        }

        return null;
    }

    /**
     * Get top tracks for a specific tag/genre
     */
    async getTopTracksByTag(tag, limit = 20) {
        if (!this.apiKey) {
            return [];
        }

        try {
            const params = {
                method: 'tag.gettoptracks',
                api_key: this.apiKey,
                tag: tag,
                limit: limit,
                format: 'json'
            };

            const response = await axios.get(this.baseUrl, {
                params,
                headers: { 'User-Agent': this.userAgent },
                timeout: 10000
            });

            const topTracks = response.data.tracks?.track;
            
            if (topTracks && Array.isArray(topTracks)) {
                return topTracks.map(track => ({
                    name: track.name,
                    artist: track.artist?.name,
                    rank: parseInt(track['@attr']?.rank) || 0,
                    url: track.url,
                    duration: track.duration ? Math.round(parseInt(track.duration) / 1000) : null,
                    reason: `Popular in ${tag} genre`
                }));
            }
        } catch (error) {
            console.error('Last.fm top tracks by tag error:', error.message);
        }

        return [];
    }

    /**
     * Get trending tags/genres
     */
    async getTopTags(limit = 20) {
        if (!this.apiKey) {
            return [];
        }

        try {
            const params = {
                method: 'tag.gettoptags',
                api_key: this.apiKey,
                limit: limit,
                format: 'json'
            };

            const response = await axios.get(this.baseUrl, {
                params,
                headers: { 'User-Agent': this.userAgent },
                timeout: 10000
            });

            const topTags = response.data.toptags?.tag;
            
            if (topTags && Array.isArray(topTags)) {
                return topTags.map(tag => ({
                    name: tag.name,
                    count: parseInt(tag.count) || 0,
                    reach: parseInt(tag.reach) || 0
                }));
            }
        } catch (error) {
            console.error('Last.fm top tags error:', error.message);
        }

        return [];
    }

    /**
     * Search for tracks
     */
    async searchTracks(query, limit = 10) {
        if (!this.apiKey) {
            return [];
        }

        try {
            const params = {
                method: 'track.search',
                api_key: this.apiKey,
                track: query,
                limit: limit,
                format: 'json'
            };

            const response = await axios.get(this.baseUrl, {
                params,
                headers: { 'User-Agent': this.userAgent },
                timeout: 10000
            });

            const tracks = response.data.results?.trackmatches?.track;
            
            if (tracks) {
                const trackArray = Array.isArray(tracks) ? tracks : [tracks];
                return trackArray.map(track => ({
                    name: track.name,
                    artist: track.artist,
                    listeners: parseInt(track.listeners) || 0,
                    url: track.url
                }));
            }
        } catch (error) {
            console.error('Last.fm search tracks error:', error.message);
        }

        return [];
    }

    /**
     * Enhanced metadata extraction combining multiple Last.fm endpoints
     */
    async getEnhancedMetadata(artist, track) {
        if (!this.apiKey) {
            return null;
        }

        try {
            // Get track info and artist info in parallel
            const [trackInfo, artistInfo] = await Promise.all([
                this.getTrackInfo(artist, track),
                this.getArtistInfo(artist)
            ]);

            // Combine and enhance data
            const enhanced = {
                track: trackInfo,
                artist: artistInfo,
                genre: trackInfo?.genre || artistInfo?.genre || 'unknown',
                tags: [...(trackInfo?.tags || []), ...(artistInfo?.tags || [])],
                duration: trackInfo?.duration,
                popularity: {
                    trackListeners: trackInfo?.listeners || 0,
                    trackPlaycount: trackInfo?.playcount || 0,
                    artistListeners: artistInfo?.listeners || 0,
                    artistPlaycount: artistInfo?.playcount || 0
                }
            };

            return enhanced;

        } catch (error) {
            console.error('Last.fm enhanced metadata error:', error.message);
            return null;
        }
    }

    /**
     * Check if Last.fm API is available
     */
    isAvailable() {
        return !!this.apiKey;
    }

    /**
     * Get API status
     */
    getApiStatus() {
        return {
            available: this.isAvailable(),
            apiKey: this.apiKey ? '✅ Configured' : '❌ Missing',
            baseUrl: this.baseUrl
        };
    }
}

module.exports = LastFm;
