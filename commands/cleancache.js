const { SlashCommandBuilder } = require('discord.js');
const CacheManager = require('../src/utils/cacheManager');
const musicPlayer = require('../utils/musicPlayer');

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
                    { name: 'Everything', value: 'everything' }
                )),
    
    async execute(interaction) {
        // Check if user is the authorized user
        if (interaction.user.id !== process.env.ADMIN_ID) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const cacheManager = new CacheManager();
        const type = interaction.options.getString('type') || 'expired';

        await interaction.deferReply();

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
            } else if (type === 'everything') {
                cacheManager.clearAllCache();
                let deletedCount = 0;
                if (musicPlayer && typeof musicPlayer.cleanDownloads === 'function') {
                    deletedCount = musicPlayer.cleanDownloads(true); // Clean all files immediately
                }
                await interaction.editReply(`✅ Everything cleaned! Cleared ${statsBefore.totalEntries} cache entries and deleted ${deletedCount} download files (${downloadStats.sizeMB} MB)`);
            } else {
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
            await interaction.editReply('❌ An error occurred while cleaning the cache.');
        }
    },
};
