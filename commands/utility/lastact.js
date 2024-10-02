const { MessageActionRow, MessageButton, MessageEmbed } = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');
const axios = require("axios");

module.exports = {
    data: new SlashCommandBuilder()
    .setName("lastact")
    .setDescription("Get the preious act valorant player competitive information")
    .addStringOption(option =>
        option
            .setName("lastact")
            .setDescription("Enter the player information in the format 'username#tag'")
            .setRequired(true)
    ),
    async execute(client, interaction, options) {
        try {
            const playerInfo = interaction.options.getString("playerinfo");
            const [username, tag] = playerInfo.split("#");
            const encodedUsername = encodeURIComponent(username);
            const encodedTag = encodeURIComponent(tag);
            const embed = new MessageEmbed()
            .setColor(0x0099FF)
            .setTitle(`Getting ${playerInfo} Information`)
            interaction.reply({ embeds: [embed] });
            const apiUrl = `http://localhost/vlrapi/profile/previous-act/${encodedUsername}?number=${encodedTag}`;
            const response = await axios.get(apiUrl);
            console.log(response.data);
    
            // Kiểm tra nếu trường player tồn tại trong phản hồi
            if (response.data.player) {
                const embed = new MessageEmbed()
                    .setColor(0x0099FF)
                    .setTitle(`${response.data.player} Information`)
                    .setDescription('Previous Act Competitive Data Information')
                    .addFields(
                        { name: 'Current rank', value: `${response.data.currentRank}`, inline: true },
                        { name: 'Peak Rank', value: `${response.data.peakRank}` , inline: true },
                        { name: 'Match played', value: `${response.data.matchesPlayed}`},
                        { name: 'Matches won', value: `${response.data.matchesWon}`,inline: true },
                        { name: 'Matches lost', value: `${response.data.matchesLost}`, inline: true },
                        { name: 'Winrate', value: `${response.data.winrate}`,  },
                        { name: 'Time played', value: `${response.data.timeplayed}`,inline: true},
                        { name: 'killsPerRound', value: `${response.data.killsPerRound}`},
                        { name: 'K/D', value: `${response.data.kdRatio}`, inline: true },
                        { name: 'K/D/A Ratio', value: `${response.data.kdaRatio}`, inline: true },
                        { name: 'DD/Δ', value: `${response.data.damageDeltaPerRound}`, inline: true },
                        { name: '% Head shot', value: `${response.data.headshotrate}` },
                        { name: 'Ace', value: `${response.data.ace}`, inline: true },
                        { name: 'Clutch', value: `${response.data.clutch}`, inline: true },
                        {name: `${response.data.act}` }
                    .setfooter({Text:'Player Information',URL:`https://tracker.gg/valorant/profile/riot/${response.data.player}/overview`})
                    );
    
                interaction.editReply({ embeds: [embed] });
            } else {
                const embed = new MessageEmbed()
                    .setColor("RED")
                    .setTitle('Player not found or profile is private')
                    .setDescription('If you want check a player contain special characher this bot can not checked it, or the player may have set their profile to private.');
    
                interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error("Error fetching player information:", error);
            interaction.editReply("There was an error fetching player information. Please try again later.");
        }
    },
}