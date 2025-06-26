const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const youtubeApiManager = require('../utils/youtubeApiManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('youtube')
        .setDescription('Manage YouTube API keys for enhanced music functionality')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Add your YouTube API key')
                .addStringOption(option =>
                    option
                        .setName('apikey')
                        .setDescription('Your YouTube Data API v3 key')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Name for this API key (optional)')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option
                        .setName('dailylimit')
                        .setDescription('Daily quota limit (default: 10000)')
                        .setMinValue(1000)
                        .setMaxValue(1000000)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List your API keys and their usage'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove one of your API keys')
                .addStringOption(option =>
                    option
                        .setName('keyid')
                        .setDescription('ID of the API key to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Test an API key')
                .addStringOption(option =>
                    option
                        .setName('keyid')
                        .setDescription('ID of the API key to test (optional - tests random key if not provided)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show API usage statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('guide')
                .setDescription('Show how to get a YouTube API key')),

    // Add admin-only flag
    adminOnly: true,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'setup':
                    await this.handleSetup(interaction);
                    break;
                case 'list':
                    await this.handleList(interaction);
                    break;
                case 'remove':
                    await this.handleRemove(interaction);
                    break;
                case 'test':
                    await this.handleTest(interaction);
                    break;
                case 'stats':
                    await this.handleStats(interaction);
                    break;
                case 'guide':
                    await this.handleGuide(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error in youtube command:', error);
            await interaction.reply({
                content: '❌ An error occurred while managing YouTube API keys.',
                ephemeral: true
            });
        }
    },

    async handleSetup(interaction) {
        const apiKey = interaction.options.getString('apikey');
        const name = interaction.options.getString('name');
        const dailyLimit = interaction.options.getInteger('dailylimit') || 10000;

        await interaction.deferReply({ ephemeral: true });

        // Test the API key first
        const testResult = await youtubeApiManager.testApiKey(apiKey);
        
        if (!testResult.valid) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Invalid API Key')
                .setDescription('The provided API key is not valid or cannot access YouTube Data API v3.')
                .addFields(
                    { name: '🚫 Error', value: testResult.error, inline: false },
                    { name: '💡 Solutions', value: 
                        '• Make sure the API key is correct\n' +
                        '• Enable YouTube Data API v3 in Google Cloud Console\n' +
                        '• Check API key restrictions and permissions\n' +
                        '• Use `/youtube guide` for setup instructions'
                    }
                )
                .setFooter({ text: 'Your API key was not saved' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // Add the API key
        try {
            const keyId = youtubeApiManager.addApiKey({
                key: apiKey,
                name: name,
                owner: interaction.user.id,
                dailyLimit: dailyLimit
            });

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ API Key Added Successfully')
                .setDescription('Your YouTube API key has been added and tested successfully!')
                .addFields(
                    { name: '🆔 Key ID', value: keyId, inline: true },
                    { name: '📝 Name', value: name || `API Key by ${interaction.user.username}`, inline: true },
                    { name: '📊 Daily Limit', value: `${dailyLimit.toLocaleString()} units`, inline: true },
                    { name: '✅ Status', value: 'Active and ready to use', inline: true },
                    { name: '🔒 Security', value: 'Your API key is stored securely and only used for YouTube requests', inline: false }
                )
                .setFooter({ text: 'Use /youtube stats to monitor usage' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply('❌ Failed to save API key. Please try again.');
        }
    },

    async handleList(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const stats = youtubeApiManager.getApiKeyStats(interaction.user.id);
        
        if (stats.totalKeys === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle('📋 No API Keys Found')
                .setDescription('You haven\'t added any YouTube API keys yet.')
                .addFields(
                    { name: '🚀 Get Started', value: 'Use `/youtube setup` to add your first API key', inline: false },
                    { name: '📖 Need Help?', value: 'Use `/youtube guide` for setup instructions', inline: false }
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📋 Your YouTube API Keys')
            .setDescription(`You have **${stats.totalKeys}** API key(s) configured`)
            .setTimestamp();

        stats.keys.forEach((key, index) => {
            const statusEmoji = key.isActive ? '✅' : '❌';
            const quotaBar = this.createQuotaBar(key.quotaUsed, key.dailyLimit);
            
            embed.addFields({
                name: `${statusEmoji} ${key.name}`,
                value: 
                    `**ID:** \`${key.id}\`\n` +
                    `**Status:** ${key.isActive ? 'Active' : 'Inactive'}\n` +
                    `**Quota:** ${key.quotaUsed.toLocaleString()}/${key.dailyLimit.toLocaleString()} (${key.quotaPercentage}%)\n` +
                    `${quotaBar}\n` +
                    `**Errors:** ${key.errorCount}\n` +
                    `**Last Used:** ${key.lastUsed ? `<t:${Math.floor(key.lastUsed / 1000)}:R>` : 'Never'}\n` +
                    `**Added:** <t:${Math.floor(key.addedAt / 1000)}:R>`,
                inline: true
            });
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleRemove(interaction) {
        const keyId = interaction.options.getString('keyid');
        
        await interaction.deferReply({ ephemeral: true });

        try {
            youtubeApiManager.removeApiKey(keyId, interaction.user.id);
            
            const embed = new EmbedBuilder()
                .setColor('#ff6b35')
                .setTitle('🗑️ API Key Removed')
                .setDescription('Your API key has been successfully removed.')
                .addFields(
                    { name: '🆔 Removed Key ID', value: keyId, inline: true },
                    { name: '⏰ Removed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply(`❌ ${error.message}`);
        }
    },

    async handleTest(interaction) {
        const keyId = interaction.options.getString('keyid');
        
        await interaction.deferReply({ ephemeral: true });

        try {
            if (keyId) {
                // Test specific key
                const stats = youtubeApiManager.getApiKeyStats(interaction.user.id);
                const targetKey = stats.keys.find(k => k.id === keyId);
                
                if (!targetKey) {
                    return interaction.editReply('❌ API key not found or you don\'t own it.');
                }

                const testResult = await youtubeApiManager.testApiKey(targetKey.key);
                
                const embed = new EmbedBuilder()
                    .setColor(testResult.valid ? '#00ff00' : '#ff0000')
                    .setTitle(`${testResult.valid ? '✅' : '❌'} API Key Test Results`)
                    .addFields(
                        { name: '🆔 Key ID', value: keyId, inline: true },
                        { name: '📝 Key Name', value: targetKey.name, inline: true },
                        { name: '🧪 Test Result', value: testResult.valid ? 'Valid and working' : 'Invalid or error', inline: true }
                    );

                if (!testResult.valid) {
                    embed.addFields({ name: '🚫 Error Details', value: testResult.error, inline: false });
                }

                await interaction.editReply({ embeds: [embed] });
            } else {
                // Test a working key from the pool
                try {
                    const result = await youtubeApiManager.searchVideos('test', 1);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('✅ API System Test Successful')
                        .setDescription('Successfully performed a test search using available API keys.')
                        .addFields(
                            { name: '🔍 Test Query', value: 'test', inline: true },
                            { name: '📊 Results Found', value: `${result.length}`, inline: true },
                            { name: '⏰ Test Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                        )
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                } catch (error) {
                    await interaction.editReply(`❌ API test failed: ${error.message}`);
                }
            }

        } catch (error) {
            await interaction.editReply(`❌ Test failed: ${error.message}`);
        }
    },

    async handleStats(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const isAdmin = interaction.user.id === process.env.ADMIN_ID;
        const stats = youtubeApiManager.getApiKeyStats(isAdmin ? null : interaction.user.id);
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📊 YouTube API Statistics')
            .setDescription(isAdmin ? 'Global API usage statistics' : 'Your personal API usage statistics')
            .addFields(
                { name: '🔑 Total Keys', value: `${stats.totalKeys}`, inline: true },
                { name: '✅ Active Keys', value: `${stats.activeKeys}`, inline: true },
                { name: '❌ Inactive Keys', value: `${stats.totalKeys - stats.activeKeys}`, inline: true },
                { name: '📊 Quota Used Today', value: `${stats.totalQuotaUsed.toLocaleString()}`, inline: true },
                { name: '📈 Total Daily Limit', value: `${stats.totalDailyLimit.toLocaleString()}`, inline: true },
                { name: '📋 Usage Percentage', value: `${((stats.totalQuotaUsed / stats.totalDailyLimit) * 100).toFixed(1)}%`, inline: true }
            );

        // Add quota usage bar
        const quotaBar = this.createQuotaBar(stats.totalQuotaUsed, stats.totalDailyLimit);
        embed.addFields({ name: '📊 Daily Quota Usage', value: quotaBar, inline: false });

        // Show top keys by usage (admin only)
        if (isAdmin && stats.keys.length > 0) {
            const topKeys = stats.keys
                .sort((a, b) => b.quotaUsed - a.quotaUsed)
                .slice(0, 3);

            embed.addFields({
                name: '🏆 Top API Keys by Usage',
                value: topKeys.map((key, index) => 
                    `**${index + 1}.** ${key.name} - ${key.quotaUsed.toLocaleString()} units (${key.quotaPercentage}%)`
                ).join('\n') || 'No usage yet',
                inline: false
            });
        }

        embed.setFooter({ text: 'Quota resets daily at midnight UTC' })
             .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleGuide(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#4285f4')
            .setTitle('📖 YouTube API Key Setup Guide')
            .setDescription('Follow these steps to get your YouTube Data API v3 key:')
            .addFields(
                {
                    name: '1️⃣ Go to Google Cloud Console',
                    value: '[console.cloud.google.com](https://console.cloud.google.com)',
                    inline: false
                },
                {
                    name: '2️⃣ Create or Select Project',
                    value: '• Click "Select a project" → "New Project"\n• Give it a name like "Discord Bot"\n• Click "Create"',
                    inline: false
                },
                {
                    name: '3️⃣ Enable YouTube Data API v3',
                    value: '• Go to "APIs & Services" → "Library"\n• Search for "YouTube Data API v3"\n• Click on it and press "Enable"',
                    inline: false
                },
                {
                    name: '4️⃣ Create API Key',
                    value: '• Go to "APIs & Services" → "Credentials"\n• Click "Create Credentials" → "API Key"\n• Copy the generated key',
                    inline: false
                },
                {
                    name: '5️⃣ Secure Your Key (Recommended)',
                    value: '• Click on your API key to edit it\n• Under "Application restrictions" select "None" or configure as needed\n• Under "API restrictions" select "Restrict key" and choose "YouTube Data API v3"',
                    inline: false
                },
                {
                    name: '6️⃣ Add to Bot',
                    value: '• Use `/youtube setup apikey:YOUR_API_KEY_HERE`\n• The bot will test and save your key securely',
                    inline: false
                }
            );

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Google Cloud Console')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://console.cloud.google.com'),
                new ButtonBuilder()
                    .setLabel('YouTube API Documentation')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://developers.google.com/youtube/v3')
            );

        const warningEmbed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle('⚠️ Important Notes')
            .addFields(
                { name: '🔒 Security', value: 'Never share your API key publicly. The bot stores it securely and only uses it for YouTube requests.', inline: false },
                { name: '📊 Quota Limits', value: 'YouTube API has daily quota limits (usually 10,000 units). Monitor usage with `/youtube stats`.', inline: false },
                { name: '💰 Costs', value: 'YouTube Data API v3 is free for most use cases, but check Google Cloud pricing for high usage.', inline: false },
                { name: '🚀 Benefits', value: 'Using API keys bypasses bot detection issues and provides more reliable music playback.', inline: false }
            );

        await interaction.reply({ 
            embeds: [embed, warningEmbed], 
            components: [row], 
            ephemeral: true 
        });
    },

    // Helper method to create quota usage bar
    createQuotaBar(used, total) {
        const percentage = (used / total) * 100;
        const barLength = 20;
        const filledLength = Math.round((percentage / 100) * barLength);
        const emptyLength = barLength - filledLength;
        
        const filledBar = '█'.repeat(filledLength);
        const emptyBar = '░'.repeat(emptyLength);
        
        return `\`${filledBar}${emptyBar}\` ${percentage.toFixed(1)}%`;
    }
};
