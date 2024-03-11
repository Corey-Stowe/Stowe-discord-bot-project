const { MessageActionRow, MessageButton, MessageEmbed } = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');
const axios = require("axios");

module.exports = {
    data: new SlashCommandBuilder()
    .setName('matchdetail')
    .setDescription('Get match details of the Valorant player by match id 1 to 20')
    .addStringOption(option =>
        option.setName('playerinfo')
            .setDescription("Enter the player information in the format 'username#tag'")
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('matchid')
            .setDescription('Enter the match ID (1 to 20)')
            .setRequired(true)
            ),
        async execute(interaction) {
        try {
            const playerInfo = interaction.options.getString("playerinfo");
            const matchId = interaction.options.getInteger("matchid");
            const [username, tag] = playerInfo.split("#");
            const encodedUsername = encodeURIComponent(username);
            const encodedTag = encodeURIComponent(tag);
            const apiUrl = `https://api.stoweteam.dev/profile/match-detail/${encodedUsername}?number=${encodedTag}&matchid=${matchId}`;
            const response = await axios.get(apiUrl);
            console.log(response.data);
           //deafut value clutchs and clutches lost
            if(response.data.clutches === null){
                response.data.clutches = 0;
            }
            if(response.data.clutchesLost === null){
                response.data.clutchesLost = 0;
            }
            if (response.data.player) {
            const embed = new MessageEmbed()
                .setColor(0x0099FF)
                .setTitle(`${response.data.player} match ${matchId} competitive Information`)
                .setDescription('Match information')
                .addFields(
                    { name: 'Time stamp', value: `${response.data.date}`},
                    { name: 'Map name', value: `${response.data.mapName}` , inline: true },
                    { name: 'Result', value: `${response.data.result}`,inline: true },
                    { name: 'Agent', value: `${response.data.agentName}`},
                    { name: 'Toal time played', value: `${response.data.timeplayed}` },
                    { name: 'Rounds Played', value: `${response.data.roundsPlayed}`,inline: true  },
                    { name: 'Round Won', value: `${response.data.roundwon}`,inline: true},
                    { name: 'Round Lost', value: `${response.data.roundlost}`,inline: true},
                    { name: 'Placement', value: `${response.data.placement}` },
                    { name: 'K/D/A', value: `${response.data.kills}/${response.data.deaths}/${response.data.assists}`},
                    { name: 'Headshots Hit', value: `${response.data.headshots}` },
                    { name: 'KAST ', value: `${response.data.kAST}`, inline: true },
                    { name: 'DD/Δ', value: `${response.data.damageDeltaPerRound}`, inline: true },
                    { name: '% Head shot', value: `${response.data.headshotsRate}%` },
                    { name: 'Ace', value: `${response.data.aces}`, inline: true },
                    { name: 'Clutch', value: `${response.data.clutches}`, inline: true },
                    { name: 'Clutch Lost', value: `${response.data.clutchesLost}`, inline: true },
                    { name: 'Flawless', value: `${response.data.flawless}`, inline: true },
                    { name: 'Thrifty', value: `${response.data.thrifty}`, inline: true },

 
                )
        
            interaction.reply({ embeds: [embed] });
        } else {
            const embed = new MessageEmbed()
            .setColor("RED")
            .setTitle('Player not found or profile is private')
            .setDescription('If you want check a player contain special characher this bot can not checked it, or the player may have set their profile to private.');

        interaction.reply({ embeds: [embed] });
        }
        } catch (error) {
            console.error("Error fetching player information:", error);
            interaction.reply("There was an error fetching player information. Please try again later.");
        }
    },
}