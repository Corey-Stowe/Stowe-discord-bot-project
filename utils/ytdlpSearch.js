/**
 * yt-dlp search utility
 *
 * The @distube/yt-dlp `json()` export mixes stderr into stdout before JSON.parse,
 * which crashes when yt-dlp prints deprecation warnings. This module spawns yt-dlp
 * directly and only parses stdout.
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('./logger');

const IS_WINDOWS = process.platform === 'win32';
const YTDLP_DIR = process.env.YTDLP_DIR || path.join(require.resolve('@distube/yt-dlp'), '..', '..', 'bin');
const YTDLP_PATH = path.join(YTDLP_DIR, `yt-dlp${IS_WINDOWS ? '.exe' : ''}`);

/**
 * Run yt-dlp and return parsed JSON (stdout only, stderr ignored)
 */
function ytdlpJson(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP_PATH, args);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk) => { stdout += chunk; });
        proc.stderr.on('data', (chunk) => { stderr += chunk; });

        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`yt-dlp exited with code ${code}: ${stderr || stdout}`));
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject(new Error(`yt-dlp JSON parse error: ${e.message}\nstdout: ${stdout.substring(0, 200)}`));
            }
        });
        proc.on('error', reject);
    });
}

/**
 * Search YouTube via yt-dlp
 * @param {string} query - Search query
 * @param {number} limit - Max results (default 5)
 * @returns {Promise<Array<{title, author, url, thumbnail, duration, formattedDuration, views}>>}
 */
async function search(query, limit = 5) {
    // Input validation
    if (!query || typeof query !== 'string') return [];
    query = query.replace(/[\x00\n\r]/g, '').trim().substring(0, 200);
    if (query.length === 0) return [];

    try {
        const results = await ytdlpJson([
            `ytsearch${limit}:${query}`,
            '--dump-single-json',
            '--no-warnings',
            '--no-call-home',
            '--skip-download',
            '--simulate',
            '--flat-playlist',
        ]);

        const entries = results.entries || [];
        return entries.map(r => {
            const dur = r.duration || 0;
            const mins = Math.floor(dur / 60);
            const secs = Math.floor(dur % 60);
            return {
                name: r.title || r.fulltitle || 'Unknown',
                title: r.title || r.fulltitle || 'Unknown',
                author: r.uploader || r.channel || 'Unknown',
                uploader: { name: r.uploader || r.channel || 'Unknown' },
                url: r.webpage_url || r.url || r.original_url,
                thumbnail: r.thumbnail || (r.thumbnails && r.thumbnails[0]?.url) || null,
                duration: dur,
                formattedDuration: `${mins}:${secs.toString().padStart(2, '0')}`,
                views: r.view_count || 0,
                platform: 'youtube',
            };
        });
    } catch (error) {
        logger.error('YTDLP', `Search failed for "${query}": ${error.message}`);
        return [];
    }
}

module.exports = { search, ytdlpJson };
