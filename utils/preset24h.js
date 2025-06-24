const fs = require('fs');
const path = require('path');
const { createAudioResource } = require('@discordjs/voice');

class Preset24h {
    constructor() {
        this.presetDir = path.join(__dirname, '../data/preset-music');
        this.playlistFile = path.join(this.presetDir, 'playlist.json');
        this.currentPlaylist = [];
        this.currentIndex = 0;
        this.shuffleMode = false;
        this.supportedFormats = ['.mp3', '.flac', '.wav', '.ogg', '.m4a'];
        this.init();
    }

    init() {
        // Create preset music directory if it doesn't exist
        if (!fs.existsSync(this.presetDir)) {
            fs.mkdirSync(this.presetDir, { recursive: true });
            console.log('Created preset music directory');
        }

        // Create default playlist if it doesn't exist
        if (!fs.existsSync(this.playlistFile)) {
            this.createDefaultPlaylist();
        }

        this.loadPlaylist();
        this.autoScanDirectory();
    }

    autoScanDirectory() {
        try {
            const files = fs.readdirSync(this.presetDir);
            const musicFiles = files.filter(file => 
                this.supportedFormats.includes(path.extname(file).toLowerCase())
            );

            let playlist = JSON.parse(fs.readFileSync(this.playlistFile, 'utf8'));
            const existingSongs = playlist.songs.map(song => song.file);
            let newSongsAdded = 0;

            // Add new music files to playlist
            musicFiles.forEach(file => {
                if (!existingSongs.includes(file)) {
                    const songData = {
                        title: this.generateTitleFromFilename(file),
                        file: file,
                        duration: 0, // Will be updated when played
                        artist: "Unknown",
                        addedAt: Date.now(),
                        autoScanned: true
                    };
                    playlist.songs.push(songData);
                    newSongsAdded++;
                }
            });

            // Remove songs that no longer exist
            const removedSongs = playlist.songs.filter(song => 
                !musicFiles.includes(song.file)
            );

            playlist.songs = playlist.songs.filter(song => 
                musicFiles.includes(song.file)
            );

            if (newSongsAdded > 0 || removedSongs.length > 0) {
                fs.writeFileSync(this.playlistFile, JSON.stringify(playlist, null, 2));
                console.log(`Auto-scan: Added ${newSongsAdded} new songs, removed ${removedSongs.length} missing songs`);
                this.loadPlaylist();
            }

        } catch (error) {
            console.error('Error auto-scanning music directory:', error);
        }
    }

    generateTitleFromFilename(filename) {
        // Remove extension and clean up filename
        let title = path.parse(filename).name;
        // Replace underscores and dashes with spaces
        title = title.replace(/[_-]/g, ' ');
        // Capitalize first letter of each word
        title = title.replace(/\w\S*/g, (txt) => 
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
        return title;
    }

    createDefaultPlaylist() {
        const defaultPlaylist = {
            name: "24/7 Preset Playlist",
            description: "Default music for 24/7 mode",
            songs: [],
            shuffle: true,
            loop: true
        };

        fs.writeFileSync(this.playlistFile, JSON.stringify(defaultPlaylist, null, 2));
        console.log('Created default 24/7 playlist');
    }

    loadPlaylist() {
        try {
            const data = fs.readFileSync(this.playlistFile, 'utf8');
            const playlist = JSON.parse(data);
            
            // Filter songs that actually exist
            this.currentPlaylist = playlist.songs.filter(song => {
                const filePath = path.join(this.presetDir, song.file);
                return fs.existsSync(filePath);
            });

            this.shuffleMode = playlist.shuffle || false;
            
            if (this.shuffleMode) {
                this.shufflePlaylist();
            }

            console.log(`Loaded ${this.currentPlaylist.length} preset songs`);
        } catch (error) {
            console.error('Error loading preset playlist:', error);
            this.currentPlaylist = [];
        }
    }

    shufflePlaylist() {
        for (let i = this.currentPlaylist.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.currentPlaylist[i], this.currentPlaylist[j]] = [this.currentPlaylist[j], this.currentPlaylist[i]];
        }
    }

    getNextSong() {
        if (this.currentPlaylist.length === 0) {
            return null;
        }

        const song = this.currentPlaylist[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.currentPlaylist.length;

        // If we've completed a cycle and shuffle is on, reshuffle
        if (this.currentIndex === 0 && this.shuffleMode) {
            this.shufflePlaylist();
        }

        return {
            title: song.title,
            author: song.artist,
            filePath: path.join(this.presetDir, song.file),
            duration: song.duration,
            isPreset: true
        };
    }

    getCurrentSong() {
        if (this.currentPlaylist.length === 0) {
            return null;
        }
        return this.currentPlaylist[this.currentIndex];
    }

    getPlaylistInfo() {
        return {
            totalSongs: this.currentPlaylist.length,
            currentIndex: this.currentIndex,
            shuffleMode: this.shuffleMode,
            hasValidSongs: this.currentPlaylist.length > 0
        };
    }

    addSongToPlaylist(songData) {
        try {
            const playlist = JSON.parse(fs.readFileSync(this.playlistFile, 'utf8'));
            playlist.songs.push(songData);
            fs.writeFileSync(this.playlistFile, JSON.stringify(playlist, null, 2));
            this.loadPlaylist(); // Reload the playlist
            return true;
        } catch (error) {
            console.error('Error adding song to preset playlist:', error);
            return false;
        }
    }

    createAudioResource(song) {
        try {
            if (!fs.existsSync(song.filePath)) {
                throw new Error(`Preset file not found: ${song.filePath}`);
            }

            return createAudioResource(song.filePath, {
                inlineVolume: true,
                metadata: {
                    title: song.title,
                    artist: song.author
                }
            });
        } catch (error) {
            console.error('Error creating audio resource for preset:', error);
            return null;
        }
    }

    getPlaylistStats() {
        const stats = {
            totalSongs: this.currentPlaylist.length,
            totalSize: 0,
            formats: {},
            autoScanned: 0,
            manuallyAdded: 0
        };

        this.currentPlaylist.forEach(song => {
            const filePath = path.join(this.presetDir, song.file);
            try {
                const fileStats = fs.statSync(filePath);
                stats.totalSize += fileStats.size;
                
                const ext = path.extname(song.file).toLowerCase();
                stats.formats[ext] = (stats.formats[ext] || 0) + 1;
                
                if (song.autoScanned) {
                    stats.autoScanned++;
                } else {
                    stats.manuallyAdded++;
                }
            } catch (error) {
                // File doesn't exist
            }
        });

        return stats;
    }

    updatePlaylist() {
        this.autoScanDirectory();
        return this.getPlaylistStats();
    }

    clearPlaylist() {
        try {
            const emptyPlaylist = {
                name: "24/7 Preset Playlist",
                description: "Default music for 24/7 mode",
                songs: [],
                shuffle: true,
                loop: true
            };
            fs.writeFileSync(this.playlistFile, JSON.stringify(emptyPlaylist, null, 2));
            this.loadPlaylist();
            return true;
        } catch (error) {
            console.error('Error clearing playlist:', error);
            return false;
        }
    }

    shuffleCurrentPlaylist() {
        this.shuffleMode = true;
        this.shufflePlaylist();
        this.updatePlaylistSettings({ shuffle: true });
        return true;
    }

    updatePlaylistSettings(settings) {
        try {
            const playlist = JSON.parse(fs.readFileSync(this.playlistFile, 'utf8'));
            Object.assign(playlist, settings);
            fs.writeFileSync(this.playlistFile, JSON.stringify(playlist, null, 2));
            return true;
        } catch (error) {
            console.error('Error updating playlist settings:', error);
            return false;
        }
    }

    getDirectoryContents() {
        try {
            const files = fs.readdirSync(this.presetDir);
            const contents = {
                musicFiles: [],
                otherFiles: [],
                totalSize: 0
            };

            files.forEach(file => {
                const filePath = path.join(this.presetDir, file);
                const stats = fs.statSync(filePath);
                const fileInfo = {
                    name: file,
                    size: stats.size,
                    modified: stats.mtime,
                    extension: path.extname(file).toLowerCase()
                };

                contents.totalSize += stats.size;

                if (this.supportedFormats.includes(fileInfo.extension)) {
                    contents.musicFiles.push(fileInfo);
                } else {
                    contents.otherFiles.push(fileInfo);
                }
            });

            return contents;
        } catch (error) {
            console.error('Error reading directory contents:', error);
            return { musicFiles: [], otherFiles: [], totalSize: 0 };
        }
    }
}

module.exports = new Preset24h();
