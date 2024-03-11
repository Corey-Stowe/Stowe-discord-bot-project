const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { client } = require('../../index.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('List the current queue of tracks'),

    async execute(client, interaction, options) {
        const member = interaction.member;
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
        //check if user in the same channel
        if (player && channelId !== player.voiceChannel) {
            return interaction.reply({
                embeds: [
                    new MessageEmbed()
                        .setColor("RED")
                        .setDescription("You need to be in my voice channel to use this command."),
                ],
                ephemeral: true,
            });
        }
        console.log(guildID);
        console.log(channelId);
    }
};
