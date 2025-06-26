const fs = require('fs');
const path = require('path');
const env = require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const CacheManager = require('./src/utils/cacheManager');
const musicPlayer = require('./utils/musicPlayer');
const preset24h = require('./utils/preset24h');
const logger = require('./utils/logger');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
})

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

logger.system('Loading commands...');
let loadedCommands = 0;
let failedCommands = 0;

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            logger.debug('LOADER', `✅ Loaded command: ${command.data.name}`);
            loadedCommands++;
        } else {
            logger.warn('LOADER', `❌ Invalid command structure: ${file}`, {
                missingData: !('data' in command),
                missingExecute: !('execute' in command)
            });
            failedCommands++;
        }
    } catch (error) {
        logger.error('LOADER', `❌ Failed to load command: ${file}`, error);
        failedCommands++;
    }
}

logger.success('LOADER', `Commands loaded: ${loadedCommands} success, ${failedCommands} failed`);

// Initialize cache manager
const cacheManager = new CacheManager();

client.once('ready', () => {
    logger.success('BOT', `Logged in as ${client.user.tag}!`);
    
    // Auto clean cache and downloads on startup
    logger.system('Cleaning expired cache entries and old downloads...');
    cacheManager.cleanExpiredCache();
    
    // Clean old downloads (24h rule on startup)
    const deletedCount = musicPlayer.cleanDownloads(false);
    logger.cache(`Cleaned ${deletedCount} old download files`);
    
    // Auto-scan preset music directory
    logger.system('Scanning preset music directory...');
    const playlistStats = preset24h.updatePlaylist();
    logger.music('Playlist Updated', client, {
        totalSongs: playlistStats.totalSongs,
        totalSizeMB: (playlistStats.totalSize / (1024 * 1024)).toFixed(2)
    });
    
    // Display stats
    const cacheStats = cacheManager.getCacheStats();
    const downloadStats = musicPlayer.getDownloadStats();
    logger.system('Startup Stats', {
        cacheEntries: cacheStats.totalEntries,
        cacheSizeKB: (cacheStats.totalSize / 1024).toFixed(2),
        downloadsSizeMB: downloadStats.sizeMB,
        commands: loadedCommands,
        guilds: client.guilds.cache.size
    });
    
    // Clean old logs on startup
    logger.cleanOldLogs();
    
    logger.success('BOT', '🚀 Bot is ready and operational!');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.member) {
        logger.error('INTERACTION', 'Interaction missing member property', {
            commandName: interaction.commandName,
            userId: interaction.user?.id,
            guildId: interaction.guild?.id
        });
        return;
    }

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        // Special handling for admin users - allow them to execute admin commands even if not registered
        if (interaction.user.id === process.env.ADMIN_ID) {
            logger.warn('COMMAND', `Admin attempting unregistered command: ${interaction.commandName}`, {
                user: interaction.user.tag,
                userId: interaction.user.id,
                guild: interaction.guild?.name
            });
            
            await interaction.reply({
                content: `⚠️ Command \`/${interaction.commandName}\` is not registered in Discord.\n\n` +
                        `**Possible solutions:**\n` +
                        `• Deploy admin commands: \`npm run deploy-admin\`\n` +
                        `• Deploy all commands: \`npm run deploy-all\`\n` +
                        `• Manual admin deployment: \`node slashbuilder-admin.js --admin --user=${process.env.ADMIN_ID}\`\n\n` +
                        `**Available admin commands:** youtube, admin24h, admingift, economyadmin, cleancache, cookies, youtubemode`,
                ephemeral: true
            });
        } else {
            logger.error('COMMAND', `Unknown command: ${interaction.commandName}`, {
                user: interaction.user.tag,
                guild: interaction.guild?.name
            });
        }
        return;
    }

    // Check if command is admin-only
    if (command.adminOnly && interaction.user.id !== process.env.ADMIN_ID) {
        await interaction.reply({
            content: '❌ You do not have permission to use this command.',
            ephemeral: true
        });
        logger.warn('COMMAND', `Unauthorized admin command attempt: ${interaction.commandName}`, {
            user: interaction.user.tag,
            userId: interaction.user.id,
            guild: interaction.guild?.name
        });
        return;
    }

    const startTime = Date.now();
    
    try {
        await command.execute(interaction);
        const executionTime = Date.now() - startTime;
        
        logger.command(interaction.commandName, interaction.user, interaction.guild, true);
        
        if (executionTime > 3000) { // Log slow commands
            logger.warn('PERFORMANCE', `Slow command execution: /${interaction.commandName}`, {
                executionTime: `${executionTime}ms`,
                user: interaction.user.tag,
                guild: interaction.guild?.name
            });
        }
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        logger.error('COMMAND', `Command execution failed: /${interaction.commandName}`, {
            error: error.message,
            stack: error.stack,
            executionTime: `${executionTime}ms`,
            user: interaction.user.tag,
            userId: interaction.user.id,
            guild: interaction.guild?.name,
            guildId: interaction.guild?.id
        });
        
        logger.command(interaction.commandName, interaction.user, interaction.guild, false);
        
        try {
            const errorMessage = 'There was an error while executing this command!';
            
            // Check interaction state and respond appropriately
            if (interaction.deferred || interaction.replied) {
                // If already deferred or replied, use editReply
                await interaction.editReply({
                    content: errorMessage,
                    flags: [4096] // Ephemeral flag
                });
            } else {
                // If not yet responded, send initial reply
                await interaction.reply({
                    content: errorMessage,
                    flags: [4096] // Ephemeral flag
                });
            }
        } catch (replyError) {
            logger.error('INTERACTION', 'Failed to send error reply', {
                requestBody: replyError.requestBody,
                rawError: replyError.rawError,
                code: replyError.code,
                status: replyError.status,
                method: replyError.method,
                url: replyError.url
            });
        }
    }
});

// Enhanced error handlers
client.on('error', (error) => {
    logger.error('CLIENT', 'Discord client error', error);
});

client.on('warn', (warning) => {
    logger.warn('CLIENT', 'Discord client warning', warning);
});

client.on('debug', (debug) => {
    logger.trace('CLIENT', debug);
});

// Voice state logging
client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.channelId !== newState.channelId) {
        if (!oldState.channelId && newState.channelId) {
            // User joined voice
            logger.voice('User joined', newState.guild, newState.channel);
        } else if (oldState.channelId && !newState.channelId) {
            // User left voice
            logger.voice('User left', oldState.guild, oldState.channel);
        } else {
            // User moved channels
            logger.voice('User moved', newState.guild, newState.channel);
        }
    }
});

// Graceful shutdown with logging
process.on('SIGINT', () => {
    logger.warn('SYSTEM', '🔄 Bot shutting down (SIGINT)...');
    
    // Log final stats
    const logStats = logger.getStats();
    if (logStats) {
        logger.system('Final session stats', logStats);
    }
    
    // Optional: clean cache on shutdown
    // cacheManager.cleanExpiredCache();
    
    logger.success('SYSTEM', '👋 Bot shutdown complete');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.warn('SYSTEM', '🔄 Bot terminating (SIGTERM)...');
    
    // Log final stats
    const logStats = logger.getStats();
    if (logStats) {
        logger.system('Final session stats', logStats);
    }
    
    logger.success('SYSTEM', '👋 Bot termination complete');
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('SYSTEM', 'Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('SYSTEM', 'Unhandled Promise Rejection', {
        reason,
        promise
    });
});

// Login to Discord with your client's token
logger.info('BOT', 'Starting bot login...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
    logger.error('BOT', 'Failed to login', error);
    process.exit(1);
});