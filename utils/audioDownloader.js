const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');

class AudioDownloader {
    constructor() {
        this.downloadDir = path.join(__dirname, '../downloads');
        this.ensureDownloadDir();
    }

    ensureDownloadDir() {
        if (!fs.existsSync(this.downloadDir)) {
            fs.mkdirSync(this.downloadDir, { recursive: true });
        }
    }

    getFilePath(videoId) {
        return path.join(this.downloadDir, `${videoId}.mp4`);
    }

    async downloadAudio(url, videoId) {
        return new Promise((resolve, reject) => {
            try {
                const filePath = this.getFilePath(videoId);
                
                // Check if file already exists
                if (fs.existsSync(filePath)) {
                    console.log(`Audio file already exists: ${videoId}`);
                    return resolve(filePath);
                }

                console.log(`Downloading audio for: ${videoId}`);
                
                const stream = ytdl(url, {
                    filter: 'audioonly',
                    quality: 'highestaudio',
                    format: 'mp4'
                });

                const writeStream = fs.createWriteStream(filePath);
                
                stream.pipe(writeStream);

                stream.on('error', (error) => {
                    console.error('Download stream error:', error);
                    // Clean up partial file
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                    reject(error);
                });

                writeStream.on('error', (error) => {
                    console.error('Write stream error:', error);
                    // Clean up partial file
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                    reject(error);
                });

                writeStream.on('finish', () => {
                    console.log(`Audio download completed: ${videoId}`);
                    resolve(filePath);
                });

                // Add timeout
                setTimeout(() => {
                    if (!writeStream.destroyed) {
                        writeStream.destroy();
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                        reject(new Error('Download timeout'));
                    }
                }, 120000); // 2 minutes timeout

            } catch (error) {
                console.error('Download error:', error);
                reject(error);
            }
        });
    }

    fileExists(videoId) {
        const filePath = this.getFilePath(videoId);
        return fs.existsSync(filePath);
    }

    deleteFile(videoId) {
        const filePath = this.getFilePath(videoId);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted audio file: ${videoId}`);
        }
    }

    // Clean old files (older than 24 hours by default, or all files if immediate = true)
    cleanOldFiles(immediate = false) {
        try {
            if (!fs.existsSync(this.downloadDir)) {
                console.log('Download directory does not exist');
                return 0;
            }

            const files = fs.readdirSync(this.downloadDir);
            const now = Date.now();
            const maxAge = immediate ? 0 : 24 * 60 * 60 * 1000; // Clean all if immediate, otherwise 24 hours
            let deletedCount = 0;

            files.forEach(file => {
                const filePath = path.join(this.downloadDir, file);
                try {
                    const stats = fs.statSync(filePath);
                    
                    if (immediate || (now - stats.mtime.getTime() > maxAge)) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                        console.log(`Deleted ${immediate ? '' : 'old '}file: ${file}`);
                    }
                } catch (error) {
                    console.error(`Error processing file ${file}:`, error);
                }
            });

            console.log(`Cleaned ${deletedCount} ${immediate ? '' : 'old '}audio files`);
            return deletedCount;
        } catch (error) {
            console.error('Error cleaning files:', error);
            return 0;
        }
    }

    // Get download directory size
    getDirectorySize() {
        try {
            let totalSize = 0;
            const files = fs.readdirSync(this.downloadDir);
            
            files.forEach(file => {
                const filePath = path.join(this.downloadDir, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;
            });

            return totalSize;
        } catch (error) {
            console.error('Error getting directory size:', error);
            return 0;
        }
    }
}

module.exports = AudioDownloader;
