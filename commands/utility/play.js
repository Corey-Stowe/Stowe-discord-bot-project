const {
    SlashCommandBuilder
} = require('@discordjs/builders');
const {
    MessageActionRow,
    MessageButton,
    MessageEmbed
} = require("discord.js");
const {
    id,
    host,
    port,
    password,
    token
} = require('../../config.json');
const {
    normalizeYouTubeUrl
} = require('../../lib/youtuberegex.js');
const {
    client
} = require('../../index.js');
const axios = require("axios");

// Queue to store tracks
const queue = new Map();

module.exports = {
    queue,
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play the music in the voice channel')
        .addStringOption(option =>
            option.setName('query')
            .setDescription("Enter the song name")
            .setRequired(true)
        ),

    async execute(client, interaction, options) {
        const member = interaction.member;
        const guildID = interaction.guild.id;
        const channelId = member.voice.channel.id;
        const bot = interaction.guild.members.me;
        let song = interaction.options.getString("query");
        if (song.includes('https://youtu.be/')) {
            song = normalizeYouTubeUrl(song);
        }
        // console.log(song);
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
        async function getSongs(search) {
            const params = new URLSearchParams();
            params.append("identifier", search);
            try {
                const response = await axios.get(`http://${host}:${port}/v4/loadtracks?${params}`, {
                    headers: {
                        Authorization: password
                    }
                });

                const dataArray = response.data.data;
                const encodedDataArray = dataArray.map(item => item.encoded);
                // console.log(encodedDataArray);
                // console.log(dataArray)
                const firstEncodedData = encodedDataArray[0];
                author = dataArray[0].info.author;
                title = dataArray[0].info.title;
                uri = dataArray[0].info.uri;
                artwork = dataArray[0].info.artworkUrl;
                length = dataArray[0].info.length;
                //length in millisecond
                second = length / 1000;

                //add track info to queue


                // Add the track and ìnfo to the queue
                if (!queue.has(guildID)) {
                    const queueItem = {
                        encodedData: firstEncodedData,
                        author: dataArray[0].info.author,
                        title: dataArray[0].info.title,
                        uri: dataArray[0].info.uri,
                        artwork: dataArray[0].info.artworkUrl,
                        length: dataArray[0].info.length
                    };
                    queue.set(guildID, [queueItem]);
                    play(guildID, channelId);
                } else {
                    const serverQueue = queue.get(guildID);
                    const queueItem = {
                        encodedData: firstEncodedData,
                        author: dataArray[0].info.author,
                        title: dataArray[0].info.title,
                        uri: dataArray[0].info.uri,
                        artwork: dataArray[0].info.artworkUrl,
                        length: dataArray[0].info.length
                    };
                    serverQueue.push(queueItem);
                }

            } catch (error) {
                console.error(error);
            }
        }

        // Function to start playback
        async function play(guildID, channelID) {
            const serverQueue = queue.get(guildID);
            if (!serverQueue || serverQueue.length === 0) {

                return;
            }

            console.log(`Playing track in ${guildID}: ${serverQueue[0].title} | ${serverQueue[0].author}`);

            const player = await client.manager.join({
                guild: guildID,
                channel: channelID,
                node: "1"
            });

            const track = serverQueue[0];
            await player.play(track.encodedData);

            // Remove the played track from the queue
            serverQueue.shift();

            player.once("error", error => console.error(error));
            player.once("end", data => {
                if (data.type === "TrackEndEvent" && data.reason !== "replaced") {
                    // If there are more tracks in the queue, play the next one
                    if (serverQueue.length > 0) {
                        const formattedDuration = `${Math.floor(second / 60)}:${(second % 60).toFixed(0).padStart(2, '0')}`;
                        const embed = new MessageEmbed()
                            .setColor('#0099ff')
                            .setTitle("Playing next track")
                            .setDescription(`[${title}](${uri})`)
                            .setThumbnail(artwork)
                            .addFields({
                                    name: 'Author',
                                    value: author,
                                    inline: true
                                }, {
                                    name: 'Duration',
                                    value: formattedDuration,
                                    inline: true
                                }, // Use the formatted duration value
                            );
                        interaction.editReply({
                            embeds: [embed]
                        });
                        play(guildID, channelID);
                    } else {
                        // No more tracks in the queue, perform any desired action (e.g., stop playback)
                        // Remove serverQueue
                        interaction.followUp("No more tracks in the queue player will leave the voice channel");
                        queue.delete(guildID);
                        client.manager.leave(guildID);
                    }
                }
            });
        }


        await getSongs("ytsearch:" + song);
        //console.log(queue);
        //console.log(globalDecodedData); // Access the global decoded data

        const formattedDuration = `${Math.floor(second / 60)}:${(second % 60).toFixed(0).padStart(2, '0')}`;

        // Create the embed
        const embed = new MessageEmbed()
            .setColor('#0099ff')
            .setTitle("Added to queue")
            .setDescription(`[${title}](${uri})`)
            .setThumbnail(artwork)
            .addFields({
                    name: 'Author',
                    value: author,
                    inline: true
                }, {
                    name: 'Duration',
                    value: formattedDuration,
                    inline: true
                }, // Use the formatted duration value
            );

        // Reply with the embed
        await interaction.reply({
            embeds: [embed]

        });

    }

};