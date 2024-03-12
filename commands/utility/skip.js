const { SlashCommandBuilder } = require('@discordjs/builders');
const { queue } = require('./play.js'); // Import queue from play.js
const { client } = require('../../index.js'); // Import Discord client
const { MessageEmbed } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the currently playing track'),

    async execute(client, interaction, options) {
        const guildID = interaction.guild.id;
        const serverQueue = queue.get(guildID);
        const bot = interaction.guild.members.me; 
        const member = interaction.member;
        if (!member || !member.voice || !member.voice.channel) {
            return interaction.reply({
                embeds: [
                    new MessageEmbed()
                        .setColor("RED")
                        .setTitle("Error")
                        .setDescription("You need to be in a voice channel to use this command."),
                ],
                ephemeral: true,
            });
        }
        if (bot.voice.channel && bot.voice.channel !== member.voice.channel) {  
            return interaction.reply({
                embeds: [
                    new MessageEmbed()
                        .setColor("RED")
                        .setTitle("Error")
                        .setDescription("You need to be in the same voice channel as the bot to use this command"),
                ],
                ephemeral: true,
            });
        }
        //check if bot in the channel
        if (!bot.voice.channel && !bot.voice.channel) {
            return interaction.reply({
                embeds: [
                    new MessageEmbed()
                        .setColor("RED")
                        .setTitle("Error")
                        .setDescription("I'm not in a channel."),
                ],
                ephemeral: true,
            });
        }   
        // console.log(serverQueue);

        // Kiểm tra xem hàng đợi có tồn tại không
        if (!serverQueue || serverQueue.length === "undefined") {
            return interaction.reply('There is no track to skip.');
            
        } else {
            let length = serverQueue.length;
            if (length  >= 1) {
                const currentTrack = serverQueue[0];
                const nextTrack = serverQueue[0];
                console.log(nextTrack);
                const player = client.manager.players.get(guildID);
                await player.play(nextTrack.encodedData);
                serverQueue.shift();
                await interaction.reply(`Skipped the currently playing track: ${currentTrack.title}`);
                
            } else {
                 queue.delete(guildID);
                 const player = client.manager.players.get(guildID);
                  await player.stop();
                await interaction.reply('Skipped the currently playing track and cleared the queue.');
            }

        }

    },
};