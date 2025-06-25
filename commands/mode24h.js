const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer } = require('@discordjs/voice');
const musicPlayer = require('../utils/musicPlayer.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mode24h')
        .setDescription('Manage 24/7 music mode')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable 24/7 mode')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Voice channel for 24/7 mode')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable 24/7 mode'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check 24/7 mode status')),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        // Check permissions - Bot Admin or Server Manager
        const isAdmin = interaction.user.id === process.env.ADMIN_ID;
        const hasManagerRole = interaction.member.permissions.has('ManageGuild') || 
                              interaction.member.permissions.has('Administrator');
        
        if (!isAdmin && !hasManagerRole) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Access Denied')
                .setDescription('You do not have permission to configure 24/7 mode.')
                .addFields(
                    { name: '🔒 Required Permissions', value: '• Server Administrator\n• Manage Server permission\n• Bot Admin role', inline: false },
                    { name: '👤 Your Permissions', value: this.getUserPermissionStatus(interaction.member), inline: false }
                )
                .setFooter({ text: 'Contact a server administrator for help' })
                .setTimestamp();

            return interaction.reply({ 
                embeds: [embed],
                flags: [4096] // ephemeral
            });
        }

        await interaction.deferReply();

        try {
            switch (subcommand) {
                case 'enable':
                    await this.handleEnable(interaction, guildId);
                    break;
                case 'disable':
                    await this.handleDisable(interaction, guildId);
                    break;
                case 'status':
                    await this.handleStatus(interaction, guildId);
                    break;
            }
        } catch (error) {
            console.error('Error in mode24h command:', error);
            await interaction.editReply('❌ An error occurred while managing 24/7 mode.');
        }
    },

    getUserPermissionStatus(member) {
        const permissions = [];
        
        if (member.permissions.has('Administrator')) {
            permissions.push('✅ Administrator');
        } else {
            permissions.push('❌ Administrator');
        }
        
        if (member.permissions.has('ManageGuild')) {
            permissions.push('✅ Manage Server');
        } else {
            permissions.push('❌ Manage Server');
        }
        
        // Check if user is bot admin
        if (member.user.id === process.env.ADMIN_ID) {
            permissions.push('✅ Bot Admin');
        } else {
            permissions.push('❌ Bot Admin');
        }
        
        return permissions.join('\n');
    },

    async handleEnable(interaction, guildId) {
        const channel = interaction.options.getChannel('channel');
        
        // Check if bot can join the channel
        if (!channel.joinable) {
            return interaction.editReply('❌ I cannot join that voice channel. Please check permissions.');
        }

        // Check if 24/7 mode is already enabled
        const status = await musicPlayer.get24hStatus(guildId);
        if (status.enabled) {
            return interaction.editReply('❌ 24/7 mode is already enabled.');
        }

        // Start 24/7 mode
        const result = await musicPlayer.start24hMode(guildId, channel.id);
        
        if (result.success) {
            // Join the voice channel and start playing
            try {
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });
                
                const player = createAudioPlayer();
                musicPlayer.setPlayer(guildId, player, connection);
                musicPlayer.setupPlayerEvents(guildId, player);
                connection.subscribe(player);
                
                // Start playing preset music
                await musicPlayer.playNext(guildId);

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ 24/7 Mode Enabled')
                    .setDescription(`24/7 mode is now active in ${channel.name}`)
                    .addFields(
                        { name: '🎵 Mode', value: 'Preset Music', inline: true },
                        { name: '📻 Channel', value: channel.name, inline: true },
                        { name: '🔄 Status', value: 'Playing preset playlist', inline: true },
                        { name: '👤 Enabled by', value: interaction.user.tag, inline: true },
                        { name: '🔒 Permission Level', value: this.getPermissionLevel(interaction.member), inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error('Error joining voice channel:', error);
                await musicPlayer.stop24hMode(guildId);
                await interaction.editReply('❌ Failed to join voice channel.');
            }
        } else {
            await interaction.editReply(`❌ ${result.message}`);
        }
    },

    async handleDisable(interaction, guildId) {
        const result = await musicPlayer.stop24hMode(guildId);
        
        if (result.success) {
            const embed = new EmbedBuilder()
                .setColor('#ff6b6b')
                .setTitle('🛑 24/7 Mode Disabled')
                .setDescription('24/7 mode has been disabled')
                .addFields(
                    { name: '🎵 Mode', value: 'Normal (Request-based)', inline: true },
                    { name: '🔄 Status', value: 'Stopped', inline: true },
                    { name: '👤 Disabled by', value: interaction.user.tag, inline: true },
                    { name: '🔒 Permission Level', value: this.getPermissionLevel(interaction.member), inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply(`❌ ${result.message}`);
        }
    },

    async handleStatus(interaction, guildId) {
        const status = await musicPlayer.get24hStatus(guildId);
        
        const embed = new EmbedBuilder()
            .setColor(status.enabled ? '#00ff00' : '#ff6b6b')
            .setTitle('📊 24/7 Mode Status')
            .addFields(
                { name: '🔄 Status', value: status.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '📻 Channel', value: status.channelId ? `<#${status.channelId}>` : 'None', inline: true },
                { name: '🎵 Preset Songs', value: `${status.playlistInfo.totalSongs} songs`, inline: true },
                { name: '🎶 Currently Playing', value: status.currentSong ? `${status.currentSong.title}` : 'Nothing', inline: false },
                { name: '🔀 Shuffle Mode', value: status.playlistInfo.shuffleMode ? 'On' : 'Off', inline: true },
                { name: '▶️ Player Status', value: status.isPlaying ? 'Active' : 'Inactive', inline: true },
                { name: '🔒 Access Control', value: 'Restricted to Managers & Bot Admins only', inline: false }
            )
            .setTimestamp();

        if (!status.playlistInfo.hasValidSongs) {
            embed.addFields({
                name: '⚠️ Warning',
                value: 'No preset music files found. Add .mp3 or .flac files to `/data/preset-music/` folder.',
                inline: false
            });
        }

        // Add permission info for the user
        embed.addFields({
            name: '👤 Your Access Level',
            value: this.getPermissionLevel(interaction.member),
            inline: true
        });

        await interaction.editReply({ embeds: [embed] });
    },

    getPermissionLevel(member) {
        if (member.user.id === process.env.ADMIN_ID) {
            return '🔴 Bot Administrator';
        } else if (member.permissions.has('Administrator')) {
            return '🟠 Server Administrator';
        } else if (member.permissions.has('ManageGuild')) {
            return '🟡 Server Manager';
        } else {
            return '🔵 Regular Member';
        }
    }
};
