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

        // Check if there are tracks in the queue
        if (!serverQueue || serverQueue.length === 0) {
            return interaction.reply('There is no track to skip.');
        }

        const player = client.manager.players.get(guildID);

        // Set the end event listener only once
        player.once("end", async (data) => {
            if (data.type === "TrackEndEvent" && data.reason !== "replaced") {
                // If there are more tracks in the queue, play the next one
                if (serverQueue.length > 0) {
                    const nextTrack = serverQueue[0];
                    await player.play(nextTrack.encodedData);
                    serverQueue.shift();
                } else {
                    // No more tracks in the queue, perform any desired action (e.g., stop playback)
                    queue.delete(guildID);
                    client.manager.leave(guildID);
                }
            }
        });

        // Skip the current track
        const currentTrack = serverQueue[0];
        player.stop(); // Stop the current track immediately

    },
};
