const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const CacheManager = require('../utils/cacheManager');
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
                    { name: 'Everything', value: 'everything' },
                    { name: 'Show Stats', value: 'info' },
                    { name: 'Check Size Limit', value: 'check_size' },
                    { name: 'Force Size Cleanup', value: 'force_cleanup' },
                    { name: 'Manual 24h Cleanup', value: 'scheduled_cleanup' }
                )),

    // Add admin-only flag
    adminOnly: true,

    async execute(interaction) {
        // Check if user is the authorized user
        if (interaction.user.id !== process.env.ADMIN_ID) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                flags: [4096]
            });
        }

        const cacheManager = new CacheManager();
        const type = interaction.options.getString('type') || 'expired';

        // Immediate acknowledgment to prevent timeout
        try {
            await interaction.deferReply();
        } catch (error) {
            console.error('Failed to defer reply:', error.message);
            try {
                return await interaction.reply({
                    content: 'Processing cache operation...',
                    flags: [4096]
                });
            } catch (replyError) {
                console.error('Failed to send initial reply:', replyError.message);
                return;
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
                await interaction.editReply('All cache entries have been cleared!');
            } else if (type === 'downloads') {
                if (musicPlayer && typeof musicPlayer.cleanDownloads === 'function') {
                    const deletedCount = musicPlayer.cleanDownloads(true);
                    await interaction.editReply(`All downloads cleaned! Deleted ${deletedCount} files (was using ${downloadStats.sizeMB} MB)`);
                } else {
                    await interaction.editReply('Download cleaning not available (feature not implemented yet)');
                }
            } else if (type === 'streamingasset') {
                try {
                    const cacheFilePath = path.join(__dirname, '../data/cache.json');
                    const cacheStatsBefore = cacheManager.getCacheStats();
                    fs.writeFileSync(cacheFilePath, '{}', 'utf8');
                    const freedSize = (cacheStatsBefore.totalSize / 1024).toFixed(2);
                    await interaction.editReply(`Streaming assets cache cleared! Removed ${cacheStatsBefore.totalEntries} entries (freed ${freedSize} KB)`);
                } catch (error) {
                    console.error('Error clearing streaming assets cache:', error);
                    await interaction.editReply('Error clearing streaming assets cache.');
                }
            } else if (type === 'everything') {
                cacheManager.clearAllCache();
                let deletedCount = 0;
                if (musicPlayer && typeof musicPlayer.cleanDownloads === 'function') {
                    deletedCount = musicPlayer.cleanDownloads(true);
                }

                // Also clear cache.json for streaming assets
                try {
                    const cacheFilePath = path.join(__dirname, '../data/cache.json');
                    fs.writeFileSync(cacheFilePath, '{}', 'utf8');
                } catch (error) {
                    console.log('Could not clear streaming assets cache:', error.message);
                }

                await interaction.editReply(
                    `Everything cleaned! ` +
                    `Cleared ${statsBefore.totalEntries} cache entries, ` +
                    `streaming assets cache, ` +
                    `and deleted ${deletedCount} download files (${downloadStats.sizeMB} MB)`
                );
            } else if (type === 'check_size') {
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
                    .setTitle('Cache Size Check')
                    .addFields(
                        {
                            name: 'Current Usage',
                            value: `${currentStats.sizeMB} MB / ${cacheConfig.maxSizeMB || 'Unknown'} MB\n` +
                                   `Usage: ${cacheConfig.maxSizeMB ? ((parseFloat(currentStats.sizeMB) / cacheConfig.maxSizeMB) * 100).toFixed(1) : 'Unknown'}%`,
                            inline: true
                        },
                        {
                            name: 'Cleanup Result',
                            value: sizeCheckResult.reason,
                            inline: true
                        },
                        {
                            name: 'Status',
                            value: sizeCheckResult.cleaned ?
                                `Freed ${sizeCheckResult.freedSpaceMB} MB\nDeleted ${sizeCheckResult.deletedCount} files` :
                                'No cleanup needed',
                            inline: true
                        },
                        {
                            name: 'Configuration',
                            value: `Max Size: ${cacheConfig.maxSizeMB || 'Unknown'} MB\n` +
                                   `Auto-cleanup: ${cacheConfig.autoCleanupEnabled ? 'Enabled' : 'Disabled'}\n` +
                                   `Cleanup Batch: ${cacheConfig.cleanupCount || 'Unknown'} files`,
                            inline: false
                        }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else if (type === 'force_cleanup') {
                const downloadStatsBefore = musicPlayer.getDownloadStats();
                const cacheConfig = musicPlayer.getCacheConfig();

                let cleanupResult = { cleaned: false, reason: 'Cleanup not available' };
                try {
                    if (musicPlayer && typeof musicPlayer.forceCleanupOldestFiles === 'function') {
                        cleanupResult = musicPlayer.forceCleanupOldestFiles(cacheConfig.cleanupCount || 5);
                    } else if (musicPlayer && typeof musicPlayer.cleanDownloads === 'function') {
                        const deletedCount = musicPlayer.cleanDownloads(false, 1);
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
                    .setTitle('Force Cache Cleanup')
                    .addFields(
                        {
                            name: 'Before Cleanup',
                            value: `${downloadStatsBefore.sizeMB} MB (${downloadStatsBefore.count} files)`,
                            inline: true
                        },
                        {
                            name: 'After Cleanup',
                            value: `${downloadStatsAfter.sizeMB} MB (${downloadStatsAfter.count} files)`,
                            inline: true
                        },
                        {
                            name: 'Results',
                            value: cleanupResult.cleaned ?
                                `Deleted ${cleanupResult.deletedCount || 'Unknown'} files\nFreed ${cleanupResult.freedSpaceMB || freedSpace} MB` :
                                'No files cleaned',
                            inline: true
                        },
                        {
                            name: 'Details',
                            value: cleanupResult.reason,
                            inline: false
                        }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else if (type === 'scheduled_cleanup') {
                const downloadStatsBefore = musicPlayer.getDownloadStats();

                const embed = new EmbedBuilder()
                    .setColor('#ffd700')
                    .setTitle('Manual 24-Hour Cleanup')
                    .setDescription('**Triggering the same cleanup that runs automatically every 24 hours...**\n\nProcessing...')
                    .addFields(
                        {
                            name: 'Before Cleanup',
                            value: `${downloadStatsBefore.sizeMB} MB (${downloadStatsBefore.count} files)`,
                            inline: true
                        },
                        {
                            name: 'Automatic Schedule',
                            value: 'This cleanup runs automatically every 24 hours\nCleans files older than 24 hours',
                            inline: true
                        }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

                try {
                    await musicPlayer.performScheduledCleanup();
                    const downloadStatsAfter = musicPlayer.getDownloadStats();
                    const freedSpace = (parseFloat(downloadStatsBefore.sizeMB) - parseFloat(downloadStatsAfter.sizeMB)).toFixed(2);

                    const resultEmbed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('Manual 24-Hour Cleanup Complete')
                        .setDescription('**Successfully performed the scheduled cleanup operation**')
                        .addFields(
                            {
                                name: 'Before Cleanup',
                                value: `${downloadStatsBefore.sizeMB} MB (${downloadStatsBefore.count} files)`,
                                inline: true
                            },
                            {
                                name: 'After Cleanup',
                                value: `${downloadStatsAfter.sizeMB} MB (${downloadStatsAfter.count} files)`,
                                inline: true
                            },
                            {
                                name: 'Results',
                                value: `Freed ${freedSpace} MB\nFiles older than 24 hours removed`,
                                inline: true
                            }
                        )
                        .setTimestamp();

                    await interaction.editReply({ embeds: [resultEmbed] });
                } catch (error) {
                    console.error('Error in manual scheduled cleanup:', error);
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff6b6b')
                        .setTitle('Manual 24-Hour Cleanup Failed')
                        .setDescription(`Error: ${error.message || 'Unknown error occurred'}`)
                        .setTimestamp();

                    await interaction.editReply({ embeds: [errorEmbed] });
                }
            } else if (type === 'info') {
                const cacheStats = cacheManager.getCacheStats();

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
                    if (musicPlayer && typeof musicPlayer.get24hStatus === 'function') {
                        const status24h = await musicPlayer.get24hStatus(interaction.guild.id);
                        music24hStats.enabled = status24h.enabled || false;
                        music24hStats.isPlaying = status24h.isPlaying || false;
                        music24hStats.currentSong = status24h.currentSong?.title || 'None';
                    }
                } catch (error) {
                    console.log('24/7 status not available:', error.message);
                }

                music24hStats.activeConnections = interaction.client.voice?.connections?.size || 0;

                const totalMemory = os.totalmem();
                const freeMemory = os.freemem();
                const usedMemory = totalMemory - freeMemory;
                const memoryUsage = process.memoryUsage();
                const uptime = process.uptime();
                const systemUptime = os.uptime();

                const formatUptime = (seconds) => {
                    const days = Math.floor(seconds / 86400);
                    const hours = Math.floor((seconds % 86400) / 3600);
                    const minutes = Math.floor((seconds % 3600) / 60);
                    return `${days}d ${hours}h ${minutes}m`;
                };

                const formatBytes = (bytes) => {
                    if (bytes === 0) return '0 B';
                    const k = 1024;
                    const sizes = ['B', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                };

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('System & Cache Statistics')
                    .addFields(
                        {
                            name: 'Cache Information',
                            value: `**Entries:** ${cacheStats.totalEntries}\n` +
                                   `**Size:** ${formatBytes(cacheStats.totalSize)}\n` +
                                   `**Location:** /data/cache.json`,
                            inline: true
                        },
                        {
                            name: 'Download Cache',
                            value: `**Size:** ${downloadStats.sizeMB} MB / ${cacheConfig.maxSizeMB || 'Unknown'} MB\n` +
                                   `**Files:** ${downloadStats.count || 'Unknown'}\n` +
                                   `**Auto-cleanup:** ${cacheConfig.autoCleanupEnabled ? 'Enabled' : 'Disabled'}`,
                            inline: true
                        },
                        {
                            name: 'Music Queues',
                            value: `**Active Queues:** ${queueStats.totalQueues}\n` +
                                   `**Total Songs:** ${queueStats.totalSongs}`,
                            inline: true
                        },
                        {
                            name: '24/7 Music System',
                            value: `**Status:** ${music24hStats.enabled ? 'Enabled' : 'Disabled'}\n` +
                                   `**Playing:** ${music24hStats.isPlaying ? 'Yes' : 'No'}\n` +
                                   `**Playlist Songs:** ${music24hStats.playlistSongs}\n` +
                                   `**Playlist Size:** ${music24hStats.playlistSize}`,
                            inline: true
                        },
                        {
                            name: 'System Memory',
                            value: `**Used:** ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}\n` +
                                   `**Bot RSS:** ${formatBytes(memoryUsage.rss)}\n` +
                                   `**Bot Heap:** ${formatBytes(memoryUsage.heapUsed)}`,
                            inline: true
                        },
                        {
                            name: 'Uptime',
                            value: `**Bot:** ${formatUptime(uptime)}\n` +
                                   `**System:** ${formatUptime(systemUptime)}\n` +
                                   `**Node.js:** ${process.version}`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'Use /cleancache scheduled_cleanup for manual 24h cleanup trigger' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }
            else {
                cacheManager.cleanExpiredCache();
                let deletedCount = 0;
                if (musicPlayer && typeof musicPlayer.cleanDownloads === 'function') {
                    deletedCount = musicPlayer.cleanDownloads();
                }
                const statsAfter = cacheManager.getCacheStats();
                const cleaned = statsBefore.totalEntries - statsAfter.totalEntries;
                await interaction.editReply(`Cache cleaned! Removed ${cleaned} expired entries and deleted ${deletedCount} old download files. Remaining: ${statsAfter.totalEntries} cache entries`);
            }
        } catch (error) {
            console.error('Error in cleancache command:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply('An error occurred while cleaning the cache.');
                } else {
                    await interaction.reply({
                        content: 'An error occurred while cleaning the cache.',
                        flags: [4096]
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
            }
        }
    },
};
