const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Show bot information and system statistics'),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Bot information
            const botVersion = '2.5.1'; // Updated for enhanced YouTube integration
            const author = 'stowe';
            const repo = 'https://github.com/Corey-Stowe/Stowe-discord-bot-project';
            const issuesUrl = 'https://github.com/Corey-Stowe/Stowe-discord-bot-project/issues';

            // System stats
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();
            const usedMemory = totalMemory - freeMemory;
            const memoryUsage = process.memoryUsage();
            const uptime = process.uptime();
            const systemUptime = os.uptime();
            const cpuUsage = os.loadavg(); // 1, 5, 15 minute load averages

            // Bot stats
            const guildCount = interaction.client.guilds.cache.size;
            const userCount = interaction.client.users.cache.size;
            const channelCount = interaction.client.channels.cache.size;

            // Queue stats
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

            // YouTube configuration stats
            let youtubeConfigStats = {
                apiEnabled: false,
                keysAvailable: 0,
                quotaUsed: 0,
                totalQuota: 0,
                cookiesConfigured: false,
                currentMethod: 'default'
            };

            try {
                const youtubeApiManager = require('../utils/youtubeApiManager');
                const cookieManager = require('../utils/cookieManager');
                
                const apiStats = youtubeApiManager.getApiKeyStats();
                const hasValidCookies = await cookieManager.hasValidCookies();
                
                youtubeConfigStats = {
                    apiEnabled: youtubeApiManager.isApiEnabled(),
                    keysAvailable: apiStats.totalKeys,
                    activeKeys: apiStats.activeKeys,
                    quotaUsed: apiStats.totalQuotaUsed,
                    totalQuota: apiStats.totalDailyLimit,
                    cookiesConfigured: hasValidCookies,
                    currentMethod: hasValidCookies 
                        ? 'cookies' 
                        : youtubeApiManager.isApiEnabled() && process.env.YOUTUBE_PREFER_API === 'true' 
                            ? 'api' 
                            : 'default'
                };
            } catch (error) {
                console.log('YouTube configuration stats not available:', error.message);
            }

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

            // Format CPU load average
            const formatCpuLoad = (load) => {
                const percentage = (load * 100).toFixed(1);
                let status = '🟢';
                if (load > 0.7) status = '🔴';
                else if (load > 0.5) status = '🟡';
                return `${status} ${percentage}%`;
            };

            const embed = new EmbedBuilder()
                .setColor('#00d4ff')
                .setTitle('🤖 Stowe Discord Bot')
                .setDescription(`**Version:** ${botVersion}\n**Author:** ${author}`)
                .addFields(
                    {
                        name: '📊 Bot Statistics',
                        value: `**Servers:** ${guildCount}\n` +
                               `**Users:** ${userCount}\n` +
                               `**Channels:** ${channelCount}\n` +
                               `**Uptime:** ${formatUptime(uptime)}`,
                        inline: true
                    },
                    {
                        name: '🎵 Music System',
                        value: `**Active Queues:** ${queueStats.totalQueues}\n` +
                               `**Queued Songs:** ${queueStats.totalSongs}\n` +
                               `**Voice Connections:** ${interaction.client.voice?.connections?.size || 0}`,
                        inline: true
                    },
                    {
                        name: '🖥️ System Load',
                        value: `**CPU Load (1m):** ${formatCpuLoad(cpuUsage[0])}\n` +
                               `**CPU Load (5m):** ${formatCpuLoad(cpuUsage[1])}\n` +
                               `**CPU Load (15m):** ${formatCpuLoad(cpuUsage[2])}\n` +
                               `**CPU Cores:** ${os.cpus().length}`,
                        inline: true
                    },
                    {
                        name: '💾 Memory Usage',
                        value: `**System Used:** ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)} (${((usedMemory / totalMemory) * 100).toFixed(1)}%)\n` +
                               `**Bot RSS:** ${formatBytes(memoryUsage.rss)}\n` +
                               `**Bot Heap:** ${formatBytes(memoryUsage.heapUsed)} / ${formatBytes(memoryUsage.heapTotal)}`,
                        inline: true
                    },
                    {
                        name: '⚙️ System Information',
                        value: `**Platform:** ${os.platform()} ${os.arch()}\n` +
                               `**Node.js:** ${process.version}\n` +
                               `**System Uptime:** ${formatUptime(systemUptime)}`,
                        inline: true
                    },
                    {
                        name: '🔗 Links & Support',
                        value: `**Repository:** [GitHub](${repo})\n` +
                               `**Report Issues:** [Issues Page](${issuesUrl})\n` +
                               `**License:** MIT`,
                        inline: true
                    },
                    {
                        name: '🎵 YouTube Configuration',
                        value: `**Priority Order:** 🔧 Default (v2.4) → 🍪 Cookies → 🔑 API\n` +
                               `**Current Method:** ${youtubeConfigStats.currentMethod === 'api' ? '🔑 API (Fallback)' : youtubeConfigStats.currentMethod === 'cookies' ? '🍪 Cookies (if available)' : '🔧 Default (v2.4 compatibility)'}\n` +
                               `**API Status:** ${youtubeConfigStats.apiEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                               `**API Keys:** ${youtubeConfigStats.keysAvailable} total (${youtubeConfigStats.activeKeys || 0} active)\n` +
                               `**Cookies:** ${youtubeConfigStats.cookiesConfigured ? '✅ Configured' : '❌ Not configured'}\n` +
                               `**Quota Used:** ${youtubeConfigStats.quotaUsed.toLocaleString()}/${youtubeConfigStats.totalQuota.toLocaleString()} units\n` +
                               `**HTML Cleanup:** ✅ Auto-cleanup enabled`,
                        inline: true
                    }
                )
                .setFooter({ 
                    text: `${interaction.client.user.username} • Created by ${author}`,
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTimestamp();

            // Add bot avatar as thumbnail
            if (interaction.client.user.displayAvatarURL()) {
                embed.setThumbnail(interaction.client.user.displayAvatarURL());
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in info command:', error);
            await interaction.editReply('❌ An error occurred while fetching bot information.');
        }
    },
};
