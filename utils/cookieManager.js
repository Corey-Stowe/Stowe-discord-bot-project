const fs = require('fs');
const path = require('path');

class CookieManager {
    constructor() {
        // Cookie modes - define first
        this.MODES = {
            AUTO_COOKIE: 'auto-cookie',    // Auto-generate safe cookies
            COOKIE_ONLY: 'cookie-only',    // Only use user-provided cookies
            COOKIES: 'cookies'             // Legacy mode (same as auto-cookie)
        };
        
        this.cookieFile = path.join(__dirname, '../data/youtube_cookies.json');
        this.userCookieFile = path.join(__dirname, '../data/user_cookies.json');
        this.cookies = this.loadCookies();
        this.lastRefresh = Date.now();
        this.refreshInterval = 30 * 60 * 1000; // 30 minutes
    }

    getCurrentMode() {
        // Check new YouTube mode system first
        if (process.env.YOUTUBE_DEFAULT_MODE === 'true') {
            return 'default';
        } else if (process.env.YOUTUBE_AUTO_COOKIE === 'true') {
            return 'auto-cookie';
        } else if (process.env.YOUTUBE_COOKIE_ONLY === 'true') {
            return 'cookie-only';
        }
        
        // Fallback to legacy YOUTUBE_COOKIE_MODE
        const mode = process.env.YOUTUBE_COOKIE_MODE || 'auto-cookie';
        return mode.toLowerCase();
    }

    loadCookies() {
        const mode = this.getCurrentMode();
        
        if (mode === this.MODES.COOKIE_ONLY) {
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
            if (this.getCurrentMode() === this.MODES.COOKIE_ONLY) {
                this.cookies = this.loadUserCookies();
            }
            
            return true;
        } catch (error) {
            console.error('Failed to save user cookies:', error.message);
            return false;
        }
    }

    getDefaultCookies() {
        // More comprehensive default cookie set to avoid bot detection
        return [
            { name: 'VISITOR_INFO1_LIVE', value: 'fPQ4jCL6EiE' },
            { name: 'YSC', value: 'DwKYllHNwuw' },
            { name: 'CONSENT', value: 'YES+cb.20210328-17-p0.en+FX+987' },
            { name: 'PREF', value: 'f4=4000000&hl=en&f5=30000&f6=8&f7=100' },
            { name: 'SOCS', value: 'CAI' },
            { name: 'GPS', value: '1' },
            { name: 'wide', value: '1' },
            { name: 'f5', value: '30000' }
        ];
    }

    // Enhanced cookie sets for different scenarios
    getRotatingCookies() {
        const cookieSets = [
            // Set 1 - Basic with proper consent
            [
                { name: 'VISITOR_INFO1_LIVE', value: 'fPQ4jCL6EiE' },
                { name: 'YSC', value: 'DwKYllHNwuw' },
                { name: 'CONSENT', value: 'YES+cb.20210328-17-p0.en+FX+987' },
                { name: 'PREF', value: 'f4=4000000&hl=en&f5=30000' }
            ],
            // Set 2 - Extended with more realistic values
            [
                { name: 'VISITOR_INFO1_LIVE', value: 'Gt9hom_9_qo' },
                { name: 'YSC', value: 'BwKYllHNwuw' },
                { name: 'CONSENT', value: 'YES+cb.20210421-19-p0.en+FX+123' },
                { name: 'PREF', value: 'f4=4000000&hl=en&f5=30000&f6=8' },
                { name: 'SOCS', value: 'CAI' }
            ],
            // Set 3 - Alternative with GPS
            [
                { name: 'VISITOR_INFO1_LIVE', value: 'kK8hom_8_po' },
                { name: 'YSC', value: 'CwKYllHNwuw' },
                { name: 'CONSENT', value: 'YES+cb.20210515-21-p0.en+FX+456' },
                { name: 'PREF', value: 'f4=4000000&hl=en&f5=30000&f6=8&f7=100' },
                { name: 'SOCS', value: 'CAI' },
                { name: 'GPS', value: '1' },
                { name: 'wide', value: '1' }
            ]
        ];

        const index = Math.floor(Date.now() / this.refreshInterval) % cookieSets.length;
        return cookieSets[index];
    }

    getCurrentCookies() {
        const mode = this.getCurrentMode();
        
        if (mode === this.MODES.COOKIE_ONLY) {
            // Cookie-only mode: only return user-provided cookies
            const userCookies = this.loadUserCookies();
            if (userCookies.length === 0) {
                console.warn('🚫 Cookie-only mode: No user cookies available');
                return [];
            }
            return userCookies;
        }
        
        // Auto-cookie mode (including legacy): rotate cookies periodically to avoid detection
        if (Date.now() - this.lastRefresh > this.refreshInterval) {
            this.cookies = this.getRotatingCookies();
            this.lastRefresh = Date.now();
            console.log('🔄 Auto-rotated cookies for better reliability');
        }
        return this.cookies;
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
        const currentCookies = this.getCurrentCookies();
        
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
        const mode = this.getCurrentMode();
        const info = {
            mode: mode,
            description: '',
            canUseCookies: false,
            requiresUserCookies: false
        };

        switch (mode) {
            case 'default':
                info.description = 'Default Mode (Auto Cookie fallback)';
                info.canUseCookies = true;
                info.requiresUserCookies = false;
                break;
            
            case 'auto-cookie':
            case this.MODES.AUTO_COOKIE:
            case this.MODES.COOKIES:
                info.description = 'Auto Cookie (Safe)';
                info.canUseCookies = true;
                info.requiresUserCookies = false;
                break;
            
            case 'cookie-only':
            case this.MODES.COOKIE_ONLY:
                info.description = 'Custom Cookie (User-provided)';
                info.canUseCookies = true;
                info.requiresUserCookies = true;
                break;
            
            default:
                info.description = 'Unknown mode - defaulting to Auto Cookie';
                info.canUseCookies = true;
                info.requiresUserCookies = false;
        }

        return info;
    }

    // Method to check if cookies are available for current mode
    areCookiesAvailable() {
        const mode = this.getCurrentMode();
        
        if (mode === this.MODES.COOKIE_ONLY) {
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
