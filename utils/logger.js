const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logLevels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3,
            TRACE: 4
        };
        
        this.currentLevel = process.env.LOG_LEVEL ? 
            this.logLevels[process.env.LOG_LEVEL.toUpperCase()] : 
            this.logLevels.INFO;
            
        this.colors = {
            ERROR: '\x1b[31m', // Red
            WARN: '\x1b[33m',  // Yellow
            INFO: '\x1b[36m',  // Cyan
            DEBUG: '\x1b[35m', // Magenta
            TRACE: '\x1b[37m', // White
            SUCCESS: '\x1b[32m', // Green
            RESET: '\x1b[0m'
        };
        
        this.logDir = path.join(__dirname, '../logs');
        this.ensureLogDirectory();
    }
    
    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    formatTimestamp() {
        return new Date().toISOString().replace('T', ' ').substr(0, 19);
    }
    
    formatMessage(level, category, message, data = null) {
        const timestamp = this.formatTimestamp();
        const color = this.colors[level] || this.colors.INFO;
        const reset = this.colors.RESET;
        
        let formattedMessage = `${color}[${timestamp}] ${level.padEnd(5)} [${category}]${reset} ${message}`;
        
        if (data) {
            if (typeof data === 'object') {
                formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
            } else {
                formattedMessage += ` ${data}`;
            }
        }
        
        return formattedMessage;
    }
    
    shouldLog(level) {
        return this.logLevels[level] <= this.currentLevel;
    }
    
    writeToFile(level, category, message, data = null) {
        try {
            const timestamp = this.formatTimestamp();
            const logEntry = {
                timestamp,
                level,
                category,
                message,
                data: data || undefined
            };
            
            const logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
            const logLine = JSON.stringify(logEntry) + '\n';
            
            fs.appendFileSync(logFile, logLine);
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }
    
    log(level, category, message, data = null) {
        if (!this.shouldLog(level)) return;
        
        const formattedMessage = this.formatMessage(level, category, message, data);
        console.log(formattedMessage);
        
        // Also write to file
        this.writeToFile(level, category, message, data);
    }
    
    error(category, message, data = null) {
        this.log('ERROR', category, message, data);
    }
    
    warn(category, message, data = null) {
        this.log('WARN', category, message, data);
    }
    
    info(category, message, data = null) {
        this.log('INFO', category, message, data);
    }
    
    debug(category, message, data = null) {
        this.log('DEBUG', category, message, data);
    }
    
    trace(category, message, data = null) {
        this.log('TRACE', category, message, data);
    }
    
    success(category, message, data = null) {
        if (!this.shouldLog('INFO')) return;
        
        const timestamp = this.formatTimestamp();
        const color = this.colors.SUCCESS;
        const reset = this.colors.RESET;
        
        let formattedMessage = `${color}[${timestamp}] ✅    [${category}]${reset} ${message}`;
        
        if (data) {
            if (typeof data === 'object') {
                formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
            } else {
                formattedMessage += ` ${data}`;
            }
        }
        
        console.log(formattedMessage);
        this.writeToFile('SUCCESS', category, message, data);
    }
    
    // Special methods for specific use cases
    command(commandName, user, guild, success = true) {
        const status = success ? '✅' : '❌';
        const level = success ? 'INFO' : 'WARN';
        this.log(level, 'COMMAND', `${status} /${commandName}`, {
            user: user.tag,
            userId: user.id,
            guild: guild?.name || 'DM',
            guildId: guild?.id || null
        });
    }
    
    economy(action, user, amount, balance) {
        this.info('ECONOMY', `💰 ${action}`, {
            user: user.tag,
            userId: user.id,
            amount,
            newBalance: balance
        });
    }
    
    music(action, guild, song = null) {
        this.info('MUSIC', `🎵 ${action}`, {
            guild: guild.name,
            guildId: guild.id,
            song: song ? {
                title: song.title,
                author: song.author,
                duration: song.duration
            } : null
        });
    }
    
    giftCode(action, code, user, amount = null) {
        this.info('GIFT', `🎁 ${action}`, {
            code,
            user: user.tag,
            userId: user.id,
            amount
        });
    }
    
    system(message, data = null) {
        this.info('SYSTEM', `🔧 ${message}`, data);
    }
    
    cache(action, details = null) {
        this.debug('CACHE', `🗂️ ${action}`, details);
    }
    
    database(action, details = null) {
        this.debug('DATABASE', `💾 ${action}`, details);
    }
    
    voice(action, guild, channel = null) {
        this.info('VOICE', `🔊 ${action}`, {
            guild: guild.name,
            guildId: guild.id,
            channel: channel?.name || null,
            channelId: channel?.id || null
        });
    }
    
    // Clean old log files (keep last 7 days)
    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            
            let cleaned = 0;
            for (const file of files) {
                if (file.endsWith('.log')) {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (now - stats.mtime.getTime() > maxAge) {
                        fs.unlinkSync(filePath);
                        cleaned++;
                    }
                }
            }
            
            if (cleaned > 0) {
                this.system(`Cleaned ${cleaned} old log files`);
            }
        } catch (error) {
            this.error('LOGGER', 'Failed to clean old logs', error);
        }
    }
    
    // Get log statistics
    getStats() {
        try {
            const files = fs.readdirSync(this.logDir);
            const logFiles = files.filter(file => file.endsWith('.log'));
            
            let totalSize = 0;
            let totalLines = 0;
            
            for (const file of logFiles) {
                const filePath = path.join(this.logDir, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;
                
                const content = fs.readFileSync(filePath, 'utf8');
                totalLines += content.split('\n').length - 1;
            }
            
            return {
                files: logFiles.length,
                totalSize: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                totalLines,
                currentLevel: Object.keys(this.logLevels).find(key => 
                    this.logLevels[key] === this.currentLevel
                )
            };
        } catch (error) {
            this.error('LOGGER', 'Failed to get log stats', error);
            return null;
        }
    }
}

// Export singleton instance
module.exports = new Logger();
