const fs = require('fs');
const path = require('path');
const env = require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const CacheManager = require('./src/utils/cacheManager');
const musicPlayer = require('./utils/musicPlayer');
const preset24h = require('./utils/preset24h');

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

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Initialize cache manager
const cacheManager = new CacheManager();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // Auto clean cache and downloads on startup
    console.log('🧹 Cleaning expired cache entries and old downloads...');
    cacheManager.cleanExpiredCache();
    
    // Clean old downloads (24h rule on startup)
    const deletedCount = musicPlayer.cleanDownloads(false);
    console.log(`📁 Cleaned ${deletedCount} old download files`);
    
    // Auto-scan preset music directory
    console.log('🎵 Scanning preset music directory...');
    const playlistStats = preset24h.updatePlaylist();
    console.log(`📊 Found ${playlistStats.totalSongs} preset songs (${(playlistStats.totalSize / (1024 * 1024)).toFixed(2)} MB)`);
    
    // Display stats
    const cacheStats = cacheManager.getCacheStats();
    const downloadStats = musicPlayer.getDownloadStats();
    console.log(`📊 Cache Stats: ${cacheStats.totalEntries} entries, ${(cacheStats.totalSize / 1024).toFixed(2)} KB`);
    console.log(`📊 Downloads: ${downloadStats.sizeMB} MB used`);
    
    console.log('✅ Bot is ready!');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.member) {
        console.error('Interaction does not have a member property:', interaction);
        return;
    }

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: 'There was an error while executing this command!',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: 'There was an error while executing this command!',
                ephemeral: true
            });
        }
    }
});

// Graceful shutdown - optional: clean cache on shutdown too
process.on('SIGINT', () => {
    console.log('🔄 Bot shutting down...');
    // Optionally clean cache on shutdown
    // cacheManager.cleanExpiredCache();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🔄 Bot terminating...');
    // Optionally clean cache on shutdown
    // cacheManager.cleanExpiredCache();
    process.exit(0);
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);