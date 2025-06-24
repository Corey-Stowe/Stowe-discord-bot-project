const ytdl = require("@distube/ytdl-core");
const ytpl = require("ytpl");
const fs = require("fs");

class Youtube {
    constructor() {}

    async getYoutubeInfo(url) {
        try {
            if (!url || !ytdl.validateURL(url)) {
                throw new Error("Invalid YouTube URL");
            }
            const info = await ytdl.getInfo(url);
            
            const title = info.videoDetails.title;
            const thumbnail = info.videoDetails.thumbnails[0].url;
            const author = info.videoDetails.author.name;
            
            // Fix: Use the correct streaming data structure
            const streamingData = {
                formats: info.formats || [],
                adaptiveFormats: info.formats ? info.formats.filter(format => 
                    format.hasAudio && !format.hasVideo
                ) : []
            };

            return { title, thumbnail, author, streamingData };

        } catch (error) {
            console.error("Error fetching YouTube info:", error);
            throw error;
        }
    }
    async getYoutubeInfoCookie(url, cookie) {
        try {
            if (!url || !ytdl.validateURL(url)) {
                throw new Error("Invalid YouTube URL");
            }
            let agent;
            if (cookie) {
                let cookiesArray;
                if (typeof cookie === 'string') {
                    try {
                        cookiesArray = JSON.parse(cookie);
                    } catch (error) {
                        console.error("Error parsing JSON cookie:", error);
                        throw new Error("Invalid JSON cookie format");
                    }
                } else if (Array.isArray(cookie)) {
                    cookiesArray = cookie;
                } else {
                    throw new Error("Invalid cookie format");
                }
                if (!Array.isArray(cookiesArray)) {
                    cookiesArray = [{ name: "cookie1", value: cookiesArray }];
                }
               // console.log("Parsed cookie array:", cookiesArray);
                agent = ytdl.createAgent(cookiesArray);
            } else {
                throw new Error("Invalid cookie format");
            }
            const info = await ytdl.getInfo(url, {
                agent: agent
            });
            // Info JSON encoded
            var data = JSON.stringify(info);
            const title = info.videoDetails.title;
            const thumbnail = info.videoDetails.thumbnails[0].url;
            const author = info.videoDetails.author.name;
            const streamingData = info.player_response?.streamingData;

            return { title, thumbnail, author, streamingData };

        } catch (error) {
            console.error("Error fetching YouTube info:", error);
            throw error;
        }
    }

    async getPlaylistInfo(playlistUrl) {
        try {
            if (!this.isPlaylistUrl(playlistUrl)) {
                throw new Error("Invalid YouTube playlist URL");
            }

            const playlist = await ytpl(playlistUrl, { limit: 100 }); // Limit to 100 videos to prevent spam
            
            return {
                title: playlist.title,
                author: playlist.author?.name || 'Unknown',
                thumbnail: playlist.bestThumbnail?.url,
                videoCount: playlist.items.length,
                videos: playlist.items.map(item => ({
                    title: item.title,
                    url: item.shortUrl,
                    videoId: item.id,
                    author: item.author?.name || 'Unknown',
                    thumbnail: item.bestThumbnail?.url,
                    duration: item.durationSec
                }))
            };
        } catch (error) {
            console.error("Error fetching playlist info:", error);
            throw error;
        }
    }

    isPlaylistUrl(url) {
        return url && (
            url.includes('playlist?list=') || 
            url.includes('&list=') ||
            url.includes('youtube.com/playlist')
        );
    }

    isVideoUrl(url) {
        return url && ytdl.validateURL(url);
    }

    extractPlaylistId(url) {
        const match = url.match(/[?&]list=([^&]+)/);
        return match ? match[1] : null;
    }
}



module.exports = Youtube;
