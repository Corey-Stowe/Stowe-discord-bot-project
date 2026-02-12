/**
 * Patch @distube/yt-dlp to fix stderr/stdout mixing bug
 *
 * The library's json() function concatenates stderr into stdout before JSON.parse,
 * which crashes when yt-dlp prints deprecation warnings to stderr.
 * This script patches the dist file to separate stdout from stderr.
 *
 * Run automatically via npm postinstall, or manually: node scripts/patch-ytdlp.js
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'node_modules', '@distube', 'yt-dlp', 'dist', 'index.js');

if (!fs.existsSync(filePath)) {
    console.log('[patch-ytdlp] @distube/yt-dlp not installed, skipping patch.');
    process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');

// Check if already patched (look for our stderr separation)
if (content.includes('let stderr = "";')) {
    console.log('[patch-ytdlp] Already patched, skipping.');
    process.exit(0);
}

const original = `    let output = "";
    process2.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    process2.stderr?.on("data", (chunk) => {
      output += chunk;
    });
    process2.on("close", (code) => {
      if (code === 0) resolve(JSON.parse(output));
      else reject(new Error(output));
    });`;

const patched = `    let stdout = "";
    let stderr = "";
    process2.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    process2.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    process2.on("close", (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error("JSON parse error: " + e.message + "\\nstderr: " + stderr));
        }
      }
      else reject(new Error(stderr || stdout));
    });`;

if (!content.includes(original)) {
    console.log('[patch-ytdlp] Could not find original code to patch (may have changed). Skipping.');
    process.exit(0);
}

content = content.replace(original, patched);
fs.writeFileSync(filePath, content, 'utf8');
console.log('[patch-ytdlp] Successfully patched @distube/yt-dlp json() to separate stdout/stderr.');
