const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const i18n = require('../utils/i18n.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('Manage bot language settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set bot language')
                .addStringOption(option =>
                    option.setName('lang')
                        .setDescription('Language code')
                        .setRequired(true)
                        .addChoices(
                            { name: '🇺🇸 English', value: 'en' },
                            { name: '🇻🇳 Tiếng Việt', value: 'vi' },
                            { name: '🇯🇵 日本語', value: 'ja' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('current')
                .setDescription('Show current language'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List available languages'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('scan')
                .setDescription('Scan for new commands and generate translations (Admin only)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show translation statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('personal')
                .setDescription('Manage your personal language setting')
                .addStringOption(option =>
                    option.setName('lang')
                        .setDescription('Your preferred language (leave empty to check current)')
                        .setRequired(false)
                        .addChoices(
                            { name: '🌐 Use Bot Default', value: 'default' },
                            { name: '🇺🇸 English', value: 'en' },
                            { name: '🇻🇳 Tiếng Việt', value: 'vi' },
                            { name: '🇯🇵 日本語', value: 'ja' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show detailed translation status and statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Manage i18n configuration (Admin only)')
                .addStringOption(option =>
                    option.setName('setting')
                        .setDescription('Configuration setting to modify')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Auto Scan On/Off', value: 'autoscan' },
                            { name: 'Scan Interval', value: 'interval' },
                            { name: 'Reset Status', value: 'reset' }
                        ))
                .addStringOption(option =>
                    option.setName('value')
                        .setDescription('New value for the setting')
                        .setRequired(false))),

    async execute(interaction) {
        // Check if user is admin for admin commands
        const subcommand = interaction.options.getSubcommand();
        const adminCommands = ['set', 'scan', 'config', 'export'];
        
        if (adminCommands.includes(subcommand) && interaction.user.id !== process.env.ADMIN_ID) {
            return interaction.reply({ 
                content: await i18n.tUser('common.permission_denied', interaction.user.id), 
                flags: [4096] // Use flags instead of ephemeral: true
            });
        }

        switch (subcommand) {
            case 'set':
                await this.handleSet(interaction);
                break;
            case 'current':
                await this.handleCurrent(interaction);
                break;
            case 'list':
                await this.handleList(interaction);
                break;
            case 'scan':
                await this.handleScan(interaction);
                break;
            case 'stats':
                await this.handleStats(interaction);
                break;
            case 'personal':
                await this.handlePersonal(interaction);
                break;
            case 'status':
                await this.handleStatus(interaction);
                break;
            case 'config':
                await this.handleConfig(interaction);
                break;
            case 'export':
                await this.handleExport(interaction);
                break;
        }
    },

    async handleSet(interaction) {
        const langCode = interaction.options.getString('lang');
        
        if (i18n.setLanguage(langCode)) {
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🌐 Bot Language Changed (Global)')
                .setDescription(`**Bot's global language** set to: **${this.getLanguageName(langCode)}**`)
                .addFields(
                    { name: 'Language Code', value: langCode, inline: true },
                    { name: 'Scope', value: '🌍 Global (All Users)', inline: true },
                    { name: 'Status', value: '✅ Active', inline: true },
                    { name: '💡 Note', value: 'This changes the bot\'s default language for everyone.\nUse `/language personal` to set your personal language.', inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Language Error')
                .setDescription(`Language '${langCode}' is not available.`)
                .addFields(
                    { name: '💡 Available Languages', value: 'Use `/language list` to see available languages', inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },

    async handleCurrent(interaction) {
        const currentLang = i18n.getCurrentLanguage();
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🌐 Current Language')
            .setDescription(`Current language: **${this.getLanguageName(currentLang)}**`)
            .addFields(
                { name: 'Language Code', value: currentLang, inline: true },
                { name: 'Status', value: '✅ Active', inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleList(interaction) {
        const availableLanguages = i18n.getAvailableLanguages();
        const currentLang = i18n.getCurrentLanguage();
        
        const languageList = availableLanguages.map(lang => {
            const indicator = lang === currentLang ? '✅' : '⭕';
            const name = this.getLanguageName(lang);
            return `${indicator} **${name}** (${lang})`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#9932cc')
            .setTitle('🌐 Available Languages')
            .setDescription(languageList)
            .addFields(
                { name: 'Current Language', value: this.getLanguageName(currentLang), inline: true },
                { name: 'Total Languages', value: `${availableLanguages.length}`, inline: true }
            )
            .setFooter({ text: 'Use /language set <code> to change language' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleStats(interaction) {
        const stats = i18n.getScanStats();
        
        const embed = new EmbedBuilder()
            .setColor('#9932cc')
            .setTitle('📊 Translation Statistics')
            .addFields(
                { name: '📁 Total Commands', value: `${stats.totalCommands}`, inline: true },
                { name: '🌐 Translated Commands', value: `${stats.translatedCommands}`, inline: true },
                { name: '📈 Coverage', value: `${((stats.translatedCommands / stats.totalCommands) * 100).toFixed(1)}%`, inline: true },
                { name: '🗣️ Available Languages', value: stats.languages.join(', '), inline: false },
                { name: '🕒 Last Scan', value: `<t:${Math.floor(new Date(stats.lastScan).getTime() / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Auto-scan runs every 30 seconds in development mode' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleScan(interaction) {
        await interaction.deferReply();
        
        try {
            const result = await i18n.manualScan();
            
            if (result.success) {
                const stats = i18n.getScanStats();
                
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('🔍 Plugin Scan Complete')
                    .setDescription(result.message)
                    .addFields(
                        { name: '📁 Commands Found', value: `${stats.totalCommands}`, inline: true },
                        { name: '🌐 Translated', value: `${stats.translatedCommands}`, inline: true },
                        { name: '📈 Coverage', value: `${((stats.translatedCommands / stats.totalCommands) * 100).toFixed(1)}%`, inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply('❌ Scan failed. Check console for details.');
            }
        } catch (error) {
            console.error('Manual scan error:', error);
            await interaction.editReply('❌ An error occurred during the scan.');
        }
    },

    async handlePersonal(interaction) {
        const userId = interaction.user.id;
        const langCode = interaction.options.getString('lang');
        
        if (!langCode) {
            // Show current personal setting
            const userLang = await i18n.getUserLanguage(userId);
            const botDefaultLang = i18n.getCurrentLanguage();
            const effectiveLang = userLang || botDefaultLang;
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🌐 Your Personal Language Setting')
                .addFields(
                    { name: '👤 Your Setting', value: userLang ? this.getLanguageName(userLang) : '🌐 Using Bot Default', inline: true },
                    { name: '🤖 Bot Default', value: this.getLanguageName(botDefaultLang), inline: true },
                    { name: '✅ Effective Language', value: this.getLanguageName(effectiveLang), inline: true },
                    { name: '💡 How to Change', value: 'Use `/language personal lang: <your choice>` to set your personal language', inline: false }
                )
                .setDescription('Your messages will appear in your preferred language.')
                .setFooter({ text: 'Personal settings override the bot default' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }
        
        // Set personal language
        let success = false;
        let resultMessage = '';
        
        if (langCode === 'default') {
            // Reset to bot default
            success = await i18n.setUserLanguage(userId, null);
            resultMessage = success ? 'Reset to bot default language' : 'Failed to reset language setting';
        } else {
            // Set specific language
            if (i18n.hasLanguage(langCode)) {
                success = await i18n.setUserLanguage(userId, langCode);
                resultMessage = success ? `Personal language set to ${this.getLanguageName(langCode)}` : 'Failed to save language setting';
            } else {
                resultMessage = `Language '${langCode}' is not available`;
            }
        }
        
        const embed = new EmbedBuilder()
            .setColor(success ? '#00ff00' : '#ff0000')
            .setTitle(success ? '✅ Personal Language Updated' : '❌ Language Error')
            .setDescription(resultMessage)
            .setTimestamp();
            
        if (success) {
            const effectiveLang = langCode === 'default' ? i18n.getCurrentLanguage() : langCode;
            embed.addFields(
                { name: '🌐 Your New Setting', value: langCode === 'default' ? '🌐 Bot Default' : this.getLanguageName(langCode), inline: true },
                { name: '✅ Effective Language', value: this.getLanguageName(effectiveLang), inline: true },
                { name: '💾 Saved to Profile', value: '✅ Your setting has been saved', inline: true }
            );
        }

        await interaction.reply({ embeds: [embed] });
        
        // Clear user cache
        i18n.clearUserCache(userId);
    },

    async handleStatus(interaction) {
        const status = i18n.getTranslationStatus();
        
        const embed = new EmbedBuilder()
            .setColor('#9932cc')
            .setTitle('📊 Detailed Translation Status')
            .addFields(
                { name: '🔧 Configuration', value: `Auto Scan: ${status.config.autoScan.enabled ? '✅' : '❌'}\nScan Interval: ${status.config.autoScan.interval}ms`, inline: true },
                { name: '📈 Global Stats', value: `Total Keys: ${status.summary.totalKeys}\nCommands: ${status.status.stats.commandsCovered}/${status.status.stats.totalCommands}\nCoverage: ${status.summary.commandCoverage}`, inline: true },
                { name: '🔍 Scan Info', value: `Total Scans: ${status.status.totalScans}\nLast Scan: ${status.status.lastScan ? `<t:${Math.floor(new Date(status.status.lastScan).getTime() / 1000)}:R>` : 'Never'}\nErrors: ${status.status.errors}`, inline: true }
            );

        // Add language-specific stats
        let languageStats = '';
        for (const [langCode, langStatus] of Object.entries(status.languages)) {
            const flag = this.getLanguageFlag(langCode);
            languageStats += `${flag} **${langCode.toUpperCase()}**: ${langStatus.completionPercentage}% (${langStatus.translatedKeys}/${langStatus.totalKeys})\n`;
            languageStats += `   Manual: ${langStatus.manualKeys}\n`;
        }

        if (languageStats) {
            embed.addFields({ name: '🌐 Language Progress', value: languageStats, inline: false });
        }

        embed.addFields(
            { name: '📝 Translation Status', value: `Manual Translations: ${status.status.manuallyTranslatedKeys.length}\nTotal Keys Found: ${status.status.keysFound}`, inline: true }
        );

        await interaction.reply({ embeds: [embed] });
    },

    async handleConfig(interaction) {
        const setting = interaction.options.getString('setting');
        const value = interaction.options.getString('value');

        if (!setting) {
            // Show current configuration
            const status = i18n.getTranslationStatus();
            const config = status.config;

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🔧 I18n Configuration')
                .addFields(
                    { name: 'Auto Scan', value: `Enabled: ${config.autoScan.enabled ? '✅' : '❌'}\nInterval: ${config.autoScan.interval}ms\nProduction: ${config.autoScan.enabledInProduction ? '✅' : '❌'}`, inline: true },
                    { name: 'Languages', value: config.supportedLanguages.join(', '), inline: true },
                    { name: 'Exclude Keys', value: config.excludeKeys.join(', ') || 'None', inline: true },
                    { name: 'Notifications', value: `New Keys: ${config.notifications.newKeysFound ? '✅' : '❌'}\nErrors: ${config.notifications.errorsOccurred ? '✅' : '❌'}`, inline: true }
                )
                .setFooter({ text: 'Use /language config <setting> <value> to modify settings' });

            return interaction.reply({ embeds: [embed] });
        }

        // Modify configuration
        let success = false;
        let message = '';

        try {
            switch (setting) {
                case 'autoscan':
                    const scanEnabled = value === 'true' || value === 'on' || value === '1';
                    i18n.updateConfig({ autoScan: { ...i18n.config.autoScan, enabled: scanEnabled } });
                    message = `Auto scan ${scanEnabled ? 'enabled' : 'disabled'}`;
                    success = true;
                    break;

                case 'interval':
                    const interval = parseInt(value);
                    if (!isNaN(interval) && interval >= 5000) {
                        i18n.updateConfig({ autoScan: { ...i18n.config.autoScan, interval: interval } });
                        message = `Scan interval set to ${interval}ms`;
                        success = true;
                    } else {
                        message = 'Invalid interval. Must be >= 5000ms';
                    }
                    break;

                case 'reset':
                    i18n.resetStatus();
                    message = 'Translation status reset successfully';
                    success = true;
                    break;

                default:
                    message = 'Unknown setting';
            }
        } catch (error) {
            message = `Error: ${error.message}`;
        }

        const embed = new EmbedBuilder()
            .setColor(success ? '#00ff00' : '#ff0000')
            .setTitle(success ? '✅ Configuration Updated' : '❌ Configuration Error')
            .setDescription(message)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleExport(interaction) {
        await interaction.deferReply();

        try {
            const format = interaction.options.getString('format') || 'json';
            const exportData = i18n.exportTranslations(format);
            
            const fileName = `translations_${new Date().toISOString().split('T')[0]}.${format}`;
            const buffer = Buffer.from(exportData, 'utf8');

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('📤 Translation Export')
                .setDescription(`Exported ${Object.keys(i18n.languages).length} languages in ${format.toUpperCase()} format`)
                .addFields(
                    { name: 'File Size', value: `${(buffer.length / 1024).toFixed(2)} KB`, inline: true },
                    { name: 'Format', value: format.toUpperCase(), inline: true },
                    { name: 'Timestamp', value: new Date().toISOString(), inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ 
                embeds: [embed],
                files: [{
                    attachment: buffer,
                    name: fileName
                }]
            });

        } catch (error) {
            console.error('Export error:', error);
            await interaction.editReply('❌ Export failed. Check console for details.');
        }
    },

    getLanguageName(code) {
        const names = {
            'en': '🇺🇸 English',
            'vi': '🇻🇳 Tiếng Việt', 
            'ja': '🇯🇵 日本語'
        };
        return names[code] || `Unknown (${code})`;
    },

    getLanguageFlag(code) {
        const flags = {
            'en': '🇺🇸',
            'vi': '🇻🇳',
            'ja': '🇯🇵'
        };
        return flags[code] || '🏳️';
    },
};
