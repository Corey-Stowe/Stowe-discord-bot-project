const fs = require('fs');
const path = require('path');

class CacheManager {
    constructor(cacheFilePath = path.join(__dirname, '../data/cache.json')) {
        this.cacheFilePath = cacheFilePath;
    }

    /**
     * Clean expired cache entries
     * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
     */
    cleanExpiredCache(maxAge = 24 * 60 * 60 * 1000) {
        try {
            if (!fs.existsSync(this.cacheFilePath)) {
                console.log('Cache file does not exist, nothing to clean');
                return;
            }

            const cacheData = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf8'));
            const now = Date.now();
            let cleanedCount = 0;
            const totalEntries = Object.keys(cacheData).length;

            // Filter out expired entries
            const cleanedCache = {};
            for (const [key, value] of Object.entries(cacheData)) {
                if (value.cachedAt && (now - value.cachedAt) < maxAge) {
                    cleanedCache[key] = value;
                } else {
                    cleanedCount++;
                }
            }

            // Write cleaned cache back to file
            fs.writeFileSync(this.cacheFilePath, JSON.stringify(cleanedCache, null, 2));
            
            console.log(`Cache cleaned: Removed ${cleanedCount}/${totalEntries} expired entries`);
            console.log(`Remaining cache entries: ${Object.keys(cleanedCache).length}`);
        } catch (error) {
            console.error('Error cleaning cache:', error);
        }
    }

    /**
     * Clear all cache entries
     */
    clearAllCache() {
        try {
            fs.writeFileSync(this.cacheFilePath, '{}');
            console.log('All cache entries cleared');
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        try {
            if (!fs.existsSync(this.cacheFilePath)) {
                return { totalEntries: 0, totalSize: 0 };
            }

            const stats = fs.statSync(this.cacheFilePath);
            const cacheData = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf8'));
            
            return {
                totalEntries: Object.keys(cacheData).length,
                totalSize: stats.size,
                filePath: this.cacheFilePath
            };
        } catch (error) {
            console.error('Error getting cache stats:', error);
            return { totalEntries: 0, totalSize: 0 };
        }
    }
}

module.exports = CacheManager;
