const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const YouTubeModeManager = require('../utils/youtubeModeManager');

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
                            { name: 'API Mode (API only)', value: 'api' },
                            { name: 'Legacy Mode (No cookies)', value: 'legacy' },
                            { name: 'Auto Cookie (Safe)', value: 'auto-cookie' },
                            { name: 'Custom Cookie (User)', value: 'custom-cookie' },
                            { name: 'Proxy Mode (SOCKS5)', value: 'proxy' }
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
        const modeManager = new YouTubeModeManager();

        try {
            switch (subcommand) {
                case 'status':
                    await this.handleStatus(interaction, modeManager);
                    break;
                case 'switch':
                    await this.handleSwitch(interaction, modeManager);
                    break;
                case 'test':
                    await this.handleTest(interaction, modeManager);
                    break;
            }
        } catch (error) {
            console.error('Error in youtubemode command:', error);
            await interaction.editReply('❌ An error occurred while managing YouTube modes.');
        }
    },

    async handleStatus(interaction, modeManager) {
        const modeInfo = modeManager.getModeInfo();
        const availableModes = modeManager.getAvailableModes();
        const requirements = modeManager.getModeRequirements();
        
        console.log('🔍 YouTube Mode Status:');
        console.log(`- Current Mode: ${modeInfo.mode}`);
        console.log(`- Source: ${modeInfo.source}`);
        
        // Determine color based on mode
        let modeColor = '#00aa00';
        switch (modeInfo.mode) {
            case 'api': modeColor = '#0099ff'; break;
            case 'legacy': modeColor = '#ffa500'; break;
            case 'auto-cookie': modeColor = '#ff6b35'; break;
            case 'custom-cookie': modeColor = '#ff3333'; break;
            default: modeColor = '#00aa00'; break;
        }

        const embed = new EmbedBuilder()
            .setColor(modeColor)
            .setTitle('🎛️ YouTube Mode Status')
            .setDescription(`**Current Mode:** ${modeInfo.mode}\n${modeInfo.description}`)
            .addFields(
                {
                    name: '⚙️ Configuration',
                    value: `**Mode:** \`${modeInfo.mode}\`\n` +
                           `**Source:** ${modeInfo.source}\n` +
                           `**Last Updated:** <t:${Math.floor(new Date(modeInfo.lastUpdated).getTime() / 1000)}:R>\n` +
                           `**Updated By:** ${modeInfo.updatedBy}`,
                    inline: true
                },
                {
                    name: '🔧 Capabilities',
                    value: `**Can Use Cookies:** ${modeInfo.canUseCookies ? '✅ Yes' : '❌ No'}\n` +
                           `**Requires User Cookies:** ${modeInfo.requiresUserCookies ? '✅ Yes' : '❌ No'}\n` +
                           `**Requires API:** ${modeInfo.requiresAPI ? '✅ Yes' : '❌ No'}`,
                    inline: true
                },
                {
                    name: '� Requirements Status',
                    value: `**API Keys Available:** ${hasWorkingApiKeys ? '✅ Yes' : '❌ No'}\n` +
                           `**Auto Cookies Available:** ${hasValidCookies ? '✅ Yes' : '❌ No'}\n` +
                           `**User Cookies Available:** ${hasUserCookies ? '✅ Yes' : '❌ No'}`,
                    inline: true
                },
                {
                    name: '�🔄 Available Modes',
                    value: Object.entries(availableModes)
                        .map(([key, desc]) => {
                            let status = '';
                            if (key === 'api' && !hasWorkingApiKeys) {
                                status = ' ⚠️ (Requires API keys)';
                            } else if (key === 'custom-cookie' && !hasUserCookies) {
                                status = ' ⚠️ (Requires user cookies)';
                            } else if (key === modeInfo.mode) {
                                status = ' ✅ (Current)';
                            }
                            return `• **${key}** - ${desc}${status}`;
                        })
                        .join('\n'),
                    inline: false
                }
            )
            .setFooter({ text: 'Use /youtubemode switch <mode> to change modes' });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleSwitch(interaction, modeManager) {
        const newMode = interaction.options.getString('mode');
        const oldModeInfo = modeManager.getModeInfo();
        
        try {
            // Use the new validation system
            const validation = modeManager.validateModeRequirements(newMode);
            
            if (!validation.canActivate) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Cannot Switch to This Mode')
                    .setDescription(`**Target Mode:** ${newMode}`)
                    .addFields(
                        { name: '� Missing Requirements', value: validation.missingRequirements.join('\n'), inline: false }
                    );

                // Add specific guidance based on the mode
                if (newMode === 'api') {
                    embed.addFields(
                        { name: '💡 How to Fix', value: 'Use `/youtube setup` to add your YouTube API key', inline: false },
                        { name: '📖 Need Help?', value: 'Use `/youtube guide` for detailed setup instructions', inline: false }
                    );
                } else if (newMode === 'custom-cookie') {
                    embed.addFields(
                        { name: '💡 How to Fix', value: 'Use `/cookies` command to add your custom cookies', inline: false },
                        { name: '⚠️ Warning', value: 'Custom cookies may violate YouTube ToS and risk account restrictions', inline: false }
                    );
                }

                embed.setFooter({ text: 'Mode switch cancelled' });
                return await interaction.editReply({ embeds: [embed] });
            }

            // Show warnings if any
            if (validation.warnings && validation.warnings.length > 0) {
                console.log('⚠️ Mode switch warnings:', validation.warnings.join(', '));
            }
            
            // Switch to the new mode
            const success = modeManager.setMode(newMode, `${interaction.user.username}#${interaction.user.discriminator}`);
            
            if (success) {
                // Sync environment variables
                modeManager.syncToEnvironment();
                
                console.log(`🔄 YouTube mode switched: ${oldModeInfo.mode} → ${newMode}`);
                
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ YouTube Mode Updated')
                    .addFields(
                        { name: '📤 Previous Mode', value: `\`${oldModeInfo.mode}\``, inline: true },
                        { name: '📥 New Mode', value: `\`${newMode}\``, inline: true },
                        { name: '👤 Updated By', value: `${interaction.user.username}`, inline: true }
                    )
                    .setDescription(`Successfully switched to **${newMode}** mode`)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                
                // Test the new mode
                setTimeout(async () => {
                    try {
                        await this.handleTest(interaction, modeManager, true);
                    } catch (error) {
                        console.error('Failed to auto-test new mode:', error);
                    }
                }, 1000);
                
            } else {
                throw new Error('Failed to save mode configuration');
            }
            
        } catch (error) {
            console.error('Failed to switch YouTube mode:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Mode Switch Failed')
                .setDescription(`Failed to switch to **${newMode}** mode: ${error.message}`)
                .addFields({ name: '💡 Available Modes', value: Object.keys(modeManager.getAvailableModes()).join(', '), inline: false });

            await interaction.editReply({ embeds: [embed] });
        }
    },

    async handleTest(interaction, modeManager, isAutoTest = false) {
        const testUrl = interaction.options?.getString('url') || 'https://music.youtube.com/watch?v=AGgfFGrN88s';
        const modeInfo = modeManager.getModeInfo();
        
        console.log(`🧪 Testing YouTube mode (${modeInfo.mode}) with: ${testUrl}`);
        
        try {
            const Youtube = require('../Plugins/Youtube');
            const youtube = new Youtube();
            const startTime = Date.now();
            
            // Test the current mode
            const testResult = await youtube.getYoutubeInfo(testUrl);
            const testDuration = Date.now() - startTime;
            
            if (!isAutoTest) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('🧪 YouTube Mode Test')
                    .addFields(
                        { name: '🎵 Test URL', value: testUrl, inline: false },
                        { name: '⚙️ Current Mode', value: `\`${modeInfo.mode}\``, inline: true },
                        { name: '⏱️ Test Duration', value: `${testDuration}ms`, inline: true },
                        { name: '✅ Result', value: 'Test completed successfully', inline: false }
                    )
                    .setDescription(`Successfully tested **${modeInfo.mode}** mode`)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }
            
        } catch (error) {
            console.error('YouTube mode test failed:', error);
            
            if (!isAutoTest) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ YouTube Mode Test Failed')
                    .addFields(
                        { name: '🎵 Test URL', value: testUrl, inline: false },
                        { name: '⚙️ Current Mode', value: `\`${modeInfo.mode}\``, inline: true },
                        { name: '❌ Error', value: error.message || 'Unknown error', inline: false }
                    )
                    .setDescription(`Test failed for **${modeInfo.mode}** mode`)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }
        }
    }
};
