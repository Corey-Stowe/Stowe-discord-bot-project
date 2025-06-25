const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const env = require('dotenv').config();

const commands = [];
// Grab all the command files from the commands directory you created earlier
const commandsPath = path.resolve(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

if (!commandFiles.length) {
    console.log('[ERROR] The commands folder is missing or contains no command files.');
    process.exit(1);
}

console.log(`📁 Found ${commandFiles.length} command files:`);
commandFiles.forEach(file => console.log(`  - ${file}`));

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠️  [WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    } catch (error) {
        console.log(`❌ [ERROR] Failed to load command from ${filePath}:`, error.message);
    }
}

// Validate environment variables
if (!process.env.TOKEN) {
    console.log('❌ [ERROR] TOKEN is not set in .env file');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.log('❌ [ERROR] CLIENT_ID is not set in .env file');
    process.exit(1);
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.TOKEN);

// Deploy commands
(async () => {
    try {
        console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

        // Determine deployment scope
        let data;
        if (process.env.GUILD_ID) {
            // Deploy to specific guild (faster for development)
            console.log(`🎯 Deploying to guild: ${process.env.GUILD_ID}`);
            data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands },
            );
        } else {
            // Deploy globally (takes up to 1 hour to propagate)
            console.log(`🌐 Deploying globally (may take up to 1 hour to propagate)`);
            data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands },
            );
        }

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        console.log(`📋 Deployed commands: ${data.map(cmd => cmd.name).join(', ')}`);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        if (error.code === 50001) {
            console.log('💡 Tip: Make sure your bot has the "applications.commands" scope');
        }
    }
})();