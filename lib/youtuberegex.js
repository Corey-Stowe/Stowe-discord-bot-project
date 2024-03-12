function normalizeYouTubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);
    // Nếu liên kết không phù hợp, trả về nguyên bản
    if (!match) {
        return url;
    }
    const videoId = match[4];
    return `https://www.youtube.com/watch?v=${videoId}`;
}

function sanitizeFilename(filename) {
    return filename.replace(/[\\/:*?"<>|]/g, '_');
}
module.exports = {  
    normalizeYouTubeUrl,
    sanitizeFilename
}