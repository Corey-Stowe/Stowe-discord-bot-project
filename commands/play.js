const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer } = require('@discordjs/voice');
const Youtube = require('../Plugins/Youtube.js');
const Database = require('../utils/database.js');
const musicPlayer = require('../utils/musicPlayer.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a YouTube video')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('YouTube URL to play')
                .setRequired(true)),
    async execute(interaction) {
        const url = interaction.options.getString('url');
        const guildId = interaction.guild.id;
        const db = new Database();
        
        // Check if user is in a voice channel
        if (!interaction.member.voice.channel) {
            return interaction.reply('You need to be in a voice channel to play music!');
        }

        // Check 24/7 mode status
        const mode24h = await db.get24hMode(guildId);
        if (mode24h.enabled && mode24h.channelId && interaction.member.voice.channel.id !== mode24h.channelId) {
            return interaction.reply(`❌ 24/7 mode is active in <#${mode24h.channelId}>. Please join that channel or disable 24/7 mode first.`);
        }
        
        await interaction.deferReply();
        
        try {
            const youtube = new Youtube();
            
            // Check if it's a playlist URL
            if (youtube.isPlaylistUrl(url)) {
                await this.handlePlaylist(interaction, url, youtube, db, guildId);
            } else if (youtube.isVideoUrl(url)) {
                await this.handleSingleVideo(interaction, url, youtube, db, guildId);
            } else {
                await interaction.editReply('❌ Please provide a valid YouTube video or playlist URL.');
            }
            
        } catch (error) {
            console.error('Error processing YouTube URL:', error);
            await interaction.editReply('❌ Sorry, I could not process that YouTube URL.');
        }
    },

    async handlePlaylist(interaction, playlistUrl, youtube, db, guildId) {
        try {
            await interaction.editReply('🔄 Processing playlist...');
            
            const playlistInfo = await youtube.getPlaylistInfo(playlistUrl);
            
            if (!playlistInfo.videos || playlistInfo.videos.length === 0) {
                return interaction.editReply('❌ No videos found in this playlist.');
            }

            let addedCount = 0;
            let failedCount = 0;
            const maxVideos = 50; // Limit to prevent spam
            const videosToProcess = playlistInfo.videos.slice(0, maxVideos);

            await interaction.editReply(`🔄 Adding ${videosToProcess.length} videos from playlist: **${playlistInfo.title}**...`);

            // Process videos in batches to avoid overwhelming the system
            for (let i = 0; i < videosToProcess.length; i += 5) {
                const batch = videosToProcess.slice(i, i + 5);
                
                await Promise.allSettled(batch.map(async (video) => {
                    try {
                        // Try to get detailed video info
                        let videoInfo;
                        try {
                            videoInfo = await youtube.getYoutubeInfo(video.url);
                        } catch (error) {
                            // If individual video fails, use playlist data
                            console.log(`Failed to get detailed info for ${video.title}, using playlist data`);
                            videoInfo = {
                                title: video.title,
                                author: video.author,
                                thumbnail: video.thumbnail,
                                streamingData: null // Will need to be fetched when playing
                            };
                        }

                        const song = {
                            title: videoInfo.title || video.title,
                            author: videoInfo.author || video.author,
                            audioUrl: null, // Will be resolved when playing
                            thumbnail: videoInfo.thumbnail || video.thumbnail,
                            quality: 'Unknown',
                            requestedBy: interaction.user.tag,
                            videoId: video.videoId,
                            originalUrl: video.url,
                            fromPlaylist: true,
                            playlistTitle: playlistInfo.title
                        };

                        await db.addToQueue(guildId, song);
                        addedCount++;
                    } catch (error) {
                        console.error(`Failed to add video ${video.title}:`, error);
                        failedCount++;
                    }
                }));

                // Update progress every batch
                if (i + 5 < videosToProcess.length) {
                    await interaction.editReply(`🔄 Processing playlist... (${i + 5}/${videosToProcess.length} videos processed)`);
                }
            }

            // Start playing if no music is currently playing
            let playerData = musicPlayer.getPlayer(guildId);
            if (!playerData) {
                const connection = joinVoiceChannel({
                    channelId: interaction.member.voice.channel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });
                
                const player = createAudioPlayer();
                musicPlayer.setPlayer(guildId, player, connection);
                musicPlayer.setupPlayerEvents(guildId, player);
                connection.subscribe(player);
                
                // Create enhanced embed with controls
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('🎵 Now Playing')
                    .setDescription(`**${song.title}**`)
                    .addFields(
                        { name: '👤 Artist', value: song.author, inline: true },
                        { name: '🎧 Quality', value: song.quality || 'Unknown', inline: true },
                        { name: '👤 Requested by', value: song.requestedBy, inline: true }
                    )
                    .setThumbnail(song.thumbnail)
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('player_pause')
                            .setLabel('Pause')
                            .setEmoji('⏸️')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('player_skip')
                            .setLabel('Skip')
                            .setEmoji('⏭️')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('player_stop')
                            .setLabel('Stop')
                            .setEmoji('⏹️')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('player_loop')
                            .setLabel('Loop')
                            .setEmoji('🔁')
                            .setStyle(ButtonStyle.Success)
                    );

                const response = await interaction.editReply({ 
                    embeds: [embed], 
                    components: [row] 
                });

                // Setup button collector for play command
                this.setupPlayControlsCollector(response, guildId, interaction.user.id);
                
                await musicPlayer.playNext(guildId);
            } else {
                // Enhanced queue response
                const queuePosition = queue.length;
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📝 Added to Queue')
                    .setDescription(`**${song.title}**`)
                    .addFields(
                        { name: '👤 Artist', value: song.author, inline: true },
                        { name: '📍 Position', value: `${queuePosition}`, inline: true },
                        { name: '👤 Requested by', value: song.requestedBy, inline: true }
                    )
                    .setThumbnail(song.thumbnail)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

            const resultMessage = `✅ **Playlist Added**: ${playlistInfo.title}\n` +
                                `📝 Added ${addedCount} videos to queue` +
                                (failedCount > 0 ? `\n⚠️ Failed to add ${failedCount} videos` : '') +
                                (videosToProcess.length < playlistInfo.videoCount ? `\n📌 Limited to ${maxVideos} videos` : '');

            await interaction.editReply(resultMessage);

        } catch (error) {
            console.error('Error processing playlist:', error);
            await interaction.editReply('❌ Failed to process the playlist. Please try again.');
        }
    },

    async handleSingleVideo(interaction, url, youtube, db, guildId) {
        // Extract video ID for caching
        const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
        
        // Check cache first
        let videoInfo = null;
        if (videoId) {
            videoInfo = await db.getCache(videoId);
        }
        
        // If not cached, fetch from YouTube
        if (!videoInfo) {
            videoInfo = await youtube.getYoutubeInfo(url);
            if (videoId) {
                await db.setCache(videoId, videoInfo);
            }
        }
        
        // Extract audio stream URLs from adaptiveFormats
        if (videoInfo.streamingData && videoInfo.streamingData.adaptiveFormats) {
            const audioFormats = videoInfo.streamingData.adaptiveFormats.filter(format => 
                format.mimeType && format.mimeType.includes('audio') && 
                format.url && format.contentLength
            );
            
            if (audioFormats.length > 0) {
                // Sort by quality and prefer mp4 audio
                const sortedFormats = audioFormats.sort((a, b) => {
                    // Prefer mp4 over webm
                    if (a.mimeType.includes('mp4') && !b.mimeType.includes('mp4')) return -1;
                    if (!a.mimeType.includes('mp4') && b.mimeType.includes('mp4')) return 1;
                    // Then by bitrate
                    return (b.averageBitrate || 0) - (a.averageBitrate || 0);
                });
                
                const bestAudio = sortedFormats[0];
                const audioUrl = bestAudio.url;
                
                if (!audioUrl) {
                    return interaction.editReply('Could not get audio stream URL for this video.');
                }
                
                console.log('Selected audio format:', {
                    mimeType: bestAudio.mimeType,
                    quality: bestAudio.audioQuality,
                    bitrate: bestAudio.averageBitrate
                });
                
                const song = {
                    title: videoInfo.title,
                    author: videoInfo.author,
                    audioUrl: audioUrl,
                    thumbnail: videoInfo.thumbnail,
                    quality: bestAudio.audioQuality,
                    requestedBy: interaction.user.tag,
                    videoId: videoId,
                    originalUrl: url
                };
                
                // Add to queue
                const queue = await db.addToQueue(guildId, song);
                
                // If no player exists, create one and start playing
                let playerData = musicPlayer.getPlayer(guildId);
                if (!playerData) {
                    const connection = joinVoiceChannel({
                        channelId: interaction.member.voice.channel.id,
                        guildId: interaction.guild.id,
                        adapterCreator: interaction.guild.voiceAdapterCreator,
                    });
                    
                    const player = createAudioPlayer();
                    musicPlayer.setPlayer(guildId, player, connection);
                    musicPlayer.setupPlayerEvents(guildId, player);
                    connection.subscribe(player);
                    
                    // Create enhanced embed with controls
                    const embed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('🎵 Now Playing')
                        .setDescription(`**${song.title}**`)
                        .addFields(
                            { name: '👤 Artist', value: song.author, inline: true },
                            { name: '🎧 Quality', value: song.quality || 'Unknown', inline: true },
                            { name: '👤 Requested by', value: song.requestedBy, inline: true }
                        )
                        .setThumbnail(song.thumbnail)
                        .setTimestamp();

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('player_pause')
                                .setLabel('Pause')
                                .setEmoji('⏸️')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('player_skip')
                                .setLabel('Skip')
                                .setEmoji('⏭️')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('player_stop')
                                .setLabel('Stop')
                                .setEmoji('⏹️')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('player_loop')
                                .setLabel('Loop')
                                .setEmoji('🔁')
                                .setStyle(ButtonStyle.Success)
                        );

                    const response = await interaction.editReply({ 
                        embeds: [embed], 
                        components: [row] 
                    });

                    // Setup button collector for play command
                    this.setupPlayControlsCollector(response, guildId, interaction.user.id);
                    
                    await musicPlayer.playNext(guildId);
                } else {
                    // Enhanced queue response
                    const queuePosition = queue.length;
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('📝 Added to Queue')
                        .setDescription(`**${song.title}**`)
                        .addFields(
                            { name: '👤 Artist', value: song.author, inline: true },
                            { name: '📍 Position', value: `${queuePosition}`, inline: true },
                            { name: '👤 Requested by', value: song.requestedBy, inline: true }
                        )
                        .setThumbnail(song.thumbnail)
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                }
            } else {
                await interaction.editReply('No audio streams available for this video.');
            }
        } else {
            await interaction.editReply('Could not get streaming data for this video.');
        }
    },

    setupPlayControlsCollector(response, guildId, userId) {
        const collector = response.createMessageComponentCollector({ 
            time: 300000 // 5 minutes timeout
        });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.user.id !== userId) {
                return buttonInteraction.reply({ 
                    content: '❌ Only the user who started the music can control it!', 
                    flags: [4096]
                });
            }

            if (!buttonInteraction.member.voice.channel) {
                return buttonInteraction.reply({ 
                    content: '❌ You need to be in a voice channel to use music controls!', 
                    flags: [4096]
                });
            }

            const action = buttonInteraction.customId.replace('player_', '');
            const Database = require('../utils/database.js');
            const db = new Database();
            
            switch (action) {
                case 'pause':
                    if (musicPlayer.isPlaying(guildId)) {
                        musicPlayer.pause(guildId);
                        await buttonInteraction.reply({ 
                            content: '⏸️ Music paused!', 
                            flags: [4096]
                        });
                    } else if (musicPlayer.isPaused(guildId)) {
                        musicPlayer.resume(guildId);
                        await buttonInteraction.reply({ 
                            content: '▶️ Music resumed!', 
                            flags: [4096]
                        });
                    } else {
                        await buttonInteraction.reply({ 
                            content: '❌ No music is currently playing!', 
                            flags: [4096]
                        });
                    }
                    break;
                    
                case 'skip':
                    await musicPlayer.playNext(guildId);
                    await buttonInteraction.reply({ 
                        content: '⏭️ Skipped to next song!', 
                        flags: [4096]
                    });
                    break;
                    
                case 'stop':
                    musicPlayer.disconnect(guildId);
                    await buttonInteraction.reply({ 
                        content: '⏹️ Music stopped and disconnected!', 
                        flags: [4096]
                    });
                    break;
                    
                case 'loop':
                    // Cycle through loop modes
                    const currentLoop = await db.getLoopMode(guildId);
                    const nextLoop = getNextLoopMode(currentLoop);
                    await db.setLoopMode(guildId, nextLoop);
                    
                    await buttonInteraction.reply({ 
                        content: `🔁 Loop mode changed to: **${getLoopModeText(nextLoop)}**`, 
                        flags: [4096]
                    });
                    break;
                    
                case 'queue':
                    const queue = await db.getQueue(guildId);
                    if (queue.length === 0) {
                        await buttonInteraction.reply({ 
                            content: '📝 Queue is empty!', 
                            flags: [4096]
                        });
                    } else {
                        const queueList = queue.slice(0, 10).map((song, index) => 
                            `${index + 1}. **${song.title}** - ${song.author}`
                        ).join('\n');
                        
                        const queueEmbed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle('📝 Current Queue')
                            .setDescription(queueList)
                            .setFooter({ text: `${queue.length} songs in queue` });

                        await buttonInteraction.reply({ 
                            embeds: [queueEmbed], 
                            flags: [4096]
                        });
                    }
                    break;
            }
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('player_pause')
                            .setLabel('Pause')
                            .setEmoji('⏸️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('player_skip')
                            .setLabel('Skip')
                            .setEmoji('⏭️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('player_stop')
                            .setLabel('Stop')
                            .setEmoji('⏹️')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('player_loop')
                            .setLabel('Loop')
                            .setEmoji('🔁')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true)
                    );

                await response.edit({ components: [disabledRow] });
            } catch (error) {
                // Message was probably deleted, ignore error
            }
        });
    },
};

function getLoopModeText(mode) {
    switch (mode) {
        case 'single':
            return '🔁 Loop Current Song';
        case 'queue':
            return '🔂 Loop Queue';
        case 'off':
        default:
            return '▶️ No Loop';
    }
}

function getNextLoopMode(currentMode) {
    switch (currentMode) {
        case 'off':
            return 'single';
        case 'single':
            return 'queue';
        case 'queue':
        default:
            return 'off';
    }
}