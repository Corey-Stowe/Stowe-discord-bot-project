const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const recommendationEngine = require('../utils/recommendationEngine.js');
const musicPlayer = require('../utils/musicPlayer.js');
const i18n = require('../utils/i18n.js');
const logger = require('../utils/logger.js');

// Add cooldown system to prevent rapid command execution
const commandCooldowns = new Map();
const COOLDOWN_TIME = 2000; // 2 seconds

// Clean up old cooldown entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of commandCooldowns.entries()) {
        if (now - timestamp > COOLDOWN_TIME * 2) {
            commandCooldowns.delete(key);
        }
    }
}, 30000); // Clean every 30 seconds

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Music suggestion system with auto-suggestion and recommendations')
        .setDescriptionLocalizations({
            vi: 'Hệ thống gợi ý nhạc với tự động gợi ý và đề xuất'
        })
        .addSubcommand(subcommand =>
            subcommand
                .setName('auto')
                .setDescription('Toggle auto-suggestion mode')
                .setDescriptionLocalizations({
                    vi: 'Bật/tắt chế độ tự động gợi ý'
                })
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable or disable auto-suggestions')
                        .setDescriptionLocalizations({
                            vi: 'Bật hoặc tắt tự động gợi ý'
                        })
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Get song recommendations')
                .setDescriptionLocalizations({
                    vi: 'Lấy danh sách gợi ý bài hát'
                })
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('Type of recommendation')
                        .setDescriptionLocalizations({
                            vi: 'Loại gợi ý'
                        })
                        .addChoices(
                            { name: '👨‍🎤 Similar Artists', value: 'artists' },
                            { name: '🏆 Popular in Server', value: 'server' },
                            { name: '🔥 Trending Now', value: 'trending' },
                            { name: '❤️ Personal Favorites', value: 'personal' },
                            { name: '🎼 Similar Genre', value: 'genre' },
                            { name: '🎵 Metadata Powered', value: 'lastfm' }
                        )
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('count')
                        .setDescription('Number of recommendations per page (5-15)')
                        .setDescriptionLocalizations({
                            vi: 'Số lượng gợi ý mỗi trang (5-15)'
                        })
                        .setMinValue(5)
                        .setMaxValue(15)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View your music listening statistics')
                .setDescriptionLocalizations({
                    vi: 'Xem thống kê nghe nhạc của bạn'
                })
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clearhistory')
                .setDescription('Clear your play history (requires 3 confirmations)')
                .setDescriptionLocalizations({
                    vi: 'Xóa lịch sử phát nhạc (cần 3 lần xác nhận)'
                })
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enhance')
                .setDescription('Enhance existing play history with music metadata')
                .setDescriptionLocalizations({
                    vi: 'Cải thiện lịch sử phát nhạc với metadata từ dịch vụ nhạc'
                })
                .addIntegerOption(option =>
                    option
                        .setName('limit')
                        .setDescription('Number of songs to enhance (max 100)')
                        .setDescriptionLocalizations({
                            vi: 'Số bài hát cần cải thiện (tối đa 100)'
                        })
                        .setMinValue(10)
                        .setMaxValue(100)
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();
        const lang = await i18n.getLanguage(guildId, userId);

        // Check cooldown to prevent rapid command execution
        const cooldownKey = `${userId}-${subcommand}`;
        const now = Date.now();
        const lastUsed = commandCooldowns.get(cooldownKey);
        
        if (lastUsed && (now - lastUsed) < COOLDOWN_TIME) {
            const remainingTime = Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000);
            return await interaction.reply({
                content: `⏱️ Please wait ${remainingTime} second(s) before using this command again.`,
                ephemeral: true
            });
        }
        
        commandCooldowns.set(cooldownKey, now);

        try {
            switch (subcommand) {
                case 'auto':
                    await this.handleAutoSuggestion(interaction, guildId, userId, lang);
                    break;
                case 'list':
                    await this.handleListRecommendations(interaction, guildId, userId, lang);
                    break;
                case 'stats':
                    await this.handleStats(interaction, guildId, userId, lang);
                    break;
                case 'clearhistory':
                    await this.handleClearHistory(interaction, guildId, userId, lang);
                    break;
                case 'enhance':
                    await this.handleEnhanceHistory(interaction, guildId, userId, lang);
                    break;
            }
        } catch (error) {
            logger.error('SUGGESTION', `Error in suggestion command: ${error.message}`);
            // Check if interaction has already been replied to or deferred
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your suggestion request.',
                    ephemeral: true
                });
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: '❌ An error occurred while processing your suggestion request.'
                });
            }
        }
    },

    async handleAutoSuggestion(interaction, guildId, userId, lang) {
        try {
            const enabled = interaction.options.getBoolean('enabled');
            
            recommendationEngine.setAutoSuggestion(guildId, userId, enabled);

            // Get auto-suggestion stats
            const musicPlayerModule = require('../utils/musicPlayer.js');
            const stats = musicPlayerModule.getAutoSuggestionStats(guildId);

            const embed = new EmbedBuilder()
                .setColor(enabled ? '#00ff00' : '#ff6b35')
                .setTitle(enabled ? '✅ Auto-Suggestion Enabled' : '❌ Auto-Suggestion Disabled')
                .setDescription(
                    enabled 
                        ? '**🧪 BETA FEATURE: Auto-suggestion is now active!**\n\n' +
                          '🎵 **How it works:**\n' +
                          '• When queue has ≤2 songs, bot will auto-add suggestions\n' +
                          '• Based on your listening history and preferences\n' +
                          '• Adds 2 songs at a time to keep music flowing\n' +
                          '• **LIMITED: Maximum 10 auto-suggestions per session**\n\n' +
                          '🎯 **Benefits:**\n' +
                          '• Never run out of music\n' +
                          '• Discover new songs you might like\n' +
                          '• Seamless listening experience\n\n' +
                          '🔄 **To reset limit:** Use `/play` command with any song\n' +
                          '🧪 **Beta Notice:** This feature is in testing phase'
                        : '**Auto-suggestion has been disabled.**\n\n' +
                          '🔧 **Manual control:**\n' +
                          '• Use `/suggestion list` to get recommendations\n' +
                          '• Use `/play` to add specific songs\n' +
                          '• Queue will stop when all songs finish\n\n' +
                          '💡 **Tip:** Enable again with `/suggestion auto enabled:true`'
                )
                .addFields(
                    { name: '⚙️ Current Status', value: enabled ? '🟢 Active' : '🔴 Inactive', inline: true },
                    { name: '🔢 Auto-Suggestions', value: `${stats.used}/${stats.max} used`, inline: true },
                    { name: '🎛️ Control', value: 'Use `/suggestion auto` to toggle', inline: true }
                )
                .setFooter({ 
                    text: enabled 
                        ? stats.limitReached 
                            ? 'Limit reached! Use /play to reset counter'
                            : `${stats.remaining} auto-suggestions remaining • Use /play to reset`
                        : 'You can re-enable auto-suggestions anytime'
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            
            logger.info('SUGGESTION', `Auto-suggestion ${enabled ? 'enabled' : 'disabled'} for ${interaction.user.tag}`);
        } catch (error) {
            logger.error('SUGGESTION', 'Error in handleAutoSuggestion:', error);
            // Don't try to reply here since the main error handler will catch it
            throw error;
        }
    },

    async handleListRecommendations(interaction, guildId, userId, lang) {
        const type = interaction.options.getString('type');
        const count = interaction.options.getInteger('count') || 10;

        await interaction.deferReply();

        // Send initial loading message
        const loadingEmbed = new EmbedBuilder()
            .setColor('#ffd700')
            .setTitle('🎵 Generating Recommendations')
            .setDescription(
                '🔍 **Analyzing your music preferences...**\n\n' +
                '⏳ Please wait while I:\n' +
                '• Search through music databases\n' +
                '• Filter quality recommendations\n' +
                '• Personalize suggestions for you\n\n' +
                '💡 This may take 10-30 seconds for the best results!'
            )
            .setFooter({ text: 'Creating personalized music suggestions...' })
            .setTimestamp();

        await interaction.editReply({ embeds: [loadingEmbed] });

        // Add progress update after 8 seconds
        const progressTimeout = setTimeout(async () => {
            const progressEmbed = new EmbedBuilder()
                .setColor('#ff9500')
                .setTitle('🎵 Still Working...')
                .setDescription(
                    '🔄 **Processing recommendations...**\n\n' +
                    '⏳ Almost done! I\'m currently:\n' +
                    '• Searching for quality tracks\n' +
                    '• Filtering out duplicates and playlists\n' +
                    '• Scoring songs based on your preferences\n\n' +
                    '🎯 Preparing your personalized recommendations!'
                )
                .setFooter({ text: 'Quality recommendations take time to generate...' })
                .setTimestamp();

            try {
                await interaction.editReply({ embeds: [progressEmbed] });
            } catch (error) {
                // Ignore errors if interaction is already finished
            }
        }, 8000);

        try {
            // 🎯 NEW: Get current song for better recommendations
            const musicPlayer = require('../utils/musicPlayer.js');
            const currentPlayerData = musicPlayer.getPlayer(guildId);
            const currentSong = currentPlayerData?.currentSong || null;
            
            if (currentSong) {
                logger.info('SUGGESTION', `Manual suggestions using current song: "${currentSong.title}" [Genre: ${currentSong.genre || 'unknown'}]`);
            }
            
            const recommendations = await recommendationEngine.generateRecommendations(guildId, userId, type, count * 2, currentSong); // Get more for pagination
            
            // Clear the progress timeout since we're done
            clearTimeout(progressTimeout);

            if (!recommendations || recommendations.length === 0) {
                const noRecommendationsEmbed = new EmbedBuilder()
                    .setColor('#ff6b35')
                    .setTitle('🎵 No Recommendations Available')
                    .setDescription(
                        '**Not enough data to generate recommendations**\n\n' +
                        '📊 **How to get recommendations:**\n' +
                        '• Use `/play` command more often\n' +
                        '• Try different artists and genres\n' +
                        '• Enable auto-suggestions: `/suggestion auto enabled:true`\n\n' +
                        '🔍 **Quick suggestions:**\n' +
                        '• Try trending: `/suggestion list type:trending`\n' +
                        '• Search manually: `/play query:popular songs 2025`'
                    )
                    .setFooter({ text: 'Recommendations improve with more listening history' })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [noRecommendationsEmbed] });
            }

            // Continue with normal flow...
        } catch (error) {
            clearTimeout(progressTimeout);
            throw error;
        }

        // Pagination setup
        const pageSize = count;
        let currentPage = 0;
        const totalPages = Math.ceil(recommendations.length / pageSize);

        const typeEmojis = {
            'artists': '👨‍🎤',
            'server': '🏆',
            'trending': '🔥',
            'personal': '❤️',
            'genre': '🎼',
            'lastfm': '🎵'
        };

        const typeNames = {
            'artists': 'Similar Artists',
            'server': 'Popular in Server',
            'trending': 'Trending Now',
            'personal': 'Personal Favorites',
            'genre': 'Similar Genre',
            'lastfm': 'Metadata Powered'
        };

        // Build page function
        const buildPage = (pageIndex) => {
            const start = pageIndex * pageSize;
            const end = start + pageSize;
            const pageRecommendations = recommendations.slice(start, end);

            const embed = new EmbedBuilder()
                .setColor('#9932cc')
                .setTitle(`${typeEmojis[type]} ${typeNames[type]} Recommendations`)
                .setDescription(`Page ${pageIndex + 1} of ${totalPages} • ${recommendations.length} total recommendations`)
                .addFields(
                    pageRecommendations.map((rec, index) => ({
                        name: `${start + index + 1}. ${rec.title}`,
                        value: `👤 ${rec.author}\n⏱️ ${rec.durationFormatted || 'Unknown'}\n🎯 ${rec.reason}\n🌟 Confidence: ${Math.round((rec.confidence || 0.5) * 100)}%`,
                        inline: true
                    }))
                )
                .setFooter({ 
                    text: totalPages > 1 
                        ? `Use buttons to navigate pages • Select songs to add to queue`
                        : 'Select songs below to add to queue'
                })
                .setTimestamp();

            return embed;
        };

        // Build action components
        const buildComponents = (pageIndex) => {
            const start = pageIndex * pageSize;
            const end = start + pageSize;
            const pageRecommendations = recommendations.slice(start, end);

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`suggestion_select_${userId}_${pageIndex}`)
                .setPlaceholder('🎵 Choose songs to add to queue')
                .setMinValues(1)
                .setMaxValues(Math.min(pageRecommendations.length, 5))
                .addOptions(
                    pageRecommendations.map((rec, index) => ({
                        label: (rec.title || 'Unknown Song').length > 100 ? (rec.title || 'Unknown Song').substring(0, 97) + '...' : (rec.title || 'Unknown Song'),
                        description: `${rec.author || rec.artist || 'Unknown Artist'} • ${rec.durationFormatted || 'Unknown'}`,
                        value: `${start + index}`,
                        emoji: '🎵'
                    }))
                );

            const buttonRow = new ActionRowBuilder();

            // Navigation buttons
            if (totalPages > 1) {
                buttonRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`suggestion_prev_${userId}`)
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageIndex === 0),
                    new ButtonBuilder()
                        .setCustomId(`suggestion_next_${userId}`)
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageIndex === totalPages - 1)
                );
            }

            // Action buttons
            buttonRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`suggestion_add_all_${userId}_${pageIndex}`)
                    .setLabel('Add All Page')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📋'),
                new ButtonBuilder()
                    .setCustomId(`suggestion_refresh_${userId}`)
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄')
            );

            const components = [new ActionRowBuilder().addComponents(selectMenu)];
            if (buttonRow.components.length > 0) {
                components.push(buttonRow);
            }

            return components;
        };

        // Send initial message
        const message = await interaction.editReply({
            embeds: [buildPage(currentPage)],
            components: buildComponents(currentPage)
        });

        // Set up collector
        const collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === userId,
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            try {
                await i.deferUpdate();

                if (i.customId === `suggestion_prev_${userId}`) {
                    if (currentPage > 0) {
                        currentPage--;
                        await i.editReply({
                            embeds: [buildPage(currentPage)],
                            components: buildComponents(currentPage)
                        });
                    }
                } else if (i.customId === `suggestion_next_${userId}`) {
                    if (currentPage < totalPages - 1) {
                        currentPage++;
                        await i.editReply({
                            embeds: [buildPage(currentPage)],
                            components: buildComponents(currentPage)
                        });
                    }
                } else if (i.customId.startsWith(`suggestion_select_${userId}`)) {
                    await this.handleSongSelection(i, recommendations, interaction);
                } else if (i.customId.startsWith(`suggestion_add_all_${userId}`)) {
                    await this.handleAddAllPage(i, recommendations, currentPage, pageSize, interaction);
                } else if (i.customId === `suggestion_refresh_${userId}`) {
                    await this.handleRefreshRecommendations(i, interaction, guildId, userId, type, count, lang);
                }
            } catch (error) {
                logger.error('SUGGESTION', `Error in suggestion collector: ${error.message}`);
            }
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch (error) {
                // Message might be deleted, ignore
            }
        });
    },

    async handleSongSelection(interaction, recommendations, originalInteraction) {
        const selectedIndices = interaction.values.map(v => parseInt(v));
        const selectedSongs = selectedIndices.map(index => recommendations[index]);
        const guildId = originalInteraction.guild.id;

        let addedCount = 0;
        const distube = originalInteraction.client.distube;
        const queue = musicPlayer.getQueue(guildId);

        // Need a voice channel to add songs via DisTube
        const voiceChannel = queue?.voice?.channel || originalInteraction.member?.voice?.channel;
        if (!voiceChannel) {
            return await interaction.followUp({
                content: '\u274C You must be in a voice channel to add songs to the queue.',
                ephemeral: true
            });
        }

        for (const song of selectedSongs) {
            try {
                const url = song.url || song.originalUrl;
                if (url) {
                    await distube.play(voiceChannel, url, {
                        textChannel: originalInteraction.channel,
                        member: originalInteraction.member,
                        metadata: {
                            requestedBy: originalInteraction.user.tag,
                            suggestion: true,
                            suggestionReason: song.reason
                        },
                    });
                    addedCount++;
                }
            } catch (error) {
                logger.error('SUGGESTION', `Failed to add ${song.title} to queue: ${error.message}`);
            }
        }

        await interaction.followUp({
            content: `\u2705 Added ${addedCount} suggested song${addedCount !== 1 ? 's' : ''} to the queue!`,
            ephemeral: true
        });

        logger.info('SUGGESTION', `Added ${addedCount} suggestions to queue for ${originalInteraction.user.tag}`);
    },

    async handleAddAllPage(interaction, recommendations, currentPage, pageSize, originalInteraction) {
        const start = currentPage * pageSize;
        const end = start + pageSize;
        const pageRecommendations = recommendations.slice(start, end);
        const guildId = originalInteraction.guild.id;

        let addedCount = 0;
        const distube = originalInteraction.client.distube;
        const queue = musicPlayer.getQueue(guildId);

        // Need a voice channel to add songs via DisTube
        const voiceChannel = queue?.voice?.channel || originalInteraction.member?.voice?.channel;
        if (!voiceChannel) {
            return await interaction.followUp({
                content: '\u274C You must be in a voice channel to add songs to the queue.',
                ephemeral: true
            });
        }

        for (const song of pageRecommendations) {
            try {
                const url = song.url || song.originalUrl;
                if (url) {
                    await distube.play(voiceChannel, url, {
                        textChannel: originalInteraction.channel,
                        member: originalInteraction.member,
                        metadata: {
                            requestedBy: originalInteraction.user.tag,
                            suggestion: true,
                            suggestionReason: song.reason
                        },
                    });
                    addedCount++;
                }
            } catch (error) {
                logger.error('SUGGESTION', `Failed to add ${song.title} to queue: ${error.message}`);
            }
        }

        await interaction.followUp({
            content: `\u2705 Added all ${addedCount} songs from page ${currentPage + 1} to the queue!`,
            ephemeral: true
        });

        logger.info('SUGGESTION', `Added page ${currentPage + 1} (${addedCount} songs) to queue for ${originalInteraction.user.tag}`);
    },

    async handleRefreshRecommendations(interaction, originalInteraction, guildId, userId, type, count, lang) {
        // Send loading message for refresh
        await interaction.followUp({
            content: '🔄 **Refreshing recommendations...** ⏳\n💡 Searching for new suggestions, please wait!',
            ephemeral: true
        });

        // 🎯 NEW: Get current song for refreshed recommendations
        const musicPlayer = require('../utils/musicPlayer.js');
        const refreshPlayerData = musicPlayer.getPlayer(guildId);
        const currentSong = refreshPlayerData?.currentSong || null;
        
        const newRecommendations = await recommendationEngine.generateRecommendations(guildId, userId, type, count * 2, currentSong);
        
        if (newRecommendations.length === 0) {
            await interaction.followUp({
                content: '❌ Unable to generate new recommendations at this time.',
                ephemeral: true
            });
            return;
        }

        // Update the original message with new recommendations
        // This would require rebuilding the entire pagination system
        await interaction.followUp({
            content: `✅ Generated ${newRecommendations.length} new recommendations! Use the command again to see them.`,
            ephemeral: true
        });
    },

    async handleStats(interaction, guildId, userId, lang) {
        await interaction.deferReply();

        const stats = recommendationEngine.getUserStats(guildId, userId);

        if (!stats) {
            const noStatsEmbed = new EmbedBuilder()
                .setColor('#ff6b35')
                .setTitle('📊 No Listening Statistics')
                .setDescription(
                    '**You haven\'t played any songs yet!**\n\n' +
                    '🎵 **Start your music journey:**\n' +
                    '• Use `/play` to add songs\n' +
                    '• Enable auto-suggestions: `/suggestion auto enabled:true`\n' +
                    '• Check out trending music: `/suggestion list type:trending`\n\n' +
                    '📈 **Your stats will appear here as you listen to music!**'
                )
                .setFooter({ text: 'Statistics update automatically as you play music' })
                .setTimestamp();

            return await interaction.editReply({ embeds: [noStatsEmbed] });
        }

        const formatDuration = (seconds) => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            if (hours > 0) {
                return `${hours}h ${minutes}m`;
            }
            return `${minutes}m`;
        };

        const formatDate = (timestamp) => {
            return new Date(timestamp).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        };

        const lastFmStatus = recommendationEngine.lastfm?.isEnabled() 
            ? '✅ Active' 
            : '❌ Disabled';

        const statsEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`📊 ${interaction.user.displayName}'s Music Statistics`)
            .setDescription('Your personalized listening analytics')
            .addFields(
                { name: '🎵 Total Songs Played', value: `${stats.totalSongs}`, inline: true },
                { name: '👨‍🎤 Unique Artists', value: `${stats.uniqueArtists}`, inline: true },
                { name: '⏱️ Total Listening Time', value: formatDuration(stats.totalDuration), inline: true },
                { name: '🏆 Top Artist', value: stats.topArtist ? `${stats.topArtist.name} (${stats.topArtist.count} plays)` : 'None', inline: true },
                { name: '🌐 Preferred Platform', value: stats.topPlatform ? `${stats.topPlatform.name} (${stats.topPlatform.count} plays)` : 'None', inline: true },
                { name: '🤖 Auto-Suggestions', value: stats.autoSuggestionEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '🎼 Music Metadata', value: lastFmStatus, inline: true },
                { name: '📈 Data Quality', value: lastFmStatus === '✅ Active' ? 'Enhanced' : 'Standard', inline: true },
                { name: '🎯 Recommendation Engine', value: lastFmStatus === '✅ Active' ? 'Multi-source' : 'Local', inline: true },
                { name: '📅 First Play', value: stats.firstPlay ? formatDate(stats.firstPlay) : 'Unknown', inline: true },
                { name: '🕒 Last Play', value: stats.lastPlay ? formatDate(stats.lastPlay) : 'Unknown', inline: true },
                { name: '� Activity Level', value: this.getActivityLevel(stats.totalSongs), inline: true }
            );

        // Add top genres if available
        if (stats.topGenres?.length) {
            const genreList = stats.topGenres
                .slice(0, 5)
                .map(g => `${g.genre} (${g.count})`)
                .join(', ');
            statsEmbed.addFields({ name: '🎭 Top Genres', value: genreList });
        }

        // Add Last.fm tags if available
        if (stats.lastfmTags?.length) {
            const tagList = stats.lastfmTags
                .slice(0, 5)
                .map(t => `${t.name} (${t.count})`)
                .join(', ');
            statsEmbed.addFields({ name: '🏷️ Music Tags', value: tagList });
        }

        statsEmbed
            .setThumbnail(interaction.user.displayAvatarURL())
            .setFooter({ 
                text: lastFmStatus === '✅ Active'
                    ? 'Enhanced with music metadata • Use /suggestion enhance to update existing history'
                    : 'Statistics updated in real-time • Enable metadata service for better recommendations' 
            })
            .setTimestamp();

        // Add recommendation buttons
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`stats_get_recommendations_${userId}`)
                    .setLabel('Get Recommendations')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎯'),
                new ButtonBuilder()
                    .setCustomId(`stats_toggle_auto_${userId}`)
                    .setLabel(stats.autoSuggestionEnabled ? 'Disable Auto' : 'Enable Auto')
                    .setStyle(stats.autoSuggestionEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
                    .setEmoji(stats.autoSuggestionEnabled ? '❌' : '✅'),
                new ButtonBuilder()
                    .setCustomId(`stats_enhance_history_${userId}`)
                    .setLabel('Enhance History')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔧')
            );

        const message = await interaction.editReply({ 
            embeds: [statsEmbed],
            components: [actionRow]
        });

        // Handle button interactions
        const collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === userId,
            time: 120000 // 2 minutes
        });

        collector.on('collect', async (i) => {
            if (i.customId === `stats_get_recommendations_${userId}`) {
                await i.reply({
                    content: 'Use `/suggestion list type:personal` to get recommendations based on your listening history!',
                    ephemeral: true
                });
            } else if (i.customId === `stats_toggle_auto_${userId}`) {
                const newState = !stats.autoSuggestionEnabled;
                recommendationEngine.setAutoSuggestion(guildId, userId, newState);
                
                await i.reply({
                    content: `🔄 Auto-suggestions ${newState ? 'enabled' : 'disabled'}!`,
                    ephemeral: true
                });
            } else if (i.customId === `stats_enhance_history_${userId}`) {
                // Handle enhance history button
                await this.handleEnhanceHistory(i, guildId, userId, lang);
            }
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch (error) {
                // Message might be deleted, ignore
            }
        });
    },

    getActivityLevel(totalSongs) {
        if (totalSongs >= 500) return '🔥 Music Addict';
        if (totalSongs >= 200) return '🎵 Heavy Listener';
        if (totalSongs >= 50) return '🎧 Regular User';
        if (totalSongs >= 10) return '🎼 Casual Listener';
        return '🌱 New User';
    },

    async handleClearHistory(interaction, guildId, userId, lang) {
        const stats = recommendationEngine.getUserStats(guildId, userId);

        if (!stats) {
            return await interaction.reply({
                content: '❌ You don\'t have any play history to clear.',
                ephemeral: true
            });
        }

        let confirmationStep = 0;
        const maxSteps = 3;

        const buildConfirmationEmbed = (step) => {
            const embed = new EmbedBuilder()
                .setColor('#ff6b35')
                .setTitle('⚠️ Clear Play History')
                .setDescription(
                    `**Step ${step} of ${maxSteps}: Confirm Data Deletion**\n\n` +
                    '🗑️ **This will permanently delete:**\n' +
                    `• ${stats.totalSongs} played songs\n` +
                    `• ${stats.uniqueArtists} artist preferences\n` +
                    `• ${this.formatDuration(stats.totalDuration)} of listening history\n` +
                    '• All recommendation data\n' +
                    '• Personal music preferences\n\n' +
                    '❗ **This action cannot be undone!**\n' +
                    `${step < maxSteps ? `Click "Continue" to proceed to step ${step + 1}` : 'Click "DELETE ALL DATA" to confirm final deletion'}`
                )
                .addFields(
                    { name: '📊 Your Data', value: `${stats.totalSongs} songs • ${stats.uniqueArtists} artists`, inline: true },
                    { name: '🔒 Privacy', value: 'Only your data will be deleted', inline: true },
                    { name: '⚠️ Warning', value: step === maxSteps ? '**FINAL STEP**' : `${maxSteps - step} steps remaining`, inline: true }
                )
                .setFooter({ text: step === maxSteps ? 'Last chance to cancel!' : 'Multiple confirmations required for safety' })
                .setTimestamp();

            return embed;
        };

        const buildButtons = (step) => {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`clear_confirm_${userId}_${step}`)
                        .setLabel(step === maxSteps ? 'DELETE ALL DATA' : 'Continue')
                        .setStyle(step === maxSteps ? ButtonStyle.Danger : ButtonStyle.Primary)
                        .setEmoji(step === maxSteps ? '🗑️' : '➡️'),
                    new ButtonBuilder()
                        .setCustomId(`clear_cancel_${userId}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('❌')
                );
        };

        confirmationStep = 1;
        const message = await interaction.reply({
            embeds: [buildConfirmationEmbed(confirmationStep)],
            components: [buildButtons(confirmationStep)],
            ephemeral: true
        });

        const collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === userId,
            time: 60000 // 1 minute per step
        });

        collector.on('collect', async (i) => {
            if (i.customId === `clear_cancel_${userId}`) {
                const cancelEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Cancellation Successful')
                    .setDescription('Your play history has been preserved.\n\nNo data was deleted.')
                    .setFooter({ text: 'You can clear your history anytime using this command' })
                    .setTimestamp();

                await i.update({ embeds: [cancelEmbed], components: [] });
                collector.stop('cancelled');
                return;
            }

            if (i.customId === `clear_confirm_${userId}_${confirmationStep}`) {
                if (confirmationStep < maxSteps) {
                    confirmationStep++;
                    await i.update({
                        embeds: [buildConfirmationEmbed(confirmationStep)],
                        components: [buildButtons(confirmationStep)]
                    });
                    
                    // Reset collector timer for next step
                    collector.resetTimer({ time: 60000 });
                } else {
                    // Final confirmation - actually clear the data
                    const cleared = recommendationEngine.clearUserHistory(guildId, userId);
                    
                    if (cleared) {
                        const successEmbed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('🗑️ Play History Cleared')
                            .setDescription(
                                '**Your music data has been permanently deleted.**\n\n' +
                                '✅ **Cleared data:**\n' +
                                `• ${stats.totalSongs} played songs\n` +
                                `• ${stats.uniqueArtists} artist preferences\n` +
                                '• All recommendation history\n' +
                                '• Personal music preferences\n\n' +
                                '🔄 **Starting fresh:**\n' +
                                '• Use `/play` to start building new history\n' +
                                '• Enable auto-suggestions: `/suggestion auto enabled:true`\n' +
                                '• Your new preferences will be learned over time'
                            )
                            .setFooter({ text: 'Your privacy is protected - all personal data removed' })
                            .setTimestamp();

                        await i.update({ embeds: [successEmbed], components: [] });
                        
                        logger.info('SUGGESTION', `Cleared play history for ${interaction.user.tag} in guild ${guildId}`);
                    } else {
                        await i.update({
                            content: '❌ Failed to clear history. Please try again later.',
                            embeds: [],
                            components: []
                        });
                    }
                    
                    collector.stop('completed');
                }
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#ffaa00')
                    .setTitle('⏰ Confirmation Timeout')
                    .setDescription('History clearing cancelled due to timeout.\n\nYour data has been preserved.')
                    .setFooter({ text: 'Try again when you\'re ready to proceed' })
                    .setTimestamp();

                interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
    },

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    },

    async handleEnhanceHistory(interaction, guildId, userId, lang) {
        const limit = interaction.options.getInteger('limit') || 50;

        await interaction.deferReply();

        try {
            const startEmbed = new EmbedBuilder()
                .setColor('#ff9500')
                .setTitle('🔧 Enhancing Play History')
                .setDescription('Fetching enhanced metadata from music services...')
                .addFields(
                    { name: '📊 Processing', value: `Up to ${limit} songs`, inline: true },
                    { name: '⏱️ Estimated Time', value: `~${Math.ceil(limit / 60)} minutes`, inline: true },
                    { name: '🎵 Data Sources', value: 'Music Metadata + Video + Local Detection', inline: true }
                )
                .setFooter({ text: 'This may take a while due to API rate limits...' })
                .setTimestamp();

            await interaction.editReply({ embeds: [startEmbed] });

            const result = await recommendationEngine.enhanceExistingHistory(guildId, limit);

            const resultEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ History Enhancement Complete')
                .setDescription('Your play history has been enhanced with better metadata!')
                .addFields(
                    { name: '📊 Songs Processed', value: `${result.processed}`, inline: true },
                    { name: '🎵 Successfully Enhanced', value: `${result.enhanced}`, inline: true },
                    { name: '📈 Success Rate', value: `${result.processed > 0 ? Math.round((result.enhanced / result.processed) * 100) : 0}%`, inline: true },
                    { name: '🎼 Music Metadata', value: result.lastfmAvailable ? '✅ Active' : '❌ Disabled', inline: true },
                    { name: '🚀 Recommendation Quality', value: 'Significantly Improved', inline: true },
                    { name: '📊 View Updated Stats', value: 'Use `/suggestion stats`', inline: true }
                )
                .setFooter({ text: 'Future songs will be automatically enhanced!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [resultEmbed] });

            logger.info('SUGGESTION', `Enhanced ${result.enhanced} songs for user ${interaction.user.tag}`);

        } catch (error) {
            logger.error('SUGGESTION', `Error enhancing history: ${error.message}`);
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Enhancement Failed')
                    .setDescription('Failed to enhance play history. Please try again later.')
                    .setFooter({ text: 'Check console for error details' })
                ]
            });
        }
    }
};
