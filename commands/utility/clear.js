const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { queue } = require('./play.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('clear the queue pending tracks'),

    async execute(client, interaction, options) {
        const guildID = interaction.guild.id;
        const serverQueue = queue.get(guildID);
        
        // Kiểm tra xem hàng đợi có tồn tại không
        if (!serverQueue || serverQueue.length === 0) {
            return interaction.reply('There is no track to clear');
        }
        
        // Lấy ra bài hát hiện đang phát
        const currentTrack = serverQueue[0];
        
        // Xoá bài hát hiện đang phát
        serverQueue.shift();
        
        // Nếu còn bài hát trong hàng đợi, phát tiếp bài tiếp theo
        if (serverQueue.length > 0) {
            const nextTrack = serverQueue[0];
            // Phát bài tiếp theo ở đây
        } else {
            // Nếu không còn bài hát nào trong hàng đợi, thực hiện các hành động khác (ví dụ: dừng phát)
            // Có thể thêm các hành động khác ở đây, ví dụ như dừng phát
        }
        
        // Phản hồi với thông báo đã skip bài hát
        await interaction.reply('cleared the queue pending tracks');
    }
};
