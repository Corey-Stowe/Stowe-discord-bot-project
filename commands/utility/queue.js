const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { queue } = require('./play.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('List the current queue of tracks'),

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
        if (!queue || queue.length === 0) {
            return interaction.reply('There is no track in the queue');
        } else {
            const embeds = [];
        
            // Loop through each entry in the queue map
            queue.forEach((queueItems, guildID) => {
                // Only show queues with more than 1 item
                if (queueItems.length >= 1) {
                    const guildEmbed = new MessageEmbed()
                        .setColor('#0099ff')
                        .setTitle(`**♪ | Next song:**`)
        
                    // Loop through each item in the queue array
                    let count = 0;
                    let totalLength = 0;
                    queueItems.forEach((item, index) => {
                        // Only add up to 10 items
                        if (count < 10) {
                            const formattedDuration = `${Math.floor(item.length / 60000)}:${(item.length % 60000 / 1000).toFixed(0).padStart(2, '0')}`;
                            guildEmbed.addFields({
                                name: `Track ${index + 1}`,
                                value: `**[${item.title}](${item.uri})**\nDuration: ${formattedDuration}`,
                            });
                            count++;
                            totalLength += item.length;
    
                        }
                    });
                    const formattedTotalLength = `${Math.floor(totalLength / 60000)}:${(totalLength % 60000 / 1000).toFixed(0).padStart(2, '0')}`;
                    guildEmbed.addFields({
                        name: 'Total Tracks Duration',
                        value: `${formattedTotalLength}`
                    });
                    embeds.push(guildEmbed);
                }
            });
        
            // Check if there are no queues with more than 1 item
            if (embeds.length === 0) {
                return interaction.reply('There is no queue with more than 1 item');
            } else {
                // Reply with the embeds
                await interaction.reply({ embeds });
            }
        }
        }
};
