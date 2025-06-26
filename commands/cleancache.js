const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const CacheManager = require('../src/utils/cacheManager');
const musicPlayer = require('../utils/musicPlayer');
const os = require('os');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cleancache')
        .setDescription('Clean expired cache entries and downloads')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of cleaning')
                .setRequired(false)
                .addChoices(
                    { name: 'Expired only', value: 'expired' },
                    { name: 'All cache', value: 'all' },
                    { name: 'Downloads only', value: 'downloads' },
                    { name: 'Streaming Assets', value: 'streamingasset' },
                    { name: 'HTML Cache', value: 'html' },
                    { name: 'Cookies', value: 'cookies' },
                    { name: 'API Keys', value: 'apikeys' },
                    { name: 'Everything', value: 'everything' },
                    { name: 'Show Stats', value: 'info' },
                    { name: 'Check Size Limit', value: 'check_size' },
                    { name: 'Force Size Cleanup', value: 'force_cleanup' }
                )),
    
    // Add admin-only flag
    adminOnly: true,
    
    async execute(interaction) {
        // Check if user is the authorized user
        if (interaction.user.id !== process.env.ADMIN_ID) {
            return interaction.reply({ 
                content: 'You do not have permission to use this command.', 
                flags: [4096] // Use flags instead of ephemeral: true
            });
        }

        const cacheManager = new CacheManager();
        const type = interaction.options.getString('type') || 'expired';

        // Immediate acknowledgment to prevent timeout
        try {
            await interaction.deferReply();
        } catch (error) {
            console.error('Failed to defer reply:', error.message);
            // If defer fails, try a quick reply
            try {
                return await interaction.reply({ 
                    content: '⏳ Processing cache operation...', 
                    flags: [4096] 
                });
            } catch (replyError) {
                console.error('Failed to send initial reply:', replyError.message);
                return; // Exit if we can't respond at all
            }
        }

        try {
            const statsBefore = cacheManager.getCacheStats();
            
            // Check if musicPlayer has the methods we need
            let downloadStats = { sizeMB: '0' };
            try {
                if (musicPlayer && typeof musicPlayer.getDownloadStats === 'function') {
                    downloadStats = musicPlayer.getDownloadStats();
                }
            } catch (error) {
                console.log('Download stats not available:', error.message);
            }
            
            if (type === 'all') {
                cacheManager.clearAllCache();
                await interaction.editReply('✅ All cache entries have been cleared!');
            } else if (type === 'downloads') {
                if (musicPlayer && typeof musicPlayer.cleanDownloads === 'function') {
                    const deletedCount = musicPlayer.cleanDownloads(true); // Clean all files immediately
                    await interaction.editReply(`✅ All downloads cleaned! Deleted ${deletedCount} files (was using ${downloadStats.sizeMB} MB)`);
                } else {
                    await interaction.editReply('✅ Download cleaning not available (feature not implemented yet)');
                }
            } else if (type === 'streamingasset') {
                // Clear the cache.json file (YouTube video metadata cache)
                try {
                    const cacheFilePath = path.join(__dirname, '../data/cache.json');
                    const cacheStatsBefore = cacheManager.getCacheStats();
                    
                    // Empty the cache.json file
                    fs.writeFileSync(cacheFilePath, '{}', 'utf8');
                    
                    const cacheStatsAfter = cacheManager.getCacheStats();
                    const freedSize = (cacheStatsBefore.totalSize / 1024).toFixed(2); // Convert to KB
                    
                    await interaction.editReply(`✅ Streaming assets cache cleared! Removed ${cacheStatsBefore.totalEntries} YouTube video metadata entries (freed ${freedSize} KB)`);
                } catch (error) {
                    console.error('Error clearing streaming assets cache:', error);
                    await interaction.editReply('❌ Error clearing streaming assets cache. The file might not exist or be accessible.');
                }
            } else if (type === 'html') {
                // Clear HTML cache files with better error handling
                try {
                    const youtube = new (require('../Plugins/Youtube'))();
                    const htmlCacheDir = path.join(__dirname, '../data/html');
                    const projectRoot = path.join(__dirname, '..');
                    let deletedCount = 0;
                    let freedSizeMB = 0;
                    let corruptedCount = 0;
                    
                    // Clean both cache directory and project root
                    const locations = [htmlCacheDir, projectRoot];
                    
                    for (const location of locations) {
                        if (fs.existsSync(location)) {
                            const files = fs.readdirSync(location);
                            const htmlFiles = files.filter(file => 
                                file.endsWith('.html') && 
                                (file.includes('watch') || file.match(/^\d+-watch\.html$/))
                            );
                            
                            for (const file of htmlFiles) {
                                try {
                                    const filePath = path.join(location, file);
                                    const stats = fs.statSync(filePath);
                                    freedSizeMB += stats.size / (1024 * 1024);
                                    
                                    // Check if file is corrupted
                                    let isCorrupted = false;
                                    try {
                                        const content = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' });
                                        const firstChunk = content.substring(0, 100);
                                        
                                        if (!firstChunk.includes('<!DOCTYPE') && 
                                            !firstChunk.includes('<html') &&
                                            !firstChunk.includes('youtube') &&
                                            (firstChunk.includes('\u0000') || 
                                             firstChunk.match(/[\x00-\x08\x0E-\x1F\x7F-\xFF]{10,}/))) {
                                            isCorrupted = true;
                                            corruptedCount++;
                                        }
                                    } catch (readError) {
                                        isCorrupted = true;
                                        corruptedCount++;
                                    }
                                    
                                    fs.unlinkSync(filePath);
                                    deletedCount++;
                                } catch (error) {
                                    console.warn(`Failed to delete HTML file ${file}:`, error.message);
                                }
                            }
                        }
                    }
                    
                    await interaction.editReply(
                        `✅ HTML cache cleared! Deleted ${deletedCount} HTML files ` +
                        `(${corruptedCount} were corrupted/binary) ` +
                        `from cache and project root (freed ${freedSizeMB.toFixed(2)} MB)`
                    );
                } catch (error) {
                    console.error('Error clearing HTML cache:', error);
                    await interaction.editReply('❌ Error clearing HTML cache. The directories might not exist or be accessible.');
                }
            } else if (type === 'cookies') {
                // Clear YouTube cookies
                try {
                    const cookieManager = require('../utils/cookieManager');
                    const statsBefore = cookieManager.getStats();
                    
                    cookieManager.clearCookies();
                    
                    await interaction.editReply(`✅ YouTube cookies cleared! Reset ${statsBefore.cookieCount} cookies to defaults`);
                } catch (error) {
                    console.error('Error clearing cookies:', error);
                    await interaction.editReply('❌ Error clearing cookies. The cookie manager might not be available.');
                }
            } else if (type === 'apikeys') {
                // Clear all API keys (admin only)
                if (interaction.user.id !== process.env.ADMIN_ID) {
                    return interaction.editReply('❌ Only admins can clear all API keys. Use `/youtube remove` to remove your own keys.');
                }
                
                try {
                    const youtubeApiManager = require('../utils/youtubeApiManager');
                    const statsBefore = youtubeApiManager.getApiKeyStats();
                    
                    youtubeApiManager.clearAllApiKeys();
                    
                    await interaction.editReply(`✅ All API keys cleared! Removed ${statsBefore.totalKeys} YouTube API keys`);
                } catch (error) {
                    console.error('Error clearing API keys:', error);
                    await interaction.editReply('❌ Error clearing API keys. The API manager might not be available.');
                }
            } else if (type === 'everything') {
                cacheManager.clearAllCache();
                let deletedCount = 0;
                if (musicPlayer && typeof musicPlayer.cleanDownloads === 'function') {
                    deletedCount = musicPlayer.cleanDownloads(true); // Clean all files immediately
                }
                
                // Also clear cache.json for streaming assets
                try {
                    const cacheFilePath = path.join(__dirname, '../data/cache.json');
                    fs.writeFileSync(cacheFilePath, '{}', 'utf8');
                } catch (error) {
                    console.log('Could not clear streaming assets cache:', error.message);
                }
                
                // Clear HTML cache
                let htmlDeletedCount = 0;
                try {
                    const htmlCacheDir = path.join(__dirname, '../data/html');
                    if (fs.existsSync(htmlCacheDir)) {
                        const files = fs.readdirSync(htmlCacheDir);
                        const htmlFiles = files.filter(file => file.endsWith('.html'));
                        for (const file of htmlFiles) {
                            fs.unlinkSync(path.join(htmlCacheDir, file));
                            htmlDeletedCount++;
                        }
                    }
                } catch (error) {
                    console.log('Could not clear HTML cache:', error.message);
                }
                
                // Clear cookies
                try {
                    const cookieManager = require('../utils/cookieManager');
                    cookieManager.clearCookies();
                } catch (error) {
                    console.log('Could not clear cookies:', error.message);
                }
                
                // Clear API keys (admin only)
                let apiKeysCleared = 0;
                if (interaction.user.id === process.env.ADMIN_ID) {
                    try {
                        const youtubeApiManager = require('../utils/youtubeApiManager');
                        const apiStats = youtubeApiManager.getApiKeyStats();
                        apiKeysCleared = apiStats.totalKeys;
                        youtubeApiManager.clearAllApiKeys();
                    } catch (error) {
                        console.log('Could not clear API keys:', error.message);
                    }
                }
                
                await interaction.editReply(
                    `✅ Everything cleaned! ` +
                    `Cleared ${statsBefore.totalEntries} cache entries, ` +
                    `streaming assets cache, ` +
                    `${htmlDeletedCount} HTML cache files, ` +
                    `cookies, ` +
                    `${apiKeysCleared > 0 ? `${apiKeysCleared} API keys, ` : ''}` +
                    `and deleted ${deletedCount} download files (${downloadStats.sizeMB} MB)`
                );
            } else if (type === 'check_size') {
                // Check cache size and trigger automatic cleanup if needed
                let sizeCheckResult = { cleaned: false, reason: 'Size check not available' };
                
                try {
                    if (musicPlayer && typeof musicPlayer.checkCacheSizeAndCleanup === 'function') {
                        sizeCheckResult = musicPlayer.checkCacheSizeAndCleanup();
                    }
                } catch (error) {
                    console.log('Size check not available:', error.message);
                }

                const currentStats = musicPlayer.getDownloadStats();
                const cacheConfig = musicPlayer.getCacheConfig();
                
                const embed = new EmbedBuilder()
                    .setColor(sizeCheckResult.cleaned ? '#ff9500' : '#00ff00')
                    .setTitle('📊 Cache Size Check')
                    .addFields(
                        { 
                            name: '📁 Current Usage', 
                            value: `${currentStats.sizeMB} MB / ${cacheConfig.maxSizeMB || 'Unknown'} MB\n` +
                                   `Usage: ${cacheConfig.maxSizeMB ? ((parseFloat(currentStats.sizeMB) / cacheConfig.maxSizeMB) * 100).toFixed(1) : 'Unknown'}%`, 
                            inline: true 
                        },
                        { 
                            name: '🧹 Cleanup Result', 
                            value: sizeCheckResult.reason, 
                            inline: true 
                        },
                        { 
                            name: '📈 Status', 
                            value: sizeCheckResult.cleaned ? 
                                `✅ Freed ${sizeCheckResult.freedSpaceMB} MB\nDeleted ${sizeCheckResult.deletedCount} files` : 
                                '✅ No cleanup needed', 
                            inline: true 
                        },
                        {
                            name: '⚙️ Configuration',
                            value: `Max Size: ${cacheConfig.maxSizeMB || 'Unknown'} MB\n` +
                                   `Auto-cleanup: ${cacheConfig.autoCleanupEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                                   `Cleanup Batch: ${cacheConfig.cleanupCount || 'Unknown'} files`,
                            inline: false
                        }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else if (type === 'force_cleanup') {
                // Force cleanup of oldest files regardless of size limit
                const downloadStatsBefore = musicPlayer.getDownloadStats();
                const cacheConfig = musicPlayer.getCacheConfig();
                
                let cleanupResult = { cleaned: false, reason: 'Cleanup not available' };
                
                try {
                    if (musicPlayer && typeof musicPlayer.forceCleanupOldestFiles === 'function') {
                        cleanupResult = musicPlayer.forceCleanupOldestFiles(cacheConfig.cleanupCount || 5);
                    } else if (musicPlayer && typeof musicPlayer.cleanDownloads === 'function') {
                        const deletedCount = musicPlayer.cleanDownloads(false, 1); // Clean files older than 1 hour
                        cleanupResult = {
                            cleaned: deletedCount > 0,
                            deletedCount,
                            reason: `Cleaned files older than 1 hour`,
                            freedSpaceMB: 'Unknown'
                        };
                    }
                } catch (error) {
                    console.log('Force cleanup not available:', error.message);
                }

                const downloadStatsAfter = musicPlayer.getDownloadStats();
                const freedSpace = (parseFloat(downloadStatsBefore.sizeMB) - parseFloat(downloadStatsAfter.sizeMB)).toFixed(2);
                
                const embed = new EmbedBuilder()
                    .setColor(cleanupResult.cleaned ? '#00ff00' : '#ff6b6b')
                    .setTitle('🧹 Force Cache Cleanup')
                    .addFields(
                        { 
                            name: '📁 Before Cleanup', 
                            value: `${downloadStatsBefore.sizeMB} MB (${downloadStatsBefore.count} files)`, 
                            inline: true 
                        },
                        { 
                            name: '📁 After Cleanup', 
                            value: `${downloadStatsAfter.sizeMB} MB (${downloadStatsAfter.count} files)`, 
                            inline: true 
                        },
                        { 
                            name: '🗑️ Results', 
                            value: cleanupResult.cleaned ? 
                                `✅ Deleted ${cleanupResult.deletedCount || 'Unknown'} files\nFreed ${cleanupResult.freedSpaceMB || freedSpace} MB` : 
                                '❌ No files cleaned', 
                            inline: true 
                        },
                        {
                            name: '📋 Details',
                            value: cleanupResult.reason,
                            inline: false
                        }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else if (type === 'info') {
                // Get comprehensive system stats
                const cacheStats = cacheManager.getCacheStats();
                
                // Get download stats safely
                let downloadStats = { sizeMB: 0, count: 0 };
                let cacheConfig = {};
                try {
                    if (musicPlayer && typeof musicPlayer.getDownloadStats === 'function') {
                        downloadStats = musicPlayer.getDownloadStats();
                        cacheConfig = musicPlayer.getCacheConfig();
                    }
                } catch (error) {
                    console.log('Download stats not available:', error.message);
                }

                // Get queue stats
                let queueStats = { totalQueues: 0, totalSongs: 0 };
                try {
                    const queuePath = path.join(__dirname, '../data/queues.json');
                    if (fs.existsSync(queuePath)) {
                        const queues = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
                        queueStats.totalQueues = Object.keys(queues).length;
                        queueStats.totalSongs = Object.values(queues).reduce((total, queue) => total + queue.length, 0);
                    }
                } catch (error) {
                    console.log('Queue stats not available:', error.message);
                }

                // Get 24/7 music system stats
                let music24hStats = {
                    enabled: false,
                    activeConnections: 0,
                    playlistSongs: 0,
                    isPlaying: false,
                    currentSong: 'None',
                    shuffleMode: false,
                    playlistSize: '0 MB'
                };

                try {
                    // Check for preset24h module
                    const preset24h = require('../utils/preset24h.js');
                    if (preset24h) {
                        const playlistInfo = preset24h.getPlaylistInfo();
                        const playlistStats = preset24h.getPlaylistStats();
                        
                        music24hStats.playlistSongs = playlistInfo.totalSongs || 0;
                        music24hStats.shuffleMode = playlistInfo.shuffleMode || false;
                        music24hStats.playlistSize = `${(playlistStats.totalSize / (1024 * 1024)).toFixed(2)} MB`;
                    }
                } catch (error) {
                    console.log('24/7 playlist stats not available:', error.message);
                }

                try {
                    // Check musicPlayer for 24/7 status
                    if (musicPlayer && typeof musicPlayer.get24hStatus === 'function') {
                        const status24h = await musicPlayer.get24hStatus(interaction.guild.id);
                        music24hStats.enabled = status24h.enabled || false;
                        music24hStats.isPlaying = status24h.isPlaying || false;
                        music24hStats.currentSong = status24h.currentSong?.title || 'None';
                    }
                } catch (error) {
                    console.log('24/7 status not available:', error.message);
                }

                // Count active voice connections
                music24hStats.activeConnections = interaction.client.voice?.connections?.size || 0;

                // Get system stats
                const totalMemory = os.totalmem();
                const freeMemory = os.freemem();
                const usedMemory = totalMemory - freeMemory;
                const memoryUsage = process.memoryUsage();
                const uptime = process.uptime();
                const systemUptime = os.uptime();

                // Format uptime
                const formatUptime = (seconds) => {
                    const days = Math.floor(seconds / 86400);
                    const hours = Math.floor((seconds % 86400) / 3600);
                    const minutes = Math.floor((seconds % 3600) / 60);
                    return `${days}d ${hours}h ${minutes}m`;
                };

                // Format bytes
                const formatBytes = (bytes) => {
                    if (bytes === 0) return '0 B';
                    const k = 1024;
                    const sizes = ['B', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                };

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📊 System & Cache Statistics')
                    .addFields(
                        {
                            name: '💾 Cache Information',
                            value: `**Entries:** ${cacheStats.totalEntries}\n` +
                                   `**Size:** ${formatBytes(cacheStats.totalSize)}\n` +
                                   `**Average Entry Size:** ${cacheStats.totalEntries > 0 ? formatBytes(cacheStats.totalSize / cacheStats.totalEntries) : '0 B'}\n` +
                                   `**Location:** /data/cache.json (YouTube metadata)`,
                            inline: true
                        },
                        {
                            name: '📁 Download Cache',
                            value: `**Size:** ${downloadStats.sizeMB} MB / ${cacheConfig.maxSizeMB || 'Unknown'} MB\n` +
                                   `**Usage:** ${cacheConfig.maxSizeMB ? ((parseFloat(downloadStats.sizeMB) / cacheConfig.maxSizeMB) * 100).toFixed(1) : 'Unknown'}%\n` +
                                   `**Files:** ${downloadStats.count || 'Unknown'}\n` +
                                   `**Auto-cleanup:** ${cacheConfig.autoCleanupEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                                   `**Cleanup Count:** ${cacheConfig.cleanupCount || 'Unknown'} files per batch\n` +
                                   `**Location:** /downloads/`,
                            inline: true
                        },
                        {
                            name: '🎵 Music Queues',
                            value: `**Active Queues:** ${queueStats.totalQueues}\n` +
                                   `**Total Songs:** ${queueStats.totalSongs}\n` +
                                   `**Average per Queue:** ${queueStats.totalQueues > 0 ? Math.round(queueStats.totalSongs / queueStats.totalQueues) : 0}`,
                            inline: true
                        },
                        {
                            name: '📻 24/7 Music System',
                            value: `**Status:** ${music24hStats.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                                   `**Playing:** ${music24hStats.isPlaying ? '▶️ Yes' : '⏸️ No'}\n` +
                                   `**Voice Connections:** ${music24hStats.activeConnections}\n` +
                                   `**Playlist Songs:** ${music24hStats.playlistSongs}\n` +
                                   `**Shuffle Mode:** ${music24hStats.shuffleMode ? '🔀 On' : '📋 Off'}\n` +
                                   `**Playlist Size:** ${music24hStats.playlistSize}`,
                            inline: true
                        },
                        {
                            name: '🎶 Current 24/7 Song',
                            value: `**Now Playing:** ${music24hStats.currentSong}\n` +
                                   `**Auto-play:** ${music24hStats.enabled ? 'Active' : 'Inactive'}\n` +
                                   `**Mode:** ${music24hStats.shuffleMode ? 'Shuffle' : 'Sequential'}`,
                            inline: true
                        },
                        {
                            name: '🖥️ System Memory',
                            value: `**Total:** ${formatBytes(totalMemory)}\n` +
                                   `**Used:** ${formatBytes(usedMemory)} (${((usedMemory / totalMemory) * 100).toFixed(1)}%)\n` +
                                   `**Free:** ${formatBytes(freeMemory)}`,
                            inline: true
                        },
                        {
                            name: '🤖 Bot Memory Usage',
                            value: `**RSS:** ${formatBytes(memoryUsage.rss)}\n` +
                                   `**Heap Used:** ${formatBytes(memoryUsage.heapUsed)}\n` +
                                   `**Heap Total:** ${formatBytes(memoryUsage.heapTotal)}`,
                            inline: true
                        },
                        {
                            name: '⏱️ Uptime Information',
                            value: `**Bot Uptime:** ${formatUptime(uptime)}\n` +
                                   `**System Uptime:** ${formatUptime(systemUptime)}\n` +
                                   `**CPU Cores:** ${os.cpus().length}`,
                            inline: true
                        },
                        {
                            name: '💻 System Information',
                            value: `**Platform:** ${os.platform()}\n` +
                                   `**Architecture:** ${os.arch()}\n` +
                                   `**Node.js:** ${process.version}`,
                            inline: false
                        },
                        {
                            name: '🧹 Cache Management',
                            value: `**Max Size:** ${cacheConfig.maxSizeMB || 'Unknown'} MB\n` +
                                   `**Current Usage:** ${downloadStats.sizeMB} MB (${cacheConfig.maxSizeMB ? ((parseFloat(downloadStats.sizeMB) / cacheConfig.maxSizeMB) * 100).toFixed(1) : 'Unknown'}%)\n` +
                                   `**Auto-cleanup:** ${cacheConfig.autoCleanupEnabled ? 'Active' : 'Disabled'}\n` +
                                   `**Cleanup Batch:** ${cacheConfig.cleanupCount || 'Unknown'} oldest files\n` +
                                   `**Status:** ${cacheConfig.maxSizeMB && parseFloat(downloadStats.sizeMB) > cacheConfig.maxSizeMB ? '⚠️ Over Limit' : '✅ Within Limit'}`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'System statistics refreshed • Use /cleancache check_size to test auto-cleanup' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } 
            else {
                cacheManager.cleanExpiredCache();
                let deletedCount = 0;
                if (musicPlayer && typeof musicPlayer.cleanDownloads === 'function') {
                    deletedCount = musicPlayer.cleanDownloads(); // Keep 24h rule for expired cleaning
                }
                const statsAfter = cacheManager.getCacheStats();
                const cleaned = statsBefore.totalEntries - statsAfter.totalEntries;
                await interaction.editReply(`✅ Cache cleaned! Removed ${cleaned} expired entries and deleted ${deletedCount} old download files. Remaining: ${statsAfter.totalEntries} cache entries`);
            }
        } catch (error) {
            console.error('Error in cleancache command:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply('❌ An error occurred while cleaning the cache.');
                } else {
                    await interaction.reply({ 
                        content: '❌ An error occurred while cleaning the cache.', 
                        flags: [4096] 
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
                // Log the original error for debugging
                console.error('Original cache command error:', error);
            }
        }
    },
};
