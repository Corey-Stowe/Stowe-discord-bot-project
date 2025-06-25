const SpotifyWebApi = require('spotify-web-api-node');

class Spotify {
    constructor() {
        this.spotifyApi = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET
        });
        this.initialized = false;
        this.tokenExpiresAt = 0;
    }

    async initialize() {
        if (!this.initialized || Date.now() > this.tokenExpiresAt) {
            try {
                if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
                    throw new Error('Spotify credentials not found in environment variables');
                }

                // Get access token using client credentials flow
                const data = await this.spotifyApi.clientCredentialsGrant();
                
                this.spotifyApi.setAccessToken(data.body['access_token']);
                this.tokenExpiresAt = Date.now() + (data.body['expires_in'] * 1000) - 60000; // Refresh 1 minute before expiry
                this.initialized = true;
                
                console.log('Spotify plugin initialized successfully');
            } catch (error) {
                console.error('Failed to initialize Spotify plugin:', error);
                throw error;
            }
        }
    }

    isSpotifyUrl(url) {
        return url && (
            url.includes('spotify.com/') ||
            url.includes('open.spotify.com/') ||
            url.includes('spotify:')
        );
    }

    isTrackUrl(url) {
        return this.isSpotifyUrl(url) && (url.includes('/track/') || url.includes('spotify:track:'));
    }

    isPlaylistUrl(url) {
        return this.isSpotifyUrl(url) && (url.includes('/playlist/') || url.includes('spotify:playlist:'));
    }

    isAlbumUrl(url) {
        return this.isSpotifyUrl(url) && (url.includes('/album/') || url.includes('spotify:album:'));
    }

    extractTrackId(url) {
        // Handle both HTTP URLs and Spotify URIs
        if (url.includes('spotify:track:')) {
            return url.split('spotify:track:')[1].split('?')[0];
        } else if (url.includes('/track/')) {
            return url.split('/track/')[1].split('?')[0];
        }
        return null;
    }

    extractPlaylistId(url) {
        if (url.includes('spotify:playlist:')) {
            return url.split('spotify:playlist:')[1].split('?')[0];
        } else if (url.includes('/playlist/')) {
            return url.split('/playlist/')[1].split('?')[0];
        }
        return null;
    }

    extractAlbumId(url) {
        if (url.includes('spotify:album:')) {
            return url.split('spotify:album:')[1].split('?')[0];
        } else if (url.includes('/album/')) {
            return url.split('/album/')[1].split('?')[0];
        }
        return null;
    }

    async getTrackInfo(url) {
        try {
            await this.initialize();
            
            const trackId = this.extractTrackId(url);
            if (!trackId) {
                throw new Error('Invalid Spotify track URL');
            }

            const trackData = await this.spotifyApi.getTrack(trackId);
            const track = trackData.body;
            
            return {
                title: track.name,
                author: track.artists.map(artist => artist.name).join(', '),
                album: track.album.name,
                thumbnail: track.album.images[0]?.url || null,
                duration: track.duration_ms,
                durationFormatted: this.formatDuration(track.duration_ms),
                url: track.external_urls.spotify,
                spotifyId: track.id,
                popularity: track.popularity,
                explicit: track.explicit,
                previewUrl: track.preview_url, // 30-second preview URL
                isrc: track.external_ids?.isrc || null, // For finding on other platforms
                releaseDate: track.album.release_date,
                searchQuery: `${track.artists[0].name} ${track.name}` // For YouTube/SoundCloud fallback
            };
        } catch (error) {
            console.error('Error getting Spotify track info:', error);
            throw error;
        }
    }

    async getPlaylistInfo(url) {
        try {
            await this.initialize();
            
            const playlistId = this.extractPlaylistId(url);
            if (!playlistId) {
                throw new Error('Invalid Spotify playlist URL');
            }

            const playlistData = await this.spotifyApi.getPlaylist(playlistId);
            const playlist = playlistData.body;
            
            // Get all tracks (handle pagination)
            let tracks = [];
            let offset = 0;
            const limit = 50;
            
            while (true) {
                const tracksData = await this.spotifyApi.getPlaylistTracks(playlistId, {
                    offset: offset,
                    limit: limit
                });
                
                const currentTracks = tracksData.body.items
                    .filter(item => item.track && item.track.type === 'track')
                    .map(item => ({
                        title: item.track.name,
                        author: item.track.artists.map(artist => artist.name).join(', '),
                        album: item.track.album.name,
                        thumbnail: item.track.album.images[0]?.url || null,
                        duration: item.track.duration_ms,
                        durationFormatted: this.formatDuration(item.track.duration_ms),
                        url: item.track.external_urls.spotify,
                        spotifyId: item.track.id,
                        searchQuery: `${item.track.artists[0].name} ${item.track.name}`
                    }));
                
                tracks = tracks.concat(currentTracks);
                
                if (tracksData.body.items.length < limit) {
                    break;
                }
                
                offset += limit;
            }
            
            return {
                title: playlist.name,
                author: playlist.owner.display_name,
                description: playlist.description,
                thumbnail: playlist.images[0]?.url || null,
                trackCount: tracks.length,
                tracks: tracks,
                url: playlist.external_urls.spotify,
                followers: playlist.followers.total,
                public: playlist.public
            };
        } catch (error) {
            console.error('Error getting Spotify playlist info:', error);
            throw error;
        }
    }

    async getAlbumInfo(url) {
        try {
            await this.initialize();
            
            const albumId = this.extractAlbumId(url);
            if (!albumId) {
                throw new Error('Invalid Spotify album URL');
            }

            const albumData = await this.spotifyApi.getAlbum(albumId);
            const album = albumData.body;
            
            const tracks = album.tracks.items.map(track => ({
                title: track.name,
                author: track.artists.map(artist => artist.name).join(', '),
                album: album.name,
                thumbnail: album.images[0]?.url || null,
                duration: track.duration_ms,
                durationFormatted: this.formatDuration(track.duration_ms),
                url: track.external_urls.spotify,
                spotifyId: track.id,
                searchQuery: `${track.artists[0].name} ${track.name}`
            }));
            
            return {
                title: album.name,
                author: album.artists.map(artist => artist.name).join(', '),
                thumbnail: album.images[0]?.url || null,
                trackCount: tracks.length,
                tracks: tracks,
                url: album.external_urls.spotify,
                releaseDate: album.release_date,
                totalTracks: album.total_tracks,
                genres: album.genres
            };
        } catch (error) {
            console.error('Error getting Spotify album info:', error);
            throw error;
        }
    }

    async searchTracks(query, limit = 10) {
        try {
            await this.initialize();
            
            const searchResults = await this.spotifyApi.searchTracks(query, { limit: limit });
            
            return searchResults.body.tracks.items.map(track => ({
                title: track.name,
                author: track.artists.map(artist => artist.name).join(', '),
                album: track.album.name,
                thumbnail: track.album.images[0]?.url || null,
                duration: track.duration_ms,
                durationFormatted: this.formatDuration(track.duration_ms),
                url: track.external_urls.spotify,
                spotifyId: track.id,
                popularity: track.popularity,
                explicit: track.explicit,
                searchQuery: `${track.artists[0].name} ${track.name}` // For fallback streaming
            }));
        } catch (error) {
            console.error('Error searching Spotify:', error);
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

    formatPopularity(popularity) {
        if (!popularity) return 'Unknown';
        if (popularity >= 80) return '🔥 Very Popular';
        if (popularity >= 60) return '🎵 Popular';
        if (popularity >= 40) return '👍 Moderately Popular';
        if (popularity >= 20) return '📈 Rising';
        return '🆕 New/Niche';
    }    // Helper method to create search query for YouTube/SoundCloud fallback
    createFallbackSearchQuery(spotifyTrack) {
        const { title, author, album, isrc } = spotifyTrack;
        
        // If we have ISRC, use it for more accurate matching
        if (isrc) {
            return `${author} ${title} ${album}`;
        }
        
        // Clean up the title and artist for better matching
        const cleanTitle = title
            .replace(/\(.*?\)/g, '') // Remove parentheses content
            .replace(/\[.*?\]/g, '') // Remove brackets content
            .replace(/\s+/g, ' ')    // Normalize whitespace
            .trim();
            
        const cleanArtist = author
            .split(',')[0]           // Take first artist if multiple
            .replace(/\(.*?\)/g, '') // Remove parentheses
            .trim();
        
        return `${cleanArtist} ${cleanTitle}`;
    }

    // Enhanced search for better YouTube/SoundCloud matching
    async findBestMatch(spotifyTrack, youtube, soundcloud) {
        const searchQueries = [
            // Primary search with ISRC if available
            spotifyTrack.isrc ? `${spotifyTrack.author} ${spotifyTrack.title} ${spotifyTrack.isrc}` : null,
            // Clean search
            this.createFallbackSearchQuery(spotifyTrack),
            // Album-specific search
            `${spotifyTrack.author} ${spotifyTrack.title} ${spotifyTrack.album}`,
            // Simple search
            `${spotifyTrack.author} ${spotifyTrack.title}`,
        ].filter(Boolean);

        for (const query of searchQueries) {
            try {
                // Try YouTube first
                const youtubeResults = await youtube.searchVideos(query, 3);
                for (const result of youtubeResults) {
                    // Check if duration matches (within 10 seconds tolerance)
                    const spotifyDurationSec = Math.floor(spotifyTrack.duration / 1000);
                    const youtubeDurationSec = this.parseDurationToSeconds(result.durationFormatted);
                    
                    if (Math.abs(spotifyDurationSec - youtubeDurationSec) <= 10) {
                        // Get full video info
                        const videoInfo = await youtube.getYoutubeInfo(result.url);
                        return {
                            platform: 'youtube',
                            audioUrl: this.extractBestAudioFormat(videoInfo),
                            originalUrl: result.url,
                            matchQuality: 'high'
                        };
                    }
                }

                // Try SoundCloud if YouTube didn't work
                try {
                    const soundcloudResults = await soundcloud.search(query, 3);
                    for (const result of soundcloudResults) {
                        const spotifyDurationSec = Math.floor(spotifyTrack.duration / 1000);
                        const soundcloudDurationSec = Math.floor(result.duration / 1000);
                        
                        if (Math.abs(spotifyDurationSec - soundcloudDurationSec) <= 10) {
                            return {
                                platform: 'soundcloud',
                                audioUrl: await soundcloud.getStreamUrl(result.url),
                                originalUrl: result.url,
                                matchQuality: 'high'
                            };
                        }
                    }
                } catch (scError) {
                    console.warn('SoundCloud search failed:', scError);
                }
            } catch (error) {
                console.warn(`Search failed for query: ${query}`, error);
                continue;
            }
        }

        // Fallback to basic search if no good match found
        const basicQuery = `${spotifyTrack.author} ${spotifyTrack.title}`;
        try {
            const youtubeResults = await youtube.searchVideos(basicQuery, 1);
            if (youtubeResults.length > 0) {
                const videoInfo = await youtube.getYoutubeInfo(youtubeResults[0].url);
                return {
                    platform: 'youtube',
                    audioUrl: this.extractBestAudioFormat(videoInfo),
                    originalUrl: youtubeResults[0].url,
                    matchQuality: 'low'
                };
            }
        } catch (error) {
            console.warn('Fallback YouTube search failed:', error);
        }

        throw new Error('No suitable audio source found');
    }

    parseDurationToSeconds(durationStr) {
        if (!durationStr) return 0;
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1]; // MM:SS
        } else if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
        }
        return 0;
    }

    extractBestAudioFormat(videoInfo) {
        if (!videoInfo.streamingData || !videoInfo.streamingData.adaptiveFormats) {
            throw new Error('No audio formats available');
        }

        const audioFormats = videoInfo.streamingData.adaptiveFormats.filter(format => 
            format.mimeType && format.mimeType.includes('audio') && 
            format.url && format.contentLength
        );

        if (audioFormats.length === 0) {
            throw new Error('No suitable audio formats found');
        }

        // Sort by quality preference
        const sortedFormats = audioFormats.sort((a, b) => {
            // Prefer MP4 over WebM
            if (a.mimeType.includes('mp4') && !b.mimeType.includes('mp4')) return -1;
            if (!a.mimeType.includes('mp4') && b.mimeType.includes('mp4')) return 1;
            // Then by bitrate
            return (b.averageBitrate || 0) - (a.averageBitrate || 0);
        });

        return sortedFormats[0].url;
    }
}

module.exports = Spotify;
