const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require("discord.js");
const axios = require("axios");
const { wellcome_message_color, wellcome_title, wellcome_message } = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Welcome message for the new member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription("Tag the user to send the welcome message")
                .setRequired(true)
        ),

    async execute(client, interaction, options) {
        const user = interaction.options.getUser('user');
        const useridtag = user.tag;
        console.log(user);
        console.log(useridtag);

        const embed = new MessageEmbed()
            .setColor(wellcome_message_color)
            .setTitle(`${wellcome_title} ${user}`)
            .setDescription(`${wellcome_message}`);

        // Reply with the embed
        await interaction.reply({ embeds: [embed] });
    }
}
