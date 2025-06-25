const fs = require('fs');
const path = require('path');

class I18nManager {
    constructor() {
        this.languages = {};
        this.currentLanguage = process.env.BOT_LANGUAGE || 'en';
        this.defaultLanguage = 'en';
        this.i18nPath = path.join(__dirname, '..', 'i18n');
        this.commandsPath = path.join(__dirname, '..', 'commands');
        this.configPath = path.join(this.i18nPath, 'config.json');
        this.statusPath = path.join(this.i18nPath, 'status.json');
        
        this.loadConfig();
        this.loadStatus();
        this.loadLanguages();
        // Remove auto-scan setup
        // this.setupAutoScan();
    }

    // Load i18n configuration
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const content = fs.readFileSync(this.configPath, 'utf8');
                this.config = JSON.parse(content);
            } else {
                this.config = this.getDefaultConfig();
                this.saveConfig();
            }
            console.log(`🔧 I18n config loaded`);
        } catch (error) {
            console.error('❌ Error loading i18n config:', error.message);
            this.config = this.getDefaultConfig();
        }
    }

    // Get default configuration
    getDefaultConfig() {
        return {
            autoScan: {
                enabled: false, // Disabled by default
                interval: 30000,
                enabledInProduction: false
            },
            patterns: {
                economy: ['balance', 'money', 'funds', 'transfer', 'give', 'take', 'earn'],
                gambling: ['win', 'lose', 'bet', 'payout', 'result', 'outcome', 'score'],
                music: ['playing', 'queue', 'music', 'song', 'artist', 'track'],
                crime: ['crime', 'steal', 'rob', 'heist', 'fine', 'caught'],
                work: ['work', 'job', 'task', 'salary', 'employment']
            },
            excludeKeys: ['test', 'debug', 'temp'],
            supportedLanguages: ['en', 'vi', 'ja'],
            notifications: {
                newKeysFound: false, // Disabled
                errorsOccurred: false // Disabled
            }
        };
    }

    // Load translation status
    loadStatus() {
        try {
            if (fs.existsSync(this.statusPath)) {
                const content = fs.readFileSync(this.statusPath, 'utf8');
                this.status = JSON.parse(content);
            } else {
                this.status = this.getDefaultStatus();
                this.saveStatus();
            }
        } catch (error) {
            console.error('❌ Error loading i18n status:', error.message);
            this.status = this.getDefaultStatus();
        }
    }

    // Get default status
    getDefaultStatus() {
        return {
            lastScan: null,
            totalScans: 0,
            keysFound: 0,
            errors: 0,
            languages: {},
            manuallyTranslatedKeys: new Set(),
            stats: {
                commandsCovered: 0,
                totalCommands: 0,
                coveragePercentage: 0
            }
        };
    }

    // Save configuration
    saveConfig() {
        try {
            const content = JSON.stringify(this.config, null, 2);
            fs.writeFileSync(this.configPath, content, 'utf8');
            console.log(`💾 I18n config saved`);
        } catch (error) {
            console.error('❌ Error saving i18n config:', error.message);
        }
    }

    // Save status
    saveStatus() {
        try {
            // Convert Sets to Arrays for JSON serialization
            const statusToSave = {
                ...this.status,
                manuallyTranslatedKeys: Array.from(this.status.manuallyTranslatedKeys)
            };
            
            const content = JSON.stringify(statusToSave, null, 2);
            fs.writeFileSync(this.statusPath, content, 'utf8');
        } catch (error) {
            console.error('❌ Error saving i18n status:', error.message);
        }
    }

    // Update status after loading
    updateStatus() {
        // Convert Arrays back to Sets after loading
        if (Array.isArray(this.status.manuallyTranslatedKeys)) {
            this.status.manuallyTranslatedKeys = new Set(this.status.manuallyTranslatedKeys);
        }

        // Initialize language status
        for (const langCode of this.config.supportedLanguages) {
            if (!this.status.languages[langCode]) {
                this.status.languages[langCode] = {
                    totalKeys: 0,
                    translatedKeys: 0,
                    manualKeys: 0,
                    lastUpdated: null,
                    completionPercentage: 0
                };
            }
        }
    }

    loadLanguages() {
        try {
            const files = fs.readdirSync(this.i18nPath);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const langCode = path.basename(file, '.json');
                    
                    // Skip config and status files - only load language files
                    if (langCode === 'config' || langCode === 'status') {
                        continue;
                    }
                    
                    const filePath = path.join(this.i18nPath, file);
                    
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        this.languages[langCode] = JSON.parse(content);
                        console.log(`✅ Loaded language: ${langCode}`);
                    } catch (error) {
                        console.error(`❌ Error loading language file ${file}:`, error.message);
                    }
                }
            }
            
            // Ensure default language is loaded
            if (!this.languages[this.defaultLanguage]) {
                console.warn(`❌ Default language '${this.defaultLanguage}' not found! Creating basic structure.`);
                this.languages[this.defaultLanguage] = {
                    common: {
                        error: "❌ An error occurred",
                        success: "✅ Success"
                    }
                };
                this.saveLanguageFile(this.defaultLanguage);
            }
            
            // Check if current language exists
            if (!this.languages[this.currentLanguage]) {
                console.warn(`⚠️ Language '${this.currentLanguage}' not found, falling back to '${this.defaultLanguage}'`);
                this.currentLanguage = this.defaultLanguage;
            }
            
            console.log(`🌐 I18n initialized with language: ${this.currentLanguage}`);
            console.log(`📚 Available languages: ${Object.keys(this.languages).join(', ')}`);
            
        } catch (error) {
            console.error('❌ Error loading i18n directory:', error.message);
            // Create default empty language
            this.languages[this.defaultLanguage] = {};
        }

        this.updateStatus();
        this.calculateStats();
    }

    // Calculate translation statistics
    calculateStats() {
        try {
            const defaultLang = this.languages[this.defaultLanguage];
            if (!defaultLang) return;

            const totalKeys = this.countKeys(defaultLang);
            this.status.keysFound = totalKeys;

            // Update language statistics
            for (const langCode of this.config.supportedLanguages) {
                if (this.languages[langCode]) {
                    const langKeys = this.countKeys(this.languages[langCode]);
                    
                    this.status.languages[langCode] = {
                        totalKeys: totalKeys,
                        translatedKeys: langKeys,
                        manualKeys: langKeys,
                        lastUpdated: new Date().toISOString(),
                        completionPercentage: totalKeys > 0 ? (langKeys / totalKeys * 100).toFixed(2) : 0
                    };
                }
            }

            // Update command coverage
            const commandFiles = fs.readdirSync(this.commandsPath).filter(file => file.endsWith('.js'));
            this.status.stats.totalCommands = commandFiles.length;
            
            let coveredCommands = 0;
            for (const file of commandFiles) {
                const commandName = path.basename(file, '.js');
                if (this.hasTranslation(`commands.${commandName}.description`)) {
                    coveredCommands++;
                }
            }
            
            this.status.stats.commandsCovered = coveredCommands;
            this.status.stats.coveragePercentage = commandFiles.length > 0 ? 
                (coveredCommands / commandFiles.length * 100).toFixed(2) : 0;

        } catch (error) {
            console.error('❌ Error calculating stats:', error.message);
        }
    }

    // Count total keys in object
    countKeys(obj, prefix = '') {
        let count = 0;
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                count += this.countKeys(value, prefix ? `${prefix}.${key}` : key);
            } else {
                count++;
            }
        }
        return count;
    }

    // Get translation with user-specific language support
    t(key, replacements = {}, userIdOrLanguage = null) {
        let lang = this.currentLanguage; // Default to bot language
        
        // Determine the language to use
        if (userIdOrLanguage) {
            if (typeof userIdOrLanguage === 'string' && userIdOrLanguage.length <= 3) {
                // It's a language code
                lang = userIdOrLanguage;
            } else {
                // It's a user ID, get their preferred language
                const userLang = this.getUserLanguageSync(userIdOrLanguage);
                if (userLang) {
                    lang = userLang;
                }
            }
        }
        
        const fallbackLang = this.defaultLanguage;
        
        // Try user/specified language first
        let value = this.getNestedValue(this.languages[lang], key);
        
        // Fallback to default language if not found
        if (value === undefined && lang !== fallbackLang) {
            value = this.getNestedValue(this.languages[fallbackLang], key);
        }
        
        // If still not found, return the key itself
        if (value === undefined) {
            console.warn(`⚠️ Translation key not found: ${key}`);
            return key;
        }
        
        // Handle array values (random selection)
        if (Array.isArray(value)) {
            value = value[Math.floor(Math.random() * value.length)];
        }
          // Replace placeholders
        if (typeof value === 'string' && Object.keys(replacements).length > 0) {
            for (const [placeholder, replacement] of Object.entries(replacements)) {
                // Escape special regex characters in placeholder
                const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                value = value.replace(new RegExp(`\\{${escapedPlaceholder}\\}`, 'g'), replacement);
            }
        }
        
        return value;
    }

    // Async version for getting user-specific translations
    async tUser(key, userId, replacements = {}) {
        const userLang = await this.getUserLanguage(userId);
        return this.t(key, replacements, userLang || this.currentLanguage);
    }

    // Get user's preferred language (async)
    async getUserLanguage(userId) {
        try {
            const userData = require('./userdata.js');
            return await userData.getUserLanguage(userId);
        } catch (error) {
            console.warn('Error getting user language:', error);
            return null;
        }
    }

    // Get user's preferred language (sync - for cache)
    getUserLanguageSync(userId) {
        try {
            // Simple cache mechanism
            if (!this.userLanguageCache) {
                this.userLanguageCache = new Map();
            }
            
            // Check cache first
            if (this.userLanguageCache.has(userId)) {
                const cached = this.userLanguageCache.get(userId);
                // Cache for 5 minutes
                if (Date.now() - cached.timestamp < 300000) {
                    return cached.language;
                }
            }
            
            // If not cached or expired, return null (will use default)
            return null;
        } catch (error) {
            return null;
        }
    }

    // Set user's language preference
    async setUserLanguage(userId, languageCode) {
        try {
            const userData = require('./userdata.js');
            const success = await userData.setUserLanguage(userId, languageCode);
            
            if (success) {
                // Update cache
                if (!this.userLanguageCache) {
                    this.userLanguageCache = new Map();
                }
                this.userLanguageCache.set(userId, {
                    language: languageCode,
                    timestamp: Date.now()
                });
            }
            
            return success;
        } catch (error) {
            console.error('Error setting user language:', error);
            return false;
        }
    }

    // Get current language
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    // Get available languages
    getAvailableLanguages() {
        return Object.keys(this.languages);
    }

    // Check if language is available
    hasLanguage(langCode) {
        return this.languages.hasOwnProperty(langCode);
    }

    // Reload all language files
    reload() {
        this.languages = {};
        this.loadLanguages();
    }

    // Format money with current language
    formatMoney(amount) {
        const formatted = Math.floor(amount).toLocaleString();
        return `💰${formatted}`;
    }

    // Get translated text for common responses
    error(message = null) {
        return message || this.t('common.error');
    }

    success(message = null) {
        return message || this.t('common.success');
    }

    insufficientFunds(needed, current) {
        return this.t('economy.insufficient_funds_message', {
            needed: this.formatMoney(needed),
            current: this.formatMoney(current)
        });
    }

    // Auto-scan for new commands and generate translations (disabled)
    setupAutoScan() {
        // Auto-scan disabled - only load i18n files
        console.log('🔍 Auto-scan disabled - i18n loaded for static translations only');
        return;
    }

    async scanForNewCommands() {
        try {
            this.status.totalScans++;
            this.status.lastScan = new Date().toISOString();

            const commandFiles = fs.readdirSync(this.commandsPath)
                .filter(file => file.endsWith('.js'));
            
            let hasNewTranslations = false;
            const newKeys = new Set();
            
            for (const file of commandFiles) {
                const filePath = path.join(this.commandsPath, file);
                const commandName = path.basename(file, '.js');
                
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const translations = this.extractTranslationsFromCommand(content, commandName);
                    
                    // Add new translations to default language only
                    for (const [key, value] of Object.entries(translations)) {
                        // Check if key should be excluded
                        if (this.shouldExcludeKey(key)) continue;
                        
                        if (!this.hasTranslation(key)) {
                            this.addTranslation(key, value);
                            newKeys.add(key);
                            hasNewTranslations = true;
                            
                            // Mark as manually translated
                            this.status.manuallyTranslatedKeys.add(key);
                        }
                    }
                } catch (error) {
                    this.status.errors++;
                    console.warn(`⚠️ Error scanning command file ${file}:`, error.message);
                }
            }
            
            if (hasNewTranslations) {
                if (this.config.notifications.newKeysFound) {
                    console.log(`🔍 Auto-detected ${newKeys.size} new translation keys for manual translation`);
                }
                
                this.saveLanguageFile(this.defaultLanguage);
                this.calculateStats();
                this.saveStatus();
            }
            
        } catch (error) {
            this.status.errors++;
            if (this.config.notifications.errorsOccurred) {
                console.error('❌ Error during auto-scan:', error.message);
            }
        }
    }

    // Extract translations from command content
    extractTranslationsFromCommand(content, commandName) {
        const translations = {};
        
        try {
            // Extract command description
            const descMatch = content.match(/\.setDescription\(['"`]([^'"`]+)['"`]\)/);
            if (descMatch && typeof descMatch[1] === 'string') {
                translations[`commands.${commandName}.description`] = descMatch[1];
            }
            
            // Extract embed titles
            const titleMatches = content.matchAll(/\.setTitle\(['"`]([^'"`]+)['"`]\)/g);
            for (const match of titleMatches) {
                const title = match[1];
                if (typeof title === 'string' && title.length > 0) {
                    if (title.includes('❌')) {
                        translations[`commands.${commandName}.error_title`] = title;
                    } else if (title.includes('✅')) {
                        translations[`commands.${commandName}.success_title`] = title;
                    } else {
                        const key = this.generateKeyFromTitle(title);
                        if (key && key.length > 0) {
                            translations[`commands.${commandName}.${key}`] = title;
                        }
                    }
                }
            }
            
            // Extract common messages
            const messageMatches = content.matchAll(/\.setDescription\(['"`]([^'"`]+)['"`]\)/g);
            for (const match of messageMatches) {
                const message = match[1];
                if (typeof message === 'string' && message.length > 10 && message.length < 200) {
                    const key = this.generateKeyFromMessage(message);
                    if (key && key.length > 0) {
                        translations[`commands.${commandName}.${key}`] = message;
                    }
                }
            }
            
            // Extract specific patterns for economy commands
            if (this.isEconomyCommand(content)) {
                this.extractEconomyPatterns(content, commandName, translations);
            }
            
            // Extract specific patterns for gambling commands
            if (this.isGamblingCommand(content)) {
                this.extractGamblingPatterns(content, commandName, translations);
            }
            
            // Extract specific patterns for music commands
            if (this.isMusicCommand(content)) {
                this.extractMusicPatterns(content, commandName, translations);
            }
            
        } catch (error) {
            console.warn(`⚠️ Error extracting translations from ${commandName}:`, error.message);
        }
        
        return translations;
    }

    isEconomyCommand(content) {
        return content.includes('userData') || 
               content.includes('balance') || 
               content.includes('formatMoney') ||
               content.includes('economy');
    }

    isGamblingCommand(content) {
        return content.includes('bet') || 
               content.includes('gambling') || 
               content.includes('dice') ||
               content.includes('rps') ||
               content.includes('casino');
    }

    isMusicCommand(content) {
        return content.includes('musicPlayer') || 
               content.includes('voice') || 
               content.includes('audio') ||
               content.includes('queue');
    }

    extractEconomyPatterns(content, commandName, translations) {
        try {
            // Extract balance-related messages
            const balanceMatches = content.matchAll(/['"`]([^'"`]*(?:balance|money|funds)[^'"`]*)['"`]/gi);
            for (const match of balanceMatches) {
                if (typeof match[1] === 'string' && match[1].length > 5) {
                    const key = this.generateKeyFromMessage(match[1]);
                    if (key && key.length > 0) {
                        translations[`economy.${key}`] = match[1];
                    }
                }
            }
            
            // Extract transaction messages
            const transactionMatches = content.matchAll(/['"`]([^'"`]*(?:transfer|give|take|earn)[^'"`]*)['"`]/gi);
            for (const match of transactionMatches) {
                if (typeof match[1] === 'string' && match[1].length > 5) {
                    const key = this.generateKeyFromMessage(match[1]);
                    if (key && key.length > 0) {
                        translations[`economy.${key}`] = match[1];
                    }
                }
            }
        } catch (error) {
            console.warn(`⚠️ Error extracting economy patterns:`, error);
        }
    }

    extractGamblingPatterns(content, commandName, translations) {
        try {
            // Extract gambling-related messages
            const gamblingMatches = content.matchAll(/['"`]([^'"`]*(?:win|lose|bet|payout)[^'"`]*)['"`]/gi);
            for (const match of gamblingMatches) {
                if (typeof match[1] === 'string' && match[1].length > 5) {
                    const key = this.generateKeyFromMessage(match[1]);
                    if (key && key.length > 0) {
                        translations[`gambling.${commandName}.${key}`] = match[1];
                    }
                }
            }
            
            // Extract game result messages
            const resultMatches = content.matchAll(/['"`]([^'"`]*(?:result|outcome|score)[^'"`]*)['"`]/gi);
            for (const match of resultMatches) {
                if (typeof match[1] === 'string' && match[1].length > 5) {
                    const key = this.generateKeyFromMessage(match[1]);
                    if (key && key.length > 0) {
                        translations[`gambling.${commandName}.${key}`] = match[1];
                    }
                }
            }
        } catch (error) {
            console.warn(`⚠️ Error extracting gambling patterns:`, error);
        }
    }

    extractMusicPatterns(content, commandName, translations) {
        try {
            // Extract music-related messages
            const musicMatches = content.matchAll(/['"`]([^'"`]*(?:playing|queue|music|song)[^'"`]*)['"`]/gi);
            for (const match of musicMatches) {
                if (typeof match[1] === 'string' && match[1].length > 5) {
                    const key = this.generateKeyFromMessage(match[1]);
                    if (key && key.length > 0) {
                        translations[`music.${key}`] = match[1];
                    }
                }
            }
        } catch (error) {
            console.warn(`⚠️ Error extracting music patterns:`, error);
        }
    }

    generateKeyFromTitle(title) {
        try {
            if (typeof title !== 'string') return '';
            
            return title.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, '_')
                .substring(0, 30);
        } catch (error) {
            console.warn(`⚠️ Error generating key from title:`, error);
            return 'generated_title_key';
        }
    }

    generateKeyFromMessage(message) {
        try {
            if (typeof message !== 'string') return '';
            
            return message.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, '_')
                .substring(0, 50);
        } catch (error) {
            console.warn(`⚠️ Error generating key from message:`, error);
            return 'generated_message_key';
        }
    }

    hasTranslation(key) {
        return this.getNestedValue(this.languages[this.defaultLanguage], key) !== undefined;
    }

    addTranslation(key, value, language = null) {
        const lang = language || this.defaultLanguage;
        if (!this.languages[lang]) {
            this.languages[lang] = {};
        }
        
        const keys = key.split('.');
        let current = this.languages[lang];
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    saveLanguageFile(langCode) {
        try {
            const filePath = path.join(this.i18nPath, `${langCode}.json`);
            const content = JSON.stringify(this.languages[langCode], null, 2);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`💾 Saved language file: ${langCode}.json`);
        } catch (error) {
            console.error(`❌ Error saving language file ${langCode}:`, error.message);
        }
    }

    // Check if key should be excluded
    shouldExcludeKey(key) {
        for (const excludePattern of this.config.excludeKeys) {
            if (key.includes(excludePattern)) {
                return true;
            }
        }
        return false;
    }

    // Check if translation is manual (always return true now)
    isManualTranslation(key, value) {
        return true;
    }

    // Get translation status and statistics
    getTranslationStatus() {
        this.calculateStats();
        
        return {
            config: this.config,
            status: {
                ...this.status,
                manuallyTranslatedKeys: Array.from(this.status.manuallyTranslatedKeys)
            },
            languages: this.status.languages,
            summary: {
                totalKeys: this.status.keysFound,
                totalLanguages: this.config.supportedLanguages.length,
                autoScanEnabled: this.config.autoScan.enabled,
                lastScan: this.status.lastScan,
                commandCoverage: this.status.stats.coveragePercentage + '%'
            }
        };
    }

    // Update configuration
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.saveConfig();
        
        // Restart auto-scan if configuration changed
        if (newConfig.autoScan) {
            this.setupAutoScan();
        }
        
        console.log('🔧 I18n configuration updated');
    }

    // Reset translation status
    resetStatus() {
        this.status = this.getDefaultStatus();
        this.saveStatus();
        console.log('🔄 I18n status reset');
    }

    // Export translations for external tools
    exportTranslations(format = 'json') {
        const exportData = {
            timestamp: new Date().toISOString(),
            config: this.config,
            status: this.getTranslationStatus(),
            languages: this.languages
        };

        switch (format) {
            case 'json':
                return JSON.stringify(exportData, null, 2);
            case 'csv':
                return this.convertToCSV(exportData);
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    // Convert to CSV format
    convertToCSV(data) {
        const rows = [];
        rows.push(['Key', 'English', 'Vietnamese', 'Japanese', 'Manual Translation']);
        
        const processObject = (obj, prefix = '') => {
            for (const [key, value] of Object.entries(obj)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    processObject(value, fullKey);
                } else {
                    const en = this.getNestedValue(this.languages.en, fullKey) || '';
                    const vi = this.getNestedValue(this.languages.vi, fullKey) || '';
                    const ja = this.getNestedValue(this.languages.ja, fullKey) || '';
                    const isManual = this.status.manuallyTranslatedKeys.has(fullKey);
                    
                    rows.push([fullKey, en, vi, ja, isManual ? 'Yes' : 'No']);
                }
            }
        };
        
        processObject(this.languages.en || {});
        
        return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    // Get user-specific formatted responses
    async userError(userId, message = null) {
        return message || await this.tUser('common.error', userId);
    }

    async userSuccess(userId, message = null) {
        return message || await this.tUser('common.success', userId);
    }

    async userInsufficientFunds(userId, needed, current) {
        return await this.tUser('economy.insufficient_funds_message', userId, {
            needed: this.formatMoney(needed),
            current: this.formatMoney(current)
        });
    }

    // Clear user language cache
    clearUserCache(userId = null) {
        if (!this.userLanguageCache) return;
        
        if (userId) {
            this.userLanguageCache.delete(userId);
        } else {
            this.userLanguageCache.clear();
        }
    }

    // Get nested object value using dot notation
    getNestedValue(obj, key) {
        if (!obj || typeof obj !== 'object') return undefined;
        
        const keys = key.split('.');
        let current = obj;
        
        for (const k of keys) {
            if (current && typeof current === 'object' && k in current) {
                current = current[k];
            } else {
                return undefined;
            }
        }
        
        return current;
    }

    // Change language
    setLanguage(langCode) {
        if (this.languages[langCode]) {
            this.currentLanguage = langCode;
            console.log(`🌐 Language changed to: ${langCode}`);
            return true;
        } else {
            console.warn(`⚠️ Language '${langCode}' not available`);
            return false;
        }
    }

    // Manual scan trigger for admins
    async manualScan() {
        console.log('🔍 Starting manual plugin scan...');
        await this.scanForNewCommands();
        this.reload();
        return {
            success: true,
            message: 'Plugin scan completed successfully'
        };
    }

    // Get scan statistics
    getScanStats() {
        const stats = {
            totalCommands: 0,
            translatedCommands: 0,
            languages: Object.keys(this.languages),
            lastScan: new Date().toISOString()
        };
        
        try {
            const commandFiles = fs.readdirSync(this.commandsPath)
                .filter(file => file.endsWith('.js'));
            stats.totalCommands = commandFiles.length;
            
            // Count commands with translations
            for (const file of commandFiles) {
                const commandName = path.basename(file, '.js');
                if (this.hasTranslation(`commands.${commandName}.description`)) {
                    stats.translatedCommands++;
                }
            }
        } catch (error) {
            console.error('Error getting scan stats:', error);
        }
        
        return stats;
    }

    // Get language for guild/user combination (simplified method)
    async getLanguage(guildId, userId) {
        try {
            // First try to get user's preferred language
            const userLang = await this.getUserLanguage(userId);
            if (userLang && this.hasLanguage(userLang)) {
                return userLang;
            }
            
            // Fallback to bot's current language
            return this.currentLanguage;
        } catch (error) {
            console.warn('Error getting language preference:', error);
            return this.currentLanguage;
        }
    }

    // Simplified translate method that accepts language directly
    translate(lang, key, replacements = {}) {
        return this.t(key, replacements, lang);
    }
}

// Create singleton instance
const i18n = new I18nManager();
module.exports = i18n;
