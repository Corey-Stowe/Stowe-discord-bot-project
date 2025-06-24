const { SlashCommandBuilder } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playing music and clear the queue'),
    async execute(interaction) {
        const guildId = interaction.guild.id;
        
        // Check if user is in a voice channel
        if (!interaction.member.voice.channel) {
            return interaction.reply('You need to be in a voice channel to use this command!');
        }
        
        const currentSong = musicPlayer.getCurrentSong(guildId);
        if (!currentSong) {
            return interaction.reply('Nothing is currently playing!');
        }
        
        const success = await musicPlayer.stop(guildId);
        if (success) {
            await interaction.reply('⏹️ Stopped playing music and cleared the queue.');
        } else {
            await interaction.reply('Failed to stop the music.');
        }
    },
};
