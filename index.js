const fs = require('fs');
const path = require('path');
const { Client, Collection, Intents } = require('discord.js');
const {Manager} = require('lavacord');
const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES ]});
const { id, host, port, password , token} = require('./config.json');
const nodes = [{ id, host, port, password }];
//commandloader
client.commands = new Collection();
client.queue = new Map();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if ('data' in command && 'execute' in command) {

            client.commands.set(command.data.name, command);

        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
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
        await command.execute(client, interaction);
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


//lavalink
//lavalinkconn
const lavalink = new Manager(nodes, {
    user: Buffer.from(token.split(".")[0], "base64").toString("utf8"), // This just gets the client ID without needing to wait for ready since the first part of the token is the client ID
    send: packet => {
      const guild = client.guilds.cache.get(packet.d.guild_id);
      if (guild) {
        guild.shard.send(packet);
        return true;
      } else return false
    }
});
client.ws.on("VOICE_SERVER_UPDATE", p => lavalink.voiceServerUpdate(p));
client.ws.on("VOICE_STATE_UPDATE", p => lavalink.voiceStateUpdate(p));
client.manager = lavalink;
async function connectLavalink() {
    try {
        await lavalink.connect();
        console.log('Lavalink connected');
    } catch (error) {
        console.error('Lavalink not connected');
    }
}
async function purgecahe(){
    const directory = 'cache';
    fs.readdir(directory, (err, files) => {
        if (err) throw err;
      
        for (const file of files) {
          fs.unlink(path.join(directory, file), err => {
            if (err) throw err;
          });
        }
        if (files.length === 0){
            console.log("Cache is empty")
        } else {
            console.log("Cache purged")
        }
      });
}
client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    client.commands.forEach(command => {
        console.log(`Command /${command.data.name} loaded.`);

    });
    connectLavalink()
   purgecahe()

});
client.login(token);
exports.client = client;
exports.lavalink = lavalink;   
