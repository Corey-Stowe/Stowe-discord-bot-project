const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const preset24h = require('../utils/preset24h.js');
const musicPlayer = require('../utils/musicPlayer.js');
const CacheManager = require('../src/utils/cacheManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin24h')
        .setDescription('Admin commands for 24/7 music management')
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update playlist by scanning music directory'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Show current 24/7 playlist'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show detailed statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear the entire playlist'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('shuffle')
                .setDescription('Enable shuffle mode and shuffle current playlist'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('directory')
                .setDescription('Show music directory contents')),

    async execute(interaction) {
        // Check if user is the authorized admin
        if (interaction.user.id !== process.env.ADMIN_ID) {
            return interaction.reply({ 
                content: 'You do not have permission to use this command.', 
                flags: [4096]
            });
        }

        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply();

        try {
            switch (subcommand) {
                case 'update':
                    await this.handleUpdate(interaction);
                    break;
                case 'list':
                    await this.handleList(interaction);
                    break;
                case 'stats':
                    await this.handleStats(interaction);
                    break;
                case 'clear':
                    await this.handleClear(interaction);
                    break;
                case 'shuffle':
                    await this.handleShuffle(interaction);
                    break;
                case 'directory':
                    await this.handleDirectory(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error in admin24h command:', error);
            await interaction.editReply('❌ An error occurred while executing the command.');
        }
    },

    async handleUpdate(interaction) {
        const stats = preset24h.updatePlaylist();
        
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🔄 Playlist Updated')
            .setDescription('Music directory has been scanned and playlist updated')
            .addFields(
                { name: '🎵 Total Songs', value: `${stats.totalSongs}`, inline: true },
                { name: '📁 Auto-scanned', value: `${stats.autoScanned}`, inline: true },
                { name: '✏️ Manual', value: `${stats.manuallyAdded}`, inline: true },
                { name: '💾 Total Size', value: `${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`, inline: true },
                { name: '🎼 Formats', value: Object.entries(stats.formats).map(([ext, count]) => `${ext}: ${count}`).join('\n') || 'None', inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleList(interaction) {
        const playlistInfo = preset24h.getPlaylistInfo();
        
        if (playlistInfo.totalSongs === 0) {
            return interaction.editReply('📝 The 24/7 playlist is empty. Add music files to the preset folder.');
        }

        const playlist = preset24h.currentPlaylist.slice(0, 20); // Show first 20 songs
        const songList = playlist.map((song, index) => 
            `${index + 1}. **${song.title}** - ${song.artist} \`(${song.file})\``
        ).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📝 24/7 Playlist')
            .setDescription(songList)
            .addFields(
                { name: '🎵 Total Songs', value: `${playlistInfo.totalSongs}`, inline: true },
                { name: '🔀 Shuffle', value: playlistInfo.shuffleMode ? 'On' : 'Off', inline: true },
                { name: '📍 Current Index', value: `${playlistInfo.currentIndex + 1}`, inline: true }
            )
            .setFooter({ text: playlistInfo.totalSongs > 20 ? `Showing first 20 of ${playlistInfo.totalSongs} songs` : `${playlistInfo.totalSongs} songs total` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleStats(interaction) {
        const stats = preset24h.getPlaylistStats();
        const status24h = await musicPlayer.get24hStatus(interaction.guild.id);
        const cacheManager = new CacheManager();
        const cacheStats = cacheManager.getCacheStats();
        const downloadStats = musicPlayer.getDownloadStats();

        const embed = new EmbedBuilder()
            .setColor('#ff6b6b')
            .setTitle('📊 24/7 System Statistics')
            .addFields(
                { name: '🎵 Playlist Stats', value: 
                    `Songs: ${stats.totalSongs}\n` +
                    `Size: ${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB\n` +
                    `Auto-scanned: ${stats.autoScanned}\n` +
                    `Manual: ${stats.manuallyAdded}`, inline: true },
                { name: '🎼 Audio Formats', value: 
                    Object.entries(stats.formats).map(([ext, count]) => `${ext}: ${count}`).join('\n') || 'None', inline: true },
                { name: '📻 24/7 Status', value: 
                    `Mode: ${status24h.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                    `Channel: ${status24h.channelId ? `<#${status24h.channelId}>` : 'None'}\n` +
                    `Playing: ${status24h.isPlaying ? '▶️ Yes' : '⏸️ No'}`, inline: true },
                { name: '💾 Cache Stats', value: 
                    `Entries: ${cacheStats.totalEntries}\n` +
                    `Size: ${(cacheStats.totalSize / 1024).toFixed(2)} KB`, inline: true },
                { name: '📁 Downloads', value: 
                    `Size: ${downloadStats.sizeMB} MB`, inline: true },
                { name: '🎶 Current Song', value: 
                    status24h.currentSong ? `${status24h.currentSong.title}` : 'None', inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleClear(interaction) {
        const success = preset24h.clearPlaylist();
        
        if (success) {
            const embed = new EmbedBuilder()
                .setColor('#ff6b6b')
                .setTitle('🗑️ Playlist Cleared')
                .setDescription('All songs have been removed from the 24/7 playlist')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply('❌ Failed to clear playlist.');
        }
    },

    async handleShuffle(interaction) {
        const success = preset24h.shuffleCurrentPlaylist();
        
        if (success) {
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🔀 Playlist Shuffled')
                .setDescription('Shuffle mode enabled and playlist has been shuffled')
                .addFields(
                    { name: '🎵 Total Songs', value: `${preset24h.getPlaylistInfo().totalSongs}`, inline: true },
                    { name: '🔀 Shuffle Mode', value: 'Enabled', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply('❌ Failed to shuffle playlist.');
        }
    },

    async handleDirectory(interaction) {
        const contents = preset24h.getDirectoryContents();
        
        const musicFilesList = contents.musicFiles.slice(0, 15).map(file => 
            `📄 **${file.name}** - ${(file.size / (1024 * 1024)).toFixed(2)} MB`
        ).join('\n');

        const otherFilesList = contents.otherFiles.slice(0, 5).map(file => 
            `📄 ${file.name} - ${(file.size / 1024).toFixed(2)} KB`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#9932cc')
            .setTitle('📁 Music Directory Contents')
            .addFields(
                { name: '🎵 Music Files', value: musicFilesList || 'No music files found', inline: false },
                { name: '📄 Other Files', value: otherFilesList || 'No other files', inline: false },
                { name: '📊 Summary', value: 
                    `Music Files: ${contents.musicFiles.length}\n` +
                    `Other Files: ${contents.otherFiles.length}\n` +
                    `Total Size: ${(contents.totalSize / (1024 * 1024)).toFixed(2)} MB`, inline: false }
            )
            .setFooter({ text: `Path: /data/preset-music/` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};