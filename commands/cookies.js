const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const cookieManager = require('../utils/cookieManager');
const Youtube = require('../Plugins/Youtube');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cookies')
        .setDescription('Manage YouTube cookies for bot detection bypass')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current cookie mode and status'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('mode')
                .setDescription('View or change cookie mode')
                .addStringOption(option =>
                    option
                        .setName('set')
                        .setDescription('Set cookie mode')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Auto Cookie (Safe) - Recommended', value: 'auto-cookie' },
                            { name: 'Cookie Only - User cookies only', value: 'cookie-only' },
                            { name: 'Cookies (Legacy) - Same as Auto', value: 'cookies' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('refresh')
                .setDescription('Force refresh auto-generated cookies'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all cookies and reset to defaults'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update user-provided cookies from browser')
                .addStringOption(option =>
                    option
                        .setName('cookies')
                        .setDescription('Cookie string from browser (name1=value1; name2=value2; ...)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Test current cookies with a YouTube video')
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
                content: '❌ You need Administrator permissions to manage cookies.',
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
                case 'mode':
                    await this.handleMode(interaction);
                    break;
                case 'refresh':
                    await this.handleRefresh(interaction);
                    break;
                case 'clear':
                    await this.handleClear(interaction);
                    break;
                case 'update':
                    await this.handleUpdate(interaction);
                    break;
                case 'test':
                    await this.handleTest(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error in cookies command:', error);
            await interaction.editReply('❌ An error occurred while managing cookies.');
        }
    },

    async handleStatus(interaction) {
        const stats = cookieManager.getStats();
        const modeInfo = cookieManager.getModeInfo();
        const youtube = new Youtube();
        
        const embed = new EmbedBuilder()
            .setColor(modeInfo.canUseCookies ? '#00ff00' : '#ff0000')
            .setTitle('🍪 Cookie Manager Status')
            .addFields(
                { name: '� Current Mode', value: `**${modeInfo.mode}**\n${modeInfo.description}`, inline: false },
                { name: '✅ Cookies Available', value: modeInfo.canUseCookies ? '✅ Yes' : '❌ No', inline: true },
                { name: '�📊 Cookie Count', value: `${stats.cookieCount}`, inline: true },
                { name: '🔄 Last Refresh', value: `<t:${Math.floor(new Date(stats.lastRefresh).getTime() / 1000)}:R>`, inline: true }
            )
            .setTimestamp();

        if (modeInfo.mode === 'cookie-only') {
            if (modeInfo.canUseCookies) {
                embed.addFields({ name: '👤 User Cookies', value: '✅ Loaded', inline: true });
            } else {
                embed.addFields({ 
                    name: '⚠️ Warning', 
                    value: 'No user cookies found!\nUse `/cookies update` to provide cookies.', 
                    inline: false 
                });
            }
        } else {
            embed.addFields(
                { name: '⏰ Next Refresh', value: `<t:${Math.floor(new Date(stats.nextRefresh).getTime() / 1000)}:R>`, inline: true },
                { name: '📁 Auto Cookie File', value: stats.fileExists ? '✅ Exists' : '❌ Not Found', inline: true }
            );
        }

        embed.setFooter({ 
            text: modeInfo.mode === 'cookie-only' 
                ? 'Cookie-only mode uses your provided cookies' 
                : 'Auto cookies are rotated every 30 minutes' 
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleMode(interaction) {
        const newMode = interaction.options.getString('set');
        const fs = require('fs');
        const path = require('path');
        
        if (!newMode) {
            // Just show current mode
            const modeInfo = cookieManager.getModeInfo();
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🔧 Cookie Mode Information')
                .addFields(
                    { name: 'Current Mode', value: `**${modeInfo.mode}**`, inline: true },
                    { name: 'Description', value: modeInfo.description, inline: false },
                    { name: 'Status', value: modeInfo.canUseCookies ? '✅ Ready' : '❌ Needs Setup', inline: true }
                )
                .setFooter({ text: 'Use /cookies mode set:<mode> to change modes' });

            return interaction.editReply({ embeds: [embed] });
        }

        // Change mode by updating .env file
        try {
            const envPath = path.join(__dirname, '../.env');
            let envContent = fs.readFileSync(envPath, 'utf8');
            
            // Update the YOUTUBE_COOKIE_MODE line
            envContent = envContent.replace(
                /YOUTUBE_COOKIE_MODE=.*/,
                `YOUTUBE_COOKIE_MODE=${newMode}`
            );
            
            fs.writeFileSync(envPath, envContent);
            
            // Reload the environment
            delete require.cache[require.resolve('dotenv')];
            require('dotenv').config();
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Cookie Mode Updated')
                .addFields(
                    { name: 'New Mode', value: `**${newMode}**`, inline: true },
                    { name: 'Status', value: '⚠️ Restart bot to fully apply changes', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error updating cookie mode:', error);
            await interaction.editReply('❌ Failed to update cookie mode. Check file permissions.');
        }
    },

    async handleRefresh(interaction) {
        const youtube = new Youtube();
        const ytdl = require('@distube/ytdl-core');
        
        try {
            const newCookies = await cookieManager.refreshIfNeeded(ytdl);
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🔄 Cookies Refreshed')
                .setDescription('Successfully refreshed YouTube cookies')
                .addFields(
                    { name: '🍪 New Cookie Count', value: `${newCookies.length}`, inline: true },
                    { name: '⏰ Refresh Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            await interaction.editReply('❌ Failed to refresh cookies. Using default cookies instead.');
        }
    },

    async handleClear(interaction) {
        cookieManager.clearCookies();
        
        const embed = new EmbedBuilder()
            .setColor('#ff6b35')
            .setTitle('🗑️ Cookies Cleared')
            .setDescription('All cookies have been cleared and reset to defaults')
            .addFields(
                { name: '📊 Status', value: 'Reset to default cookie set', inline: true },
                { name: '⏰ Clear Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleUpdate(interaction) {
        const cookieString = interaction.options.getString('cookies');
        const modeInfo = cookieManager.getModeInfo();
        
        if (!cookieString || !cookieString.includes('=')) {
            return interaction.editReply('❌ Invalid cookie format. Please provide cookies in format: `name1=value1; name2=value2; ...`');
        }

        // Parse cookies and save as user cookies
        const success = cookieManager.updateCookiesFromBrowser(cookieString);
        
        if (success) {
            // If we're not in cookie-only mode, suggest switching
            let modeWarning = '';
            if (modeInfo.mode !== 'cookie-only') {
                modeWarning = '\n\n⚠️ **Tip:** Switch to `cookie-only` mode to use only your custom cookies.\nUse `/cookies mode set:cookie-only`';
            }
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ User Cookies Updated')
                .setDescription(`Successfully updated user-provided cookies${modeWarning}`)
                .addFields(
                    { name: '📊 Status', value: 'Cookies parsed and saved as user cookies', inline: true },
                    { name: '🔧 Current Mode', value: modeInfo.mode, inline: true },
                    { name: '⏰ Update Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Use /cookies test to verify the new cookies work' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply('❌ Failed to parse cookie string. Please check the format and try again.');
        }
    },

    async handleTest(interaction) {
        const testUrl = interaction.options.getString('url') || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        const youtube = new Youtube();
        
        try {
            const info = await youtube.getYoutubeInfo(testUrl);
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Cookie Test Successful')
                .setDescription(`Successfully retrieved video information using current cookies`)
                .addFields(
                    { name: '🎵 Test Video', value: info.title, inline: false },
                    { name: '👤 Channel', value: info.author, inline: true },
                    { name: '🔗 URL', value: testUrl, inline: false }
                )
                .setThumbnail(info.thumbnail)
                .setFooter({ text: 'Cookies are working properly' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Cookie Test Failed')
                .setDescription('Current cookies are not working properly')
                .addFields(
                    { name: '🚫 Error', value: error.message, inline: false },
                    { name: '💡 Suggestion', value: 'Try refreshing cookies with `/cookies refresh`', inline: false }
                )
                .setFooter({ text: 'You may need to update cookies manually' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }
};
