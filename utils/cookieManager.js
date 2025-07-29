const fs = require('fs');
const path = require('path');
const YouTubeModeManager = require('./youtubeModeManager');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

class CookieManager {
    constructor() {
        // Initialize YouTube mode manager
        this.modeManager = new YouTubeModeManager();
        
        // Cookie modes - define first
        this.MODES = {
            AUTO_COOKIE: 'auto-cookie',    // Auto-generate safe cookies
            COOKIE_ONLY: 'cookie-only',    // Only use user-provided cookies
            COOKIES: 'cookies'             // Legacy mode (same as auto-cookie)
        };
        
        // Load proxy configuration from file
        this.proxyConfig = this.loadProxyConfig();
        
        // Proxy configuration - use loaded config or fallback to hardcoded
        this.PROXY_SERVERS = this.proxyConfig.proxy?.servers || {
            'au': 'mel.socks.ipvanish.com:1080',      // Australia
            'uk': 'lon.socks.ipvanish.com:1080',      // United Kingdom
            'us': 'iad.socks.ipvanish.com:1080',      // United States
            'ca': 'tor.socks.ipvanish.com:1080',      // Canada
            'fr': 'par.socks.ipvanish.com:1080',      // France
            'de': 'fra.socks.ipvanish.com:1080',      // Germany
            'jp': 'tok.socks.ipvanish.com:1080',      // Japan
            'sg': 'sin.socks.ipvanish.com:1080',      // Singapore
            'nl': 'ams.socks.ipvanish.com:1080'       // Netherlands
        };
        
        this.currentProxy = null;
        this.proxyEnabled = this.proxyConfig.proxy?.enabled || process.env.YOUTUBE_PROXY_ENABLED === 'true';
        this.proxyRotationEnabled = this.proxyConfig.proxy?.rotation_enabled || process.env.YOUTUBE_PROXY_ROTATION === 'true';
        this.lastProxyRotation = 0;
        this.proxyRotationInterval = this.proxyConfig.proxy?.rotation_interval || 15 * 60 * 1000; // 15 minutes
        this.proxyCredentials = this.proxyConfig.proxy?.credentials || null;
        
        console.log(`🔗 Proxy configuration: enabled=${this.proxyEnabled}, rotation=${this.proxyRotationEnabled}`);
        
        this.cookieFile = path.join(__dirname, '../data/youtube_cookies.json');
        this.userCookieFile = path.join(__dirname, '../data/user_cookies.json');
        this.cookies = this.loadCookies();
        this.lastRefresh = Date.now();
        this.refreshInterval = 30 * 60 * 1000; // 30 minutes
        
        // Enhanced rotation system properties
        this.lastCookieRotation = 0;
        this.cookieSetIndex = 0;
        this.currentCookieSet = [];
        
        // Initialize the enhanced cookie rotation system
        this.initializeCookieRotation();
        
        // Initialize proxy if enabled
        if (this.proxyEnabled) {
            this.initializeProxy();
        }
    }

    getCurrentMode() {
        // Use the mode manager to get the current mode
        return this.modeManager.getCurrentMode();
    }

    loadCookies() {
        const mode = this.getCurrentMode();
        
        // In legacy mode, don't provide any cookies
        if (mode === 'legacy') {
            console.log('🎯 Legacy mode detected - no cookies will be provided');
            return [];
        }
        
        if (mode === 'custom-cookie' || mode === this.MODES.COOKIE_ONLY) {
            return this.loadUserCookies();
        }
        
        // For auto-cookie and legacy cookies mode
        try {
            if (fs.existsSync(this.cookieFile)) {
                const data = fs.readFileSync(this.cookieFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn('Failed to load auto cookies:', error.message);
        }
        return this.getDefaultCookies();
    }

    loadUserCookies() {
        try {
            if (fs.existsSync(this.userCookieFile)) {
                const data = fs.readFileSync(this.userCookieFile, 'utf8');
                const userCookies = JSON.parse(data);
                if (userCookies && userCookies.length > 0) {
                    console.log('✅ Loaded user-provided cookies');
                    return userCookies;
                }
            }
        } catch (error) {
            console.warn('Failed to load user cookies:', error.message);
        }
        
        console.warn('⚠️ Cookie-only mode enabled but no user cookies found!');
        console.warn('💡 Please provide cookies using /cookies command or switch to auto-cookie mode');
        return []; // Return empty array for cookie-only mode without user cookies
    }

    saveCookies(cookies) {
        try {
            fs.writeFileSync(this.cookieFile, JSON.stringify(cookies, null, 2));
            this.cookies = cookies;
            this.lastRefresh = Date.now();
            console.log('✅ Cookies saved successfully');
        } catch (error) {
            console.error('Failed to save cookies:', error.message);
        }
    }

    // Method to save user-provided cookies
    saveUserCookies(cookies) {
        try {
            fs.writeFileSync(this.userCookieFile, JSON.stringify(cookies, null, 2));
            console.log('✅ User cookies saved successfully');
            
            // If we're in cookie-only mode, reload cookies immediately
            if (this.getCurrentMode() === 'custom-cookie') {
                this.cookies = this.loadUserCookies();
            }
            
            return true;
        } catch (error) {
            console.error('Failed to save user cookies:', error.message);
            return false;
        }
    }

    /**
     * Generate fresh, realistic cookies to avoid blacklisting
     */
    generateFreshCookies() {
        const now = Date.now();
        const randomSeed = Math.random().toString(36).substring(2, 15);
        
        return [
            {
                name: 'VISITOR_INFO1_LIVE',
                value: this.generateVisitorId(),
                domain: '.youtube.com',
                path: '/',
                expires: now + (365 * 24 * 60 * 60 * 1000) // 1 year
            },
            {
                name: 'YSC',
                value: this.generateYSC(),
                domain: '.youtube.com',
                path: '/',
                httpOnly: true
            },
            {
                name: 'CONSENT',
                value: this.generateConsentString(),
                domain: '.youtube.com',
                path: '/'
            },
            {
                name: 'PREF',
                value: this.generatePreferences(),
                domain: '.youtube.com',
                path: '/'
            },
            {
                name: 'SOCS',
                value: 'CAI',
                domain: '.youtube.com',
                path: '/'
            },
            {
                name: '_gcl_au',
                value: this.generateGoogleAnalytics(),
                domain: '.youtube.com',
                path: '/'
            },
            {
                name: 'ST-' + randomSeed.substring(0, 6),
                value: this.generateSessionToken(),
                domain: '.youtube.com',
                path: '/',
                httpOnly: true
            }
        ];
    }

    /**
     * Generate realistic VISITOR_INFO1_LIVE value
     */
    generateVisitorId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let result = '';
        for (let i = 0; i < 11; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Generate YSC cookie value
     */
    generateYSC() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 11; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Generate realistic consent string
     */
    generateConsentString() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const randomNum = Math.floor(Math.random() * 999) + 100;
        
        return `YES+cb.${year}${month}${day}-17-p0.en+FX+${randomNum}`;
    }

    /**
     * Generate PREF cookie with realistic preferences
     */
    generatePreferences() {
        const languages = ['en', 'en-US', 'en-GB'];
        const lang = languages[Math.floor(Math.random() * languages.length)];
        const f4 = Math.floor(Math.random() * 1000000) + 4000000;
        const f5 = [20000, 30000, 40000][Math.floor(Math.random() * 3)];
        const f6 = Math.floor(Math.random() * 10) + 1;
        const f7 = [50, 100, 150][Math.floor(Math.random() * 3)];
        
        return `f4=${f4}&hl=${lang}&f5=${f5}&f6=${f6}&f7=${f7}&autoplay=true`;
    }

    /**
     * Generate Google Analytics cookie
     */
    generateGoogleAnalytics() {
        const timestamp = Math.floor(Date.now() / 1000);
        const random = Math.floor(Math.random() * 999999999) + 100000000;
        return `1.${timestamp}.${random}`;
    }

    /**
     * Generate session token
     */
    generateSessionToken() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 64; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Get random user agent for anti-detection
     */
    getRandomUserAgent() {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
        ];
        
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }

    getDefaultCookies() {
        // Use the new fresh cookie generation instead of static cookies
        return this.generateFreshCookies();
    }

    /**
     * Smart cookie rotation system
     */
    getRotatingCookies() {
        const rotationInterval = 30 * 60 * 1000; // 30 minutes
        const now = Date.now();
        
        // Check if we need to rotate cookies
        if (!this.lastCookieRotation || (now - this.lastCookieRotation) > rotationInterval) {
            console.log('🔄 Rotating cookies - generating fresh set');
            this.currentCookieSet = this.generateMultipleCookieSets();
            this.lastCookieRotation = now;
            this.cookieSetIndex = 0;
        }
        
        // Rotate through different sets
        const cookieSet = this.currentCookieSet[this.cookieSetIndex % this.currentCookieSet.length];
        this.cookieSetIndex++;
        
        return cookieSet;
    }

    /**
     * Generate multiple cookie sets for rotation
     */
    generateMultipleCookieSets() {
        const sets = [];
        for (let i = 0; i < 5; i++) {
            sets.push(this.generateFreshCookies());
        }
        return sets;
    }

    /**
     * Cookie health check and automatic refresh
     */
    async checkCookieHealth() {
        try {
            const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
            const cookies = await this.getCurrentCookies();
            
            // Simple health check - try to access YouTube with cookies
            const axios = require('axios');
            const response = await axios.get(testUrl, {
                headers: {
                    'Cookie': cookies.map(c => `${c.name}=${c.value}`).join('; '),
                    'User-Agent': this.getRandomUserAgent()
                },
                timeout: 10000
            });
            
            const isHealthy = response.status === 200 && !response.data.includes('blocked');
            
            if (!isHealthy) {
                console.log('⚠️ Cookies appear to be blacklisted, generating fresh set');
                this.lastCookieRotation = 0; // Force rotation
            }
            
            return isHealthy;
        } catch (error) {
            console.log('⚠️ Cookie health check failed, will rotate on next request');
            this.lastCookieRotation = 0; // Force rotation
            return false;
        }
    }

    /**
     * Initialize cookie rotation system
     */
    initializeCookieRotation() {
        // Initialize rotation state
        this.lastCookieRotation = 0;
        this.cookieSetIndex = 0;
        this.currentCookieSet = [];
        
        // Set up periodic health checks
        setInterval(() => {
            this.checkCookieHealth();
        }, 10 * 60 * 1000); // Check every 10 minutes
        
        console.log('🔄 Cookie rotation system initialized');
    }

    /**
     * Initialize proxy system
     */
    initializeProxy() {
        if (!this.proxyEnabled) {
            console.log('🔗 Proxy system disabled');
            return;
        }

        const serverCount = Object.keys(this.PROXY_SERVERS).length;
        console.log(`🔗 Initializing proxy system with ${serverCount} servers`);
        
        // Set initial proxy to default region or random
        const defaultRegion = this.proxyConfig.proxy?.default_region || 'us';
        if (this.PROXY_SERVERS[defaultRegion]) {
            this.setProxy(defaultRegion);
        } else {
            this.rotateProxy();
        }
        
        // Set up rotation if enabled
        if (this.proxyRotationEnabled) {
            this.setupProxyRotation();
        }
    }

    /**
     * Setup automatic proxy rotation
     */
    setupProxyRotation() {
        setInterval(() => {
            if (this.proxyRotationEnabled) {
                this.rotateProxy();
            }
        }, this.proxyRotationInterval);
        console.log(`🔄 Proxy rotation enabled: every ${this.proxyRotationInterval / 60000} minutes`);
    }

    /**
     * Proxy Management Methods
     */
    
    /**
     * Get current proxy configuration
     */
    getCurrentProxy() {
        const now = Date.now();
        
        // Rotate proxy if enabled and interval has passed
        if (this.proxyRotationEnabled && 
            (!this.lastProxyRotation || (now - this.lastProxyRotation) > this.proxyRotationInterval)) {
            this.rotateProxy();
            this.lastProxyRotation = now;
        }
        
        return this.currentProxy;
    }

    /**
     * Rotate through available proxy servers
     */
    rotateProxy() {
        const proxies = Object.values(this.PROXY_SERVERS);
        const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
        this.currentProxy = randomProxy;
        console.log(`🔄 Rotated to proxy: ${randomProxy}`);
    }

    /**
     * Set specific proxy by region code
     */
    setProxy(region) {
        if (this.PROXY_SERVERS[region.toLowerCase()]) {
            this.currentProxy = this.PROXY_SERVERS[region.toLowerCase()];
            console.log(`🌍 Proxy set to ${region.toUpperCase()}: ${this.currentProxy}`);
            return true;
        }
        return false;
    }

    /**
     * Get current proxy
     */
    getCurrentProxy() {
        return this.currentProxy;
    }

    /**
     * Check if proxy is enabled
     */
    isProxyEnabled() {
        return this.proxyEnabled && this.currentProxy;
    }

    /**
     * Load proxy configuration from file
     */
    loadProxyConfig() {
        try {
            const configPath = path.join(__dirname, '../data/youtube_proxy_config.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);
                console.log('📋 Proxy config loaded from file');
                return config;
            }
        } catch (error) {
            console.warn('⚠️ Failed to load proxy config:', error.message);
        }
        
        // Return default config if file doesn't exist or has errors
        return {
            proxy: {
                enabled: false,
                rotation_enabled: true,
                rotation_interval: 900000,
                default_region: 'us',
                servers: {},
                credentials: null
            }
        };
    }

    /**
     * Create proxy agent for HTTP requests
     */
    createProxyAgent() {
        if (!this.proxyEnabled || !this.currentProxy) {
            return null;
        }

        try {
            let proxyUrl;
            
            // Build proxy URL with credentials if available
            if (this.proxyCredentials && this.proxyCredentials.username && this.proxyCredentials.password) {
                const auth = `${this.proxyCredentials.username}:${this.proxyCredentials.password}`;
                proxyUrl = `socks5://${auth}@${this.currentProxy}`;
            } else {
                proxyUrl = `socks5://${this.currentProxy}`;
            }
            
            console.log(`🔗 Creating proxy agent: ${this.currentProxy} (with auth: ${!!this.proxyCredentials})`);
            
            // Check if it's a SOCKS proxy (which it should be for our config)
            if (this.currentProxy.includes('socks') || proxyUrl.startsWith('socks5://')) {
                return new SocksProxyAgent(proxyUrl);
            } else {
                return new HttpsProxyAgent(`https://${this.currentProxy}`);
            }
        } catch (error) {
            console.error('❌ Failed to create proxy agent:', error.message);
            return null;
        }
    }

    /**
     * Format cookies for ytdl-core (ensure array format)
     */
    formatCookiesForYtdl(cookies) {
        if (!cookies) return [];
        
        // If it's already an array, return as is
        if (Array.isArray(cookies)) {
            return cookies.map(cookie => {
                // Ensure each cookie has required properties
                if (typeof cookie === 'object' && cookie.name && cookie.value) {
                    return {
                        name: cookie.name,
                        value: cookie.value,
                        domain: cookie.domain || '.youtube.com',
                        path: cookie.path || '/',
                        ...(cookie.expires && { expires: cookie.expires }),
                        ...(cookie.httpOnly && { httpOnly: cookie.httpOnly }),
                        ...(cookie.secure && { secure: cookie.secure })
                    };
                }
                return cookie;
            });
        }
        
        // If it's a string, parse it
        if (typeof cookies === 'string') {
            const cookieArray = [];
            const pairs = cookies.split(';');
            
            for (const pair of pairs) {
                const [name, value] = pair.split('=').map(s => s.trim());
                if (name && value) {
                    cookieArray.push({
                        name,
                        value,
                        domain: '.youtube.com',
                        path: '/'
                    });
                }
            }
            return cookieArray;
        }
        
        return [];
    }

    /**
     * Enhanced getCurrentCookies with anti-detection features and proxy support
     */
    async getCurrentCookies() {
        const currentMode = this.getCurrentMode();
        
        // Return empty array for legacy mode
        if (currentMode === 'legacy') {
            console.log('🎯 Legacy mode detected - no cookies will be provided');
            return [];
        }
        
        try {
            let rawCookies = [];
            
            // For auto-cookie mode, use rotating fresh cookies
            if (currentMode === 'auto-cookie' || process.env.YOUTUBE_AUTO_COOKIE === 'true') {
                rawCookies = this.getRotatingCookies();
                console.log('🍪 Generated fresh auto-cookies with anti-detection features');
            }
            // For custom cookies, load user-provided ones
            else if (currentMode === 'custom-cookie' || process.env.YOUTUBE_COOKIE_ONLY === 'true') {
                rawCookies = this.loadUserCookies();
                if (!rawCookies || rawCookies.length === 0) {
                    console.log('🔄 No custom cookies found, generating fresh cookies as fallback');
                    rawCookies = this.generateFreshCookies();
                } else {
                    console.log(`🍪 Loaded ${rawCookies.length} custom cookies`);
                }
            }
            // Fallback to fresh generated cookies
            else {
                console.log('🔄 Using fallback fresh cookies');
                rawCookies = this.generateFreshCookies();
            }
            
            // Format cookies properly for ytdl-core
            const formattedCookies = this.formatCookiesForYtdl(rawCookies);
            console.log(`✅ Returning ${formattedCookies.length} formatted cookies`);
            return formattedCookies;
            
        } catch (error) {
            console.error('❌ Error getting cookies:', error.message);
            // Emergency fallback - generate fresh cookies
            const emergencyCookies = this.generateFreshCookies();
            return this.formatCookiesForYtdl(emergencyCookies);
        }
    }

    // Method to update cookies from browser (manual) - saves as user cookies
    updateCookiesFromBrowser(cookieString) {
        try {
            const cookies = [];
            const pairs = cookieString.split(';');
            
            for (const pair of pairs) {
                const [name, value] = pair.split('=').map(s => s.trim());
                if (name && value) {
                    cookies.push({ name, value });
                }
            }
            
            // Save as user cookies instead of auto cookies
            this.saveUserCookies(cookies);
            return true;
        } catch (error) {
            console.error('Failed to parse cookie string:', error.message);
            return false;
        }
    }

    // Generate random session cookies
    generateRandomCookies() {
        const randomString = (length) => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        };

        return [
            { name: 'VISITOR_INFO1_LIVE', value: Buffer.from(randomString(8)).toString('base64') },
            { name: 'YSC', value: randomString(11) },
            { name: 'CONSENT', value: `PENDING+${Math.floor(Math.random() * 1000)}` },
            { name: 'PREF', value: `f4=4000000&hl=en&f5=${Math.floor(Math.random() * 50000)}` },
            { name: 'SOCS', value: 'CAI' }
        ];
    }

    // Test if cookies are working
    async testCookies(cookies, ytdl) {
        try {
            const agent = ytdl.createAgent(cookies);
            // Test with a simple video
            await ytdl.getBasicInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { agent });
            return true;
        } catch (error) {
            return false;
        }
    }

    // Auto-refresh cookies if they're not working
    async refreshIfNeeded(ytdl) {
        const currentCookies = await this.getCurrentCookies();
        
        if (!(await this.testCookies(currentCookies, ytdl))) {
            console.log('🔄 Current cookies not working, generating new ones...');
            
            // Try rotating cookies first
            const rotatingCookies = this.getRotatingCookies();
            if (await this.testCookies(rotatingCookies, ytdl)) {
                this.saveCookies(rotatingCookies);
                return rotatingCookies;
            }
            
            // Try random cookies
            const randomCookies = this.generateRandomCookies();
            if (await this.testCookies(randomCookies, ytdl)) {
                this.saveCookies(randomCookies);
                return randomCookies;
            }
            
            console.warn('⚠️ Could not find working cookies, using defaults');
            return this.getDefaultCookies();
        }
        
        return currentCookies;
    }

    /**
     * Regenerate cookies when there are format issues
     */
    async regenerateCookies() {
        try {
            console.log('🔄 Regenerating cookies due to format issues...');
            
            // Clear current cookie sets
            this.currentCookieSet = [];
            this.lastCookieRotation = 0;
            
            // Generate fresh cookies
            const freshCookies = this.generateFreshCookies();
            
            // Ensure they're properly formatted
            const formattedCookies = this.formatCookiesForYtdl(freshCookies);
            
            console.log(`✅ Regenerated ${formattedCookies.length} properly formatted cookies`);
            return formattedCookies;
            
        } catch (error) {
            console.error('❌ Failed to regenerate cookies:', error.message);
            return [];
        }
    }

    // Clear all cookies
    clearCookies() {
        this.cookies = this.getDefaultCookies();
        try {
            if (fs.existsSync(this.cookieFile)) {
                fs.unlinkSync(this.cookieFile);
            }
        } catch (error) {
            console.error('Failed to delete cookie file:', error.message);
        }
    }

    // Get cookie stats
    getStats() {
        return {
            cookieCount: this.cookies.length,
            lastRefresh: new Date(this.lastRefresh).toISOString(),
            nextRefresh: new Date(this.lastRefresh + this.refreshInterval).toISOString(),
            cookieFile: this.cookieFile,
            fileExists: fs.existsSync(this.cookieFile)
        };
    }

    // Check if we have valid cookies configured (not just default ones)
    async hasValidCookies() {
        try {
            if (!this.cookies || !Array.isArray(this.cookies) || this.cookies.length === 0) {
                return false;
            }

            // Check if cookies are not just the default test cookies
            const hasRealCookies = this.cookies.some(cookie => 
                cookie.value && 
                cookie.value !== 'dGVzdA' && // Old default test value
                cookie.value !== 'dGVzdEM' && // Old user's test value
                cookie.value !== 'dGVzdEI' && // Old test value
                cookie.value.length > 5 && // Real cookies are usually longer
                !cookie.value.startsWith('test') // Avoid test cookies
            );

            // Fix: Be more strict about what constitutes "valid" cookies
            // Only return true if we have real cookies, not just default ones
            return hasRealCookies;
        } catch (error) {
            console.warn('Error checking cookie validity:', error.message);
            return false;
        }
    }

    // Method to get mode information
    getModeInfo() {
        return this.modeManager.getModeInfo();
    }

    // Method to check if cookies are available for current mode
    areCookiesAvailable() {
        const mode = this.getCurrentMode();
        
        // Legacy mode doesn't use cookies
        if (mode === 'legacy') {
            return false;
        }
        
        if (mode === 'custom-cookie') {
            return this.loadUserCookies().length > 0;
        }
        
        return true; // Auto-cookie modes always have cookies available
    }

    // Method to set the cookie mode (updates environment variable)
    setMode(newMode) {
        const validModes = Object.values(this.MODES);
        if (!validModes.includes(newMode)) {
            throw new Error(`Invalid mode: ${newMode}. Valid modes are: ${validModes.join(', ')}`);
        }
        
        // Update the environment variable
        process.env.YOUTUBE_COOKIE_MODE = newMode;
        
        // Reload cookies for the new mode
        this.cookies = this.loadCookies();
        
        console.log(`✅ Cookie mode switched to: ${newMode}`);
        return true;
    }
}

module.exports = new CookieManager();
