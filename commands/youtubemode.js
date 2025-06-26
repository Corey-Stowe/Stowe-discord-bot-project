const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cookieManager = require('../utils/cookieManager');
const youtubeApiManager = require('../utils/youtubeApiManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('youtubemode')
        .setDescription('Manage YouTube fetching mode (admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current YouTube mode and configuration'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('switch')
                .setDescription('Switch YouTube fetching mode')
                .addStringOption(option =>
                    option
                        .setName('mode')
                        .setDescription('YouTube fetching mode to use')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Default (Auto fallback)', value: 'default' },
                            { name: 'API Mode (Recommended)', value: 'api_only' },
                            { name: 'Legacy Mode (v2.4 compatible)', value: 'legacy_only' },
                            { name: 'Auto Cookie (Safe)', value: 'auto_cookie' },
                            { name: 'Custom Cookie (Risk)', value: 'custom_cookie' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Test current YouTube mode with a video')
                .addStringOption(option =>
                    option
                        .setName('url')
                        .setDescription('YouTube URL to test (optional)')
                        .setRequired(false))),

    // Add admin-only flag
    adminOnly: true,

    async execute(interaction) {
        // Check if user has admin permissions
        if (interaction.user.id !== process.env.ADMIN_ID) {
            return interaction.reply({
                content: '❌ You need Administrator permissions to manage YouTube modes.',
                ephemeral: true
            });
        }

        await interaction.deferReply();
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'status':
                    await this.handleStatus(interaction);
                    break;
                case 'switch':
                    await this.handleSwitch(interaction);
                    break;
                case 'test':
                    await this.handleTest(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error in youtubemode command:', error);
            await interaction.editReply('❌ An error occurred while managing YouTube modes.');
        }
    },

    async handleStatus(interaction) {
        // Get current configuration
        const currentConfig = this.getCurrentConfig();
        const apiStats = youtubeApiManager.getApiKeyStats();
        const cookieStats = cookieManager.getStats();
        const hasValidCookies = await cookieManager.hasValidCookies();
        const isApiEnabled = youtubeApiManager.isApiEnabled();
        const hasWorkingApiKeys = youtubeApiManager.hasWorkingApiKeys();
        
        console.log('🔍 Debug Mode Detection:');
        console.log('- API Enabled:', isApiEnabled);
        console.log('- Has Working API Keys:', hasWorkingApiKeys);
        console.log('- Prefer API:', currentConfig.preferApi);
        console.log('- Cookie Only:', currentConfig.cookieOnly);
        console.log('- Auto Cookie:', currentConfig.autoCookie);
        console.log('- Default Mode:', currentConfig.defaultMode);
        console.log('- Has Valid Cookies:', hasValidCookies);
        console.log('- Total API Keys:', apiStats.totalKeys);
        
        // Determine current mode
        let currentMode = 'Unknown';
        let modeDescription = 'Unable to determine current mode';
        let modeColor = '#ff0000';
        
        // Check for explicit modes first
        if (currentConfig.defaultMode) {
            currentMode = 'Default Mode';
            modeDescription = 'Auto Cookie → Legacy → API → Custom Cookie fallback chain';
            modeColor = '#00aa00';
        } else if (currentConfig.autoCookie && !currentConfig.cookieOnly && !isApiEnabled) {
            currentMode = 'Auto Cookie';
            modeDescription = 'Automatically generates and rotates safe cookies';
            modeColor = '#ff6b35';
        } else if (currentConfig.cookieOnly && !currentConfig.autoCookie) {
            currentMode = 'Custom Cookie';
            modeDescription = 'Uses custom/manual cookies (risky)';
            modeColor = '#ff3333';
        } else if (!isApiEnabled && !currentConfig.preferApi && !currentConfig.cookieOnly && !currentConfig.autoCookie) {
            currentMode = 'Legacy Mode';
            modeDescription = 'Using default method only (v2.4 compatibility)';
            modeColor = '#ffa500';
        } else if (isApiEnabled && currentConfig.preferApi && !currentConfig.cookieOnly && !currentConfig.autoCookie) {
            currentMode = 'API Mode';
            modeDescription = 'YouTube API method only (recommended for production)';
            modeColor = '#0099ff';
        }

        const embed = new EmbedBuilder()
            .setColor(modeColor)
            .setTitle('🎛️ YouTube Mode Status')
            .setDescription(`**Current Mode:** ${currentMode}\n${modeDescription}`)
            .addFields(
                {
                    name: '⚙️ Configuration',
                    value: `**API Enabled:** ${currentConfig.apiEnabled ? '✅ Yes' : '❌ No'}\n` +
                           `**Prefer API:** ${currentConfig.preferApi ? '✅ Yes' : '❌ No'}\n` +
                           `**Config File:** ${currentConfig.hasConfigFile ? '✅ Found' : '❌ Missing'}`,
                    inline: true
                },
                {
                    name: '🔑 API Status',
                    value: `**Total Keys:** ${apiStats.totalKeys}\n` +
                           `**Active Keys:** ${apiStats.activeKeys}\n` +
                           `**Quota Used:** ${apiStats.totalQuotaUsed.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🍪 Cookie Status',
                    value: `**Cookie Count:** ${cookieStats.cookieCount}\n` +
                           `**Valid Cookies:** ${hasValidCookies ? '✅ Yes' : '❌ No'}\n` +
                           `**Last Refresh:** <t:${Math.floor(new Date(cookieStats.lastRefresh).getTime() / 1000)}:R>`,
                    inline: true
                }
            )
            .addFields({
                name: '🔄 Available Modes',
                value: '• **Default Mode** - Auto Cookie → Legacy → API → Custom Cookie fallback\n' +
                       '• **API Mode** - YouTube API only (recommended for production)\n' +
                       '• **Legacy Mode** - Default method only (v2.4 compatibility)\n' +
                       '• **Auto Cookie** - Automatically generates and rotates safe cookies\n' +
                       '• **Custom Cookie** - Uses custom/manual cookies (risky)',
                inline: false
            })
            .setFooter({ text: 'Use /youtubemode switch to change mode' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleSwitch(interaction) {
        const newMode = interaction.options.getString('mode');
        
        // Get current configuration
        const currentConfig = this.getCurrentConfig();
        
        // Determine new settings based on mode
        let newApiEnabled, newPreferApi, newCookieOnly, newAutoCookie, newDefaultMode, modeDisplayName, modeDescription;
        
        switch (newMode) {
            case 'default':
                newApiEnabled = true;
                newPreferApi = false;
                newCookieOnly = false;
                newAutoCookie = true;
                newDefaultMode = true;
                modeDisplayName = 'Default Mode';
                modeDescription = 'Auto Cookie → Legacy → API → Custom Cookie fallback chain';
                break;
            case 'api_only':
                newApiEnabled = true;
                newPreferApi = true;
                newCookieOnly = false;
                newAutoCookie = false;
                newDefaultMode = false;
                modeDisplayName = 'API Mode';
                modeDescription = 'YouTube API method only (recommended for production)';
                break;
            case 'legacy_only':
                newApiEnabled = false;
                newPreferApi = false;
                newCookieOnly = false;
                newAutoCookie = false;
                newDefaultMode = false;
                modeDisplayName = 'Legacy Mode';
                modeDescription = 'Default method only (v2.4 compatibility)';
                // Clear cookies to ensure true legacy mode
                console.log('🗑️ Clearing cookies for legacy mode');
                break;
            case 'auto_cookie':
                newApiEnabled = false;
                newPreferApi = false;
                newCookieOnly = false;
                newAutoCookie = true;
                newDefaultMode = false;
                modeDisplayName = 'Auto Cookie';
                modeDescription = 'Automatically generates and rotates safe cookies';
                break;
            case 'custom_cookie':
                newApiEnabled = false;
                newPreferApi = false;
                newCookieOnly = true;
                newAutoCookie = false;
                newDefaultMode = false;
                modeDisplayName = 'Custom Cookie';
                modeDescription = 'Uses custom/manual cookies (risky)';
                break;
            default:
                return interaction.editReply('❌ Invalid mode specified.');
        }
        
        try {
            // Special handling for legacy mode - clear cookies
            if (newMode === 'legacy_only') {
                try {
                    const cookieManager = require('../utils/cookieManager');
                    await cookieManager.clearCookies();
                    console.log('✅ Cleared cookies for legacy mode');
                } catch (error) {
                    console.warn('Failed to clear cookies:', error.message);
                }
            }
            
            // Update configuration
            await this.updateConfig(newApiEnabled, newPreferApi, newCookieOnly, newAutoCookie, newDefaultMode);
            
            // Force refresh the API manager's enabled status
            youtubeApiManager.refreshEnabledStatus();
            
            // Verify the update worked
            const verifyConfig = this.getCurrentConfig();
            console.log('✅ Verification - API Enabled:', verifyConfig.apiEnabled);
            console.log('✅ Verification - Prefer API:', verifyConfig.preferApi);
            console.log('✅ Verification - API Manager Enabled:', youtubeApiManager.isApiEnabled());
            
            // Restart may be required for some changes
            const requiresRestart = (currentConfig.apiEnabled !== newApiEnabled);
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ YouTube Mode Changed')
                .setDescription(`Successfully switched to **${modeDisplayName}**`)
                .addFields(
                    {
                        name: '📋 New Configuration',
                        value: `**Mode:** ${modeDisplayName}\n` +
                               `**Description:** ${modeDescription}\n` +
                               `**API Enabled:** ${newApiEnabled ? '✅ Yes' : '❌ No'}\n` +
                               `**Prefer API:** ${newPreferApi ? '✅ Yes' : '❌ No'}`,
                        inline: false
                    },
                    {
                        name: requiresRestart ? '⚠️ Restart Required' : '✅ Active Immediately',
                        value: requiresRestart 
                            ? 'Bot restart required for API enable/disable changes'
                            : 'Mode preference changes are active immediately',
                        inline: false
                    }
                )
                .setFooter({ text: 'Use /youtubemode test to verify the new mode' })
                .setTimestamp();

            if (newMode === 'custom_cookie') {
                embed.addFields({
                    name: '⚠️ Risk Warning',
                    value: 'Custom cookie mode may violate YouTube ToS and risk account restrictions',
                    inline: false
                });
            } else if (newMode === 'auto_cookie') {
                embed.addFields({
                    name: 'ℹ️ Auto Cookie Info',
                    value: 'Auto cookie mode generates and rotates cookies automatically for safer YouTube access',
                    inline: false
                });
            } else if (newMode === 'default') {
                embed.addFields({
                    name: 'ℹ️ Default Mode Info',
                    value: 'Default mode provides intelligent fallback: Auto Cookie → Legacy → API → Custom Cookie',
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error updating YouTube mode configuration:', error);
            await interaction.editReply('❌ Failed to update YouTube mode configuration.');
        }
    },

    async handleTest(interaction) {
        const testUrl = interaction.options.getString('url') || 'https://music.youtube.com/watch?v=AGgfFGrN88s';
        
        try {
            const Youtube = require('../Plugins/Youtube');
            const youtube = new Youtube();
            
            console.log(`🧪 Testing YouTube mode with: ${testUrl}`);
            const startTime = Date.now();
            
            const info = await youtube.getYoutubeInfo(testUrl);
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ YouTube Mode Test Successful')
                .setDescription(`Successfully retrieved video information`)
                .addFields(
                    { name: '🎵 Video Title', value: info.title, inline: false },
                    { name: '👤 Channel', value: info.author, inline: true },
                    { name: '🔧 Method Used', value: info.methodUsed || 'unknown', inline: true },
                    { name: '⏱️ Duration', value: `${duration}ms`, inline: true },
                    { name: '📊 Formats Available', value: `${info.streamingData?.formats?.length || 0}`, inline: true },
                    { name: '🔗 Test URL', value: `[Link](${testUrl})`, inline: true }
                )
                .setThumbnail(info.thumbnail)
                .setFooter({ text: 'Mode is working correctly' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('YouTube mode test failed:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ YouTube Mode Test Failed')
                .setDescription('Current mode is not working properly')
                .addFields(
                    { name: '🚫 Error', value: error.message, inline: false },
                    { name: '💡 Suggestions', value: 
                        '• Try switching to a different mode\n' +
                        '• Check API keys with `/youtube list`\n' +
                        '• Test cookies with `/cookies test`\n' +
                        '• View current configuration with `/youtubemode status`', 
                        inline: false 
                    },
                    { name: '🔗 Test URL', value: testUrl, inline: false }
                )
                .setFooter({ text: 'Use /youtubemode switch to try a different mode' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },

    getCurrentConfig() {
        const configPath = path.join(__dirname, '../.env');
        const hasConfigFile = fs.existsSync(configPath);
        
        return {
            apiEnabled: process.env.YOUTUBE_API_ENABLED === 'true',
            preferApi: process.env.YOUTUBE_PREFER_API === 'true',
            cookieOnly: process.env.YOUTUBE_COOKIE_ONLY === 'true',
            autoCookie: process.env.YOUTUBE_AUTO_COOKIE === 'true',
            defaultMode: process.env.YOUTUBE_DEFAULT_MODE === 'true',
            hasConfigFile
        };
    },

    async updateConfig(apiEnabled, preferApi, cookieOnly, autoCookie = false, defaultMode = false) {
        const configPath = path.join(__dirname, '../.env');
        
        if (!fs.existsSync(configPath)) {
            // Create new .env file if it doesn't exist
            let cookieMode = 'auto-cookie';
            if (defaultMode) {
                cookieMode = 'auto-cookie';
            } else if (autoCookie) {
                cookieMode = 'auto-cookie';
            } else if (cookieOnly) {
                cookieMode = 'cookie-only';
            }
            
            const newContent = `# YouTube Configuration
YOUTUBE_API_ENABLED=${apiEnabled}
YOUTUBE_PREFER_API=${preferApi}
YOUTUBE_COOKIE_ONLY=${cookieOnly}
YOUTUBE_AUTO_COOKIE=${autoCookie}
YOUTUBE_DEFAULT_MODE=${defaultMode}
YOUTUBE_COOKIE_MODE=${cookieMode}
`;
            fs.writeFileSync(configPath, newContent);
        } else {
            // Update existing .env file
            let content = fs.readFileSync(configPath, 'utf8');
            
            // Update or add YOUTUBE_API_ENABLED
            if (content.includes('YOUTUBE_API_ENABLED=')) {
                content = content.replace(/YOUTUBE_API_ENABLED=.*/g, `YOUTUBE_API_ENABLED=${apiEnabled}`);
            } else {
                content += `\nYOUTUBE_API_ENABLED=${apiEnabled}`;
            }
            
            // Update or add YOUTUBE_PREFER_API
            if (content.includes('YOUTUBE_PREFER_API=')) {
                content = content.replace(/YOUTUBE_PREFER_API=.*/g, `YOUTUBE_PREFER_API=${preferApi}`);
            } else {
                content += `\nYOUTUBE_PREFER_API=${preferApi}`;
            }
            
            // Update or add YOUTUBE_COOKIE_ONLY
            if (content.includes('YOUTUBE_COOKIE_ONLY=')) {
                content = content.replace(/YOUTUBE_COOKIE_ONLY=.*/g, `YOUTUBE_COOKIE_ONLY=${cookieOnly}`);
            } else {
                content += `\nYOUTUBE_COOKIE_ONLY=${cookieOnly}`;
            }
            
            // Update or add YOUTUBE_AUTO_COOKIE
            if (content.includes('YOUTUBE_AUTO_COOKIE=')) {
                content = content.replace(/YOUTUBE_AUTO_COOKIE=.*/g, `YOUTUBE_AUTO_COOKIE=${autoCookie}`);
            } else {
                content += `\nYOUTUBE_AUTO_COOKIE=${autoCookie}`;
            }
            
            // Update or add YOUTUBE_DEFAULT_MODE
            if (content.includes('YOUTUBE_DEFAULT_MODE=')) {
                content = content.replace(/YOUTUBE_DEFAULT_MODE=.*/g, `YOUTUBE_DEFAULT_MODE=${defaultMode}`);
            } else {
                content += `\nYOUTUBE_DEFAULT_MODE=${defaultMode}`;
            }
            
            // Update YOUTUBE_COOKIE_MODE for backward compatibility
            let cookieMode = 'auto-cookie';
            if (defaultMode) {
                cookieMode = 'auto-cookie'; // Default mode uses auto-cookie primarily
            } else if (autoCookie) {
                cookieMode = 'auto-cookie';
            } else if (cookieOnly) {
                cookieMode = 'cookie-only';
            }
            
            if (content.includes('YOUTUBE_COOKIE_MODE=')) {
                content = content.replace(/YOUTUBE_COOKIE_MODE=.*/g, `YOUTUBE_COOKIE_MODE=${cookieMode}`);
            } else {
                content += `\nYOUTUBE_COOKIE_MODE=${cookieMode}`;
            }
            
            fs.writeFileSync(configPath, content);
        }
        
        // Update environment variables in memory for immediate preference changes
        process.env.YOUTUBE_API_ENABLED = apiEnabled.toString();
        process.env.YOUTUBE_PREFER_API = preferApi.toString();
        process.env.YOUTUBE_COOKIE_ONLY = cookieOnly.toString();
        process.env.YOUTUBE_AUTO_COOKIE = autoCookie.toString();
        process.env.YOUTUBE_DEFAULT_MODE = defaultMode.toString();
        
        // Update YOUTUBE_COOKIE_MODE for backward compatibility
        let cookieMode = 'auto-cookie';
        if (defaultMode) {
            cookieMode = 'auto-cookie';
        } else if (autoCookie) {
            cookieMode = 'auto-cookie';
        } else if (cookieOnly) {
            cookieMode = 'cookie-only';
        }
        process.env.YOUTUBE_COOKIE_MODE = cookieMode;
        
        // Update the YouTube plugin's preference if possible
        try {
            const Youtube = require('../Plugins/Youtube');
            const youtube = new Youtube();
            if (typeof youtube.setPreferApiMethod === 'function') {
                youtube.setPreferApiMethod(preferApi);
            }
        } catch (error) {
            console.log('Could not update YouTube plugin preference:', error.message);
        }
    }
};
