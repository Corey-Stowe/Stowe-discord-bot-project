const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
    console.error('Error: DISCORD_TOKEN and CLIENT_ID must be set in .env');
    process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    try {
        const command = require(path.join(commandsPath, file));
        if ('data' in command) {
            commands.push(command.data.toJSON());
            console.log(`Loaded: /${command.data.name}`);
        }
    } catch (error) {
        console.error(`Failed to load ${file}:`, error.message);
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Deploying ${commands.length} commands...`);

        if (process.env.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
            console.log(`Deployed to guild: ${process.env.GUILD_ID}`);
        } else {
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
            console.log('Deployed globally (may take up to 1 hour to propagate)');
        }

        console.log('Done!');
    } catch (error) {
        console.error('Deployment error:', error);
    }
})();
