const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const env = require('dotenv').config();

// Validate environment variables
if (!process.env.DISCORD_TOKEN) {
    console.log('❌ [ERROR] DISCORD_TOKEN is not set in .env file');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.log('❌ [ERROR] CLIENT_ID is not set in .env file');
    process.exit(1);
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Remove all commands
(async () => {
    try {
        console.log('🗑️  Starting to delete all application commands...');

        if (process.env.GUILD_ID) {
            // Delete guild commands
            console.log(`🎯 Deleting guild commands for: ${process.env.GUILD_ID}`);
            await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] });
            console.log('✅ Successfully deleted all guild commands.');
        } else {
            // Delete global commands
            console.log('🌐 Deleting global commands...');
            await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
            console.log('✅ Successfully deleted all global commands.');
        }

        // Also try to delete both global and guild commands if GUILD_ID is set
        if (process.env.GUILD_ID) {
            console.log('🌐 Also deleting global commands...');
            await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
            console.log('✅ Successfully deleted all global commands.');
        }

    } catch (error) {
        console.error('❌ Error deleting commands:', error);
        if (error.code === 50001) {
            console.log('💡 Tip: Make sure your bot has the "applications.commands" scope');
        }
    }
})();