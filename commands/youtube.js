const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const youtubeApiManager = require('../utils/youtubeApiManager');
const YouTubeModeManager = require('../utils/youtubeModeManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('youtube')
        .setDescription('Manage YouTube API keys for enhanced music functionality (Admin only)')
        .setDefaultMemberPermissions('0') // Requires administrator permissions
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Add your YouTube API key')
                .addStringOption(option =>
                    option
                        .setName('apikey')
                        .setDescription('Your YouTube Data API v3 key')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('A name to identify this API key')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('dailylimit')
                        .setDescription('Daily quota limit for this key (default: 10000)')
                        .setRequired(false)
                        .setMinValue(100)
                        .setMaxValue(1000000)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current YouTube API configuration and mode status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View YouTube API usage statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('guide')
                .setDescription('Get a guide on setting up YouTube API keys')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all configured API keys')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove an API key')
                .addStringOption(option =>
                    option
                        .setName('keyid')
                        .setDescription('The ID of the API key to remove')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        // Check if user has administrator permissions
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ 
                content: '❌ This command is restricted to administrators only.', 
                ephemeral: true 
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'setup':
                await this.handleSetup(interaction);
                break;
            case 'status':
                await this.handleStatus(interaction);
                break;
            case 'stats':
                await this.handleStats(interaction);
                break;
            case 'guide':
                await this.handleGuide(interaction);
                break;
            case 'list':
                await this.handleList(interaction);
                break;
            case 'remove':
                await this.handleRemove(interaction);
                break;
            default:
                await interaction.reply({ content: '❌ Unknown subcommand!', ephemeral: true });
        }
    },

    async handleSetup(interaction) {
        const apiKey = interaction.options.getString('apikey');
        const name = interaction.options.getString('name');
        const dailyLimit = interaction.options.getInteger('dailylimit') || 10000;

        await interaction.deferReply({ ephemeral: true });

        // Check current YouTube mode first
        const modeManager = new YouTubeModeManager();
        const currentMode = modeManager.getCurrentMode();
        const modeInfo = modeManager.getModeInfo();

        // Warn if not in API mode
        if (currentMode !== 'api') {
            const warningEmbed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle('⚠️ Mode Notice')
                .setDescription(`Current YouTube mode: **${currentMode}**`)
                .addFields(
                    { name: '📋 Current Mode', value: modeInfo.description, inline: false },
                    { name: '💡 Tip', value: 'Use `/youtubemode switch api` to enable API-only mode after adding your key', inline: false }
                )
                .setFooter({ text: 'API keys will still be saved and can be used when switching to API mode' });

            await interaction.editReply({ embeds: [warningEmbed] });
            
            // Wait 3 seconds to let user read the warning
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

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

            // Check if we can now switch to default (hybrid) mode for best results
            const canUseDefaultMode = modeManager.validateModeRequirements('default').canActivate;
            let modeRecommendation = '';
            
            if (currentMode !== 'default' && canUseDefaultMode) {
                modeRecommendation = '\n\n🔄 **Recommended Mode: Default (Hybrid)**\nUse `/youtubemode switch default` to enable hybrid mode for the best music playback experience (combines API reliability with streaming capability).';
            } else if (currentMode === 'api') {
                modeRecommendation = '\n\n⚠️ **Note**: API-only mode provides metadata only (no audio streaming). For music playback, use `/youtubemode switch default` for hybrid mode.';
            }

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ API Key Added Successfully')
                .setDescription('Your YouTube API key has been added and tested successfully!' + modeRecommendation)
                .addFields(
                    { name: '🆔 Key ID', value: keyId, inline: true },
                    { name: '📝 Name', value: name || `API Key by ${interaction.user.username}`, inline: true },
                    { name: '📊 Daily Limit', value: `${dailyLimit.toLocaleString()} units`, inline: true },
                    { name: '✅ Status', value: 'Active and ready to use', inline: true },
                    { name: '🎵 Current Mode', value: `${currentMode} (${modeInfo.description})`, inline: false },
                    { name: '🔒 Security', value: 'Your API key is stored securely and only used for YouTube requests', inline: false }
                )
                .setFooter({ text: 'Use /youtube stats to monitor usage' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply('❌ Failed to save API key. Please try again.');
        }
    },

    async handleStatus(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const modeManager = new YouTubeModeManager();
        const currentMode = modeManager.getCurrentMode();
        const modeInfo = modeManager.getModeInfo();
        const requirements = modeManager.getModeRequirements();

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 YouTube System Status')
            .setDescription(`**Current Mode:** ${currentMode}`)
            .addFields(
                { name: '📋 Mode Description', value: modeInfo.description, inline: false },
                { name: '📅 Last Updated', value: modeInfo.lastUpdated ? `<t:${Math.floor(new Date(modeInfo.lastUpdated).getTime() / 1000)}:R>` : 'Unknown', inline: true },
                { name: '👤 Updated By', value: modeInfo.updatedBy || 'Unknown', inline: true },
                { name: '🔍 Source', value: modeInfo.source || 'JSON config', inline: true }
            );

        // Add mode requirements section
        let requirementsText = '';
        Object.entries(requirements).forEach(([mode, info]) => {
            const isCurrentMode = mode === currentMode;
            const status = info.canActivate ? '✅' : '❌';
            const currentIndicator = isCurrentMode ? ' *(current)*' : '';
            
            requirementsText += `${status} **${mode}**${currentIndicator}\n`;
            requirementsText += `${info.description}\n`;
            if (!info.canActivate && info.missingRequirements.length > 0) {
                requirementsText += `Missing: ${info.missingRequirements.join(', ')}\n`;
            }
            requirementsText += '\n';
        });

        embed.addFields({ name: '🔧 Mode Requirements', value: requirementsText || 'No requirements data available', inline: false });

        // Add API usage if available
        const stats = youtubeApiManager.getApiStats();
        if (stats.totalKeys > 0) {
            embed.addFields(
                { name: '🔑 API Keys', value: `${stats.totalKeys} configured`, inline: true },
                { name: '📊 Today\'s Usage', value: `${stats.todayUsage.toLocaleString()}`, inline: true },
                { name: '🎯 Available Quota', value: `${stats.availableQuota.toLocaleString()}`, inline: true }
            );
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleStats(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const stats = youtubeApiManager.getApiStats();
        
        if (stats.totalKeys === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle('📊 YouTube API Statistics')
                .setDescription('No API keys configured yet.')
                .addFields(
                    { name: '🚀 Get Started', value: 'Use `/youtube setup` to add your first API key', inline: false },
                    { name: '📖 Need Help?', value: 'Use `/youtube guide` for setup instructions', inline: false }
                );
            
            return interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📊 YouTube API Statistics')
            .addFields(
                { name: '🔑 Total API Keys', value: stats.totalKeys.toString(), inline: true },
                { name: '✅ Active Keys', value: stats.activeKeys.toString(), inline: true },
                { name: '❌ Failed Keys', value: stats.failedKeys.toString(), inline: true },
                { name: '📊 Today\'s Usage', value: stats.todayUsage.toLocaleString(), inline: true },
                { name: '🎯 Available Quota', value: stats.availableQuota.toLocaleString(), inline: true },
                { name: '⚡ Success Rate', value: `${stats.successRate.toFixed(1)}%`, inline: true }
            )
            .setFooter({ text: 'Statistics reset daily at midnight UTC' })
            .setTimestamp();

        // Add key details if user is admin
        if (interaction.member.permissions.has('Administrator')) {
            let keyDetails = '';
            stats.keyDetails.forEach(key => {
                const status = key.isActive ? '✅' : '❌';
                keyDetails += `${status} ${key.name}: ${key.usage.toLocaleString()}/${key.dailyLimit.toLocaleString()}\n`;
            });
            
            if (keyDetails) {
                embed.addFields({ name: '🔍 Key Details (Admin)', value: keyDetails, inline: false });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleGuide(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const modeManager = new YouTubeModeManager();
        const currentMode = modeManager.getCurrentMode();

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📖 YouTube API Setup Guide')
            .setDescription('Follow these steps to set up YouTube API integration:')
            .addFields(
                { 
                    name: '🎯 **Best Mode for Music: Default (Hybrid)**', 
                    value: '**Recommended**: Use "default" mode for music playback - it combines API reliability with streaming capability.\n\n⚠️ **Important**: API-only mode provides metadata only (no audio streaming). For music bots, hybrid mode is essential.', 
                    inline: false 
                },
                { 
                    name: '🔧 **Step 1: Create Google Cloud Project**', 
                    value: '• Go to [Google Cloud Console](https://console.cloud.google.com/)\n• Create a new project or select existing one\n• Enable billing (free tier available)', 
                    inline: false 
                },
                { 
                    name: '🔑 **Step 2: Enable YouTube Data API v3**', 
                    value: '• Go to "APIs & Services" > "Library"\n• Search for "YouTube Data API v3"\n• Click "Enable"', 
                    inline: false 
                },
                { 
                    name: '🎫 **Step 3: Create API Key**', 
                    value: '• Go to "APIs & Services" > "Credentials"\n• Click "Create Credentials" > "API Key"\n• Copy your API key', 
                    inline: false 
                },
                { 
                    name: '🔒 **Step 4: Secure Your Key (Optional)**', 
                    value: '• Click on your API key to edit\n• Add application restrictions\n• Restrict to YouTube Data API v3 only', 
                    inline: false 
                },
                { 
                    name: '⚙️ **Step 5: Add to Bot**', 
                    value: '• Use `/youtube setup apikey:YOUR_KEY`\n• Optionally add a name and daily limit\n• Switch to hybrid mode: `/youtubemode switch default`', 
                    inline: false 
                },
                { 
                    name: '📊 **Current Setup**', 
                    value: `Mode: **${currentMode}**\nUse \`/youtube status\` to check requirements`, 
                    inline: false 
                }
            )
            .setFooter({ text: 'Need help? Contact your server administrator' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Google Cloud Console')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://console.cloud.google.com/'),
                new ButtonBuilder()
                    .setLabel('YouTube API Docs')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://developers.google.com/youtube/v3/getting-started')
            );

        await interaction.editReply({ embeds: [embed], components: [row] });
    },

    async handleList(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const keys = youtubeApiManager.listApiKeys();
        
        if (keys.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle('🔑 API Keys List')
                .setDescription('No API keys configured yet.')
                .addFields(
                    { name: '🚀 Get Started', value: 'Use `/youtube setup` to add the first API key', inline: false }
                );
            
            return interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🔑 Configured API Keys')
            .setDescription(`Total: ${keys.length} key(s)`);

        keys.forEach((key, index) => {
            const status = key.isActive ? '✅ Active' : '❌ Failed';
            const dailyUsage = key.usage || 0;
            const usagePercent = ((dailyUsage / key.dailyLimit) * 100).toFixed(1);
            
            embed.addFields({
                name: `${index + 1}. ${key.name}`,
                value: `**ID:** \`${key.id}\`\n**Status:** ${status}\n**Usage:** ${dailyUsage.toLocaleString()}/${key.dailyLimit.toLocaleString()} (${usagePercent}%)\n**Owner:** <@${key.owner}>\n**Added:** <t:${Math.floor(new Date(key.createdAt).getTime() / 1000)}:R>`,
                inline: false
            });
        });

        embed.setFooter({ text: 'Use /youtube remove to delete a key' });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleRemove(interaction) {
        const keyId = interaction.options.getString('keyid');
        await interaction.deferReply({ ephemeral: true });

        try {
            const result = youtubeApiManager.removeApiKey(keyId);
            
            if (result.success) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ API Key Removed')
                    .setDescription(`Successfully removed API key: **${result.removedKey.name}**`)
                    .addFields(
                        { name: '🆔 Key ID', value: keyId, inline: true },
                        { name: '👤 Owner', value: `<@${result.removedKey.owner}>`, inline: true },
                        { name: '🔢 Remaining Keys', value: result.remainingKeys.toString(), inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Key Not Found')
                    .setDescription(`No API key found with ID: \`${keyId}\``)
                    .addFields(
                        { name: '💡 Tip', value: 'Use `/youtube list` to see all configured API keys', inline: false }
                    );

                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            await interaction.editReply('❌ Failed to remove API key. Please try again.');
        }
    }
};
