const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Database = require('../utils/database.js');
const musicPlayer = require('../utils/musicPlayer.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue'),
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const db = new Database();
        
        const queue = await db.getQueue(guildId);
        const currentSong = musicPlayer.getCurrentSong(guildId);
        
        const embed = new EmbedBuilder()
            .setTitle('🎵 Music Queue')
            .setColor(0x0099FF);
        
        if (currentSong) {
            embed.addFields({
                name: '🎶 Now Playing',
                value: `**${currentSong.title}** by ${currentSong.author}\nRequested by: ${currentSong.requestedBy}`,
                inline: false
            });
        }
        
        if (queue.length > 0) {
            const queueList = queue.slice(0, 10).map((song, index) => 
                `${index + 1}. **${song.title}** by ${song.author}`
            ).join('\n');
            
            embed.addFields({
                name: `📝 Up Next (${queue.length} songs)`,
                value: queueList,
                inline: false
            });
            
            if (queue.length > 10) {
                embed.setFooter({ text: `... and ${queue.length - 10} more songs` });
            }
        } else if (!currentSong) {
            embed.setDescription('The queue is empty. Use `/play` to add songs!');
        }
        
        await interaction.reply({ embeds: [embed] });
    },
};
