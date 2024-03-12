const { MessageActionRow, MessageButton, MessageEmbed, Options, MessageAttachment } = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const ytdl = require('ytdl-core');
const { v4: uuidv4 } = require('uuid'); // using uuid to create unique filename

function sanitizeFilename(filename) {
    return filename.replace(/[\\/:*?"<>|]/g, '_');
}
module.exports = {
    data: new SlashCommandBuilder()
        .setName("yt2mp4")
        .setDescription("Download video from YouTube to mp4 format")
        .addStringOption(option =>
            option.setName('link')
                .setDescription("Enter the youtube link to download the video.")
                .setRequired(true)
        ),

    async execute(client, interaction, options) {
        const ytlink = interaction.options.getString("link");
        console.log(quality);   
        const videoid = ytlink.split("?v=")[1];
        if (ytlink.includes('list=')) {
            return interaction.reply("Playlist is not supported")
        }
        const videoinfo = await ytdl.getInfo(videoid);
        const videoTitle = videoinfo.videoDetails.title;
        const videoURL = videoinfo.videoDetails.video_url;
        const Authordata = videoinfo.videoDetails.author;
        const Videoauthor = Authordata.name;
        console.log(`Got request download video: ${videoURL}|${videoTitle}|${Videoauthor}`);

        if (videoinfo.videoDetails.lengthSeconds > 900) {
            return interaction.reply("Due to attachment size limitations, the maximum length is 15 minutes.")
        } if (!videoURL) {
            return interaction.reply("Something went wrong, please try again later.")
        }
        else {
            const embed = new MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Downloading...')
                .setDescription(`[${videoTitle}](${videoURL})`);
            await interaction.reply({ embeds: [embed] });

            const uniqueFilename = `${uuidv4()}.mp4`;
            const sanitizedFilename = sanitizeFilename(videoTitle);
            const videoPath = `cache/${sanitizedFilename}_${uniqueFilename}`;
            videoStream = ytdl(ytlink, {filter: 'videoandaudio',  quality: 'highestaudio' } );
            const fileStream = fs.createWriteStream(videoPath);

            videoStream.pipe(fileStream);

            // Wait for download to finish
            await new Promise((resolve, reject) => {
                videoStream.on('end', resolve);
                videoStream.on('error', reject);
            });
           // Check if file is downloaded (debug only)
            const checkfile = fs.existsSync(videoPath);
            if (checkfile) {
                console.log("file downloaded")
            } else {
                console.log("file not downloaded")
            }

            // Send file to user
            const file = new MessageAttachment(videoPath);
            await interaction.followUp({ files: [file] });

            
        }
    
    }
};
