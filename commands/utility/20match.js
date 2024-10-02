const { MessageActionRow, MessageButton, MessageEmbed } = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');
const axios = require("axios");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("matchhistory")
    .setDescription("Get the 20 match history of the Valorant player")
    .addStringOption((option) =>
      option.setName("playerinfo")
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
      const apiUrl = `http://localhost/vlrapi/profile/list-match/${encodedUsername}?number=${encodedTag}`;

      const response = await axios.get(apiUrl);
      console.log(response.data);

      if (Array.isArray(response.data) && response.data.length > 0) {
        const matchesPerPage = 5; // Number of matches to display per page
        let currentPage = 0;

        const displayMatches = () => {
          const startIdx = currentPage * matchesPerPage;
          const endIdx = Math.min(startIdx + matchesPerPage, response.data.length);
          const pageMatches = response.data.slice(startIdx, endIdx);

          const embed = new MessageEmbed()
            .setColor(0x0099FF)
            .setTitle(`${response.data[0].player}'s Match History Information`)
            .setDescription(`Page ${currentPage + 1}/${Math.ceil(response.data.length / matchesPerPage)}`)
            .addFields(
              pageMatches.map((match) => ({
                name: `Match ${match.id}`,
                value: `Map: ${match.mapName}\nResult: ${match.result}\nAgent: ${match.agentName}\nK/D/A: ${match.kills}/${match.deaths}/${match.assists}`,
              }))
            );

          return embed;
        };

        const interactionReply = await interaction.editReply({
          embeds: [displayMatches()],
          components: [getButtons()],
        });

        const collector = interaction.channel.createMessageComponentCollector({
          componentType: "BUTTON",
          time: 60000,
        });

        collector.on("collect", async (buttonInteraction) => {
          if (buttonInteraction.customId === "prev_page") {
            currentPage = Math.max(currentPage - 1, 0);
          } else if (buttonInteraction.customId === "next_page") {
            currentPage = Math.min(currentPage + 1, Math.ceil(response.data.length / matchesPerPage) - 1);
          }

          await buttonInteraction.update({ embeds: [displayMatches()] });
        });

        collector.on("end", () => {
          if (interactionReply) {
              interactionReply.edit({ components: [] });
          }
      });
      } else {
        const embed = new MessageEmbed()
          .setColor("RED")
          .setTitle("Player not found or profile is private")
          .setDescription(
            "If you want to check a player containing special characters, this bot cannot check it, or the player may have set their profile to private."
          );

        interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("Error fetching player information:", error);
      interaction.editReply("There was an error fetching player information. Please try again later.");
    }
  }
};

const getButtons = () => {
  return new MessageActionRow().addComponents(
    new MessageButton()
      .setCustomId("prev_page")
      .setLabel("Previous Page")
      .setStyle("PRIMARY"),
    new MessageButton()
      .setCustomId("next_page")
      .setLabel("Next Page")
      .setStyle("PRIMARY")
  );
};
