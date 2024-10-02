const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { client } = require('../../index.js');
const { queue } = require('./play.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stops whatever the bot is playing and leaves the voice channel\n(This command will clear the queue)"),
    async execute(client, interaction, options) {
        const member = interaction.member;
        const memberGuild = member.guild;
        const guildID = interaction.guild.id;
        const channelId = member.voice.channel.id;
        if (!member || !member.voice || !member.voice.channel) {
            return interaction.reply({
                content: 'You need to be in a voice channel to use this command.',
                ephemeral: true
            });
        }
        //check if bot in the channel
        const player = client.manager.players.get(guildID);
        if (!player) {
            return interaction.reply({
                embeds: [
                    new MessageEmbed()
                        .setColor("RED")
                        .setDescription("I'm not in a channel."),
                ],
                ephemeral: true,
            });
        }
        //destroy the queue
        queue.delete(guildID);
        await client.manager.leave(guildID);
        const embed = new MessageEmbed()
            .setColor('#0099ff')
            .setDescription(`:wave: | **Bye Bye!**`);
        interaction.reply({ embeds: [embed] });
        
    },
};
