const { SlashCommandBuilder } = require('discord.js');
const CacheManager = require('../utils/cacheManager');
const musicPlayer = require('../../utils/musicPlayer');

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
        if (interaction.user.id !== '852599845071749240') {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const cacheManager = new CacheManager();
        const type = interaction.options.getString('type') || 'expired';

        await interaction.deferReply();

        try {
            const statsBefore = cacheManager.getCacheStats();
            const downloadStats = musicPlayer.getDownloadStats();
            
            if (type === 'all') {
                cacheManager.clearAllCache();
                await interaction.editReply('✅ All cache entries have been cleared!');
            } else if (type === 'downloads') {
                musicPlayer.cleanDownloads();
                await interaction.editReply(`✅ Old downloads cleaned! Was using ${downloadStats.sizeMB} MB`);
            } else if (type === 'everything') {
                cacheManager.clearAllCache();
                musicPlayer.cleanDownloads();
                await interaction.editReply(`✅ Everything cleaned! Cleared ${statsBefore.totalEntries} cache entries and ${downloadStats.sizeMB} MB of downloads`);
            } else {
                cacheManager.cleanExpiredCache();
                musicPlayer.cleanDownloads();
                const statsAfter = cacheManager.getCacheStats();
                const cleaned = statsBefore.totalEntries - statsAfter.totalEntries;
                await interaction.editReply(`✅ Cache cleaned! Removed ${cleaned} expired entries and old downloads. Remaining: ${statsAfter.totalEntries} cache entries`);
            }
        } catch (error) {
            console.error('Error in cleancache command:', error);
            await interaction.editReply('❌ An error occurred while cleaning the cache.');
        }
    },
};
