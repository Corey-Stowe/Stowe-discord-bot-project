const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const musicPlayer = require('../utils/musicPlayer.js');
const logger = require('../utils/logger');

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
                .setTitle('\u274C Access Denied')
                .setDescription('You do not have permission to configure 24/7 mode.')
                .addFields(
                    { name: '\uD83D\uDD12 Required Permissions', value: '\u2022 Server Administrator\n\u2022 Manage Server permission\n\u2022 Bot Admin role', inline: false },
                    { name: '\uD83D\uDC64 Your Permissions', value: this.getUserPermissionStatus(interaction.member), inline: false }
                )
                .setFooter({ text: 'Contact a server administrator for help' })
                .setTimestamp();

            return interaction.reply({
                embeds: [embed],
                flags: [4096]
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
            logger.error('MUSIC', `Error in mode24h command: ${error.message}`);
            await interaction.editReply('\u274C An error occurred while managing 24/7 mode.');
        }
    },

    getUserPermissionStatus(member) {
        const permissions = [];

        if (member.permissions.has('Administrator')) {
            permissions.push('\u2705 Administrator');
        } else {
            permissions.push('\u274C Administrator');
        }

        if (member.permissions.has('ManageGuild')) {
            permissions.push('\u2705 Manage Server');
        } else {
            permissions.push('\u274C Manage Server');
        }

        if (member.user.id === process.env.ADMIN_ID) {
            permissions.push('\u2705 Bot Admin');
        } else {
            permissions.push('\u274C Bot Admin');
        }

        return permissions.join('\n');
    },

    async handleEnable(interaction, guildId) {
        const channel = interaction.options.getChannel('channel');

        // Check if bot can join the channel
        if (!channel.joinable) {
            return interaction.editReply('\u274C I cannot join that voice channel. Please check permissions.');
        }

        // Check if 24/7 mode is already enabled
        const status = await musicPlayer.get24hStatus(guildId);
        if (status.enabled) {
            return interaction.editReply('\u274C 24/7 mode is already enabled.');
        }

        // Start 24/7 mode
        const result = await musicPlayer.start24hMode(guildId, channel.id);

        if (result.success) {
            // Play preset music using DisTube via musicPlayer
            try {
                await musicPlayer.playPreset24h(guildId, channel, interaction.channel);

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('\u2705 24/7 Mode Enabled')
                    .setDescription(`24/7 mode is now active in ${channel.name}`)
                    .addFields(
                        { name: '\uD83C\uDFB5 Mode', value: 'Preset Music', inline: true },
                        { name: '\uD83D\uDCFB Channel', value: channel.name, inline: true },
                        { name: '\uD83D\uDD04 Status', value: 'Playing preset playlist', inline: true },
                        { name: '\uD83D\uDC64 Enabled by', value: interaction.user.tag, inline: true },
                        { name: '\uD83D\uDD12 Permission Level', value: this.getPermissionLevel(interaction.member), inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                logger.error('MUSIC', `Error starting 24/7 playback: ${error.message}`);
                await musicPlayer.stop24hMode(guildId);
                await interaction.editReply('\u274C Failed to start 24/7 playback in voice channel.');
            }
        } else {
            await interaction.editReply(`\u274C ${result.message}`);
        }
    },

    async handleDisable(interaction, guildId) {
        const result = await musicPlayer.stop24hMode(guildId);

        if (result.success) {
            // Also stop playback and disconnect
            musicPlayer.disconnect(guildId);

            const embed = new EmbedBuilder()
                .setColor('#ff6b6b')
                .setTitle('\uD83D\uDED1 24/7 Mode Disabled')
                .setDescription('24/7 mode has been disabled')
                .addFields(
                    { name: '\uD83C\uDFB5 Mode', value: 'Normal (Request-based)', inline: true },
                    { name: '\uD83D\uDD04 Status', value: 'Stopped', inline: true },
                    { name: '\uD83D\uDC64 Disabled by', value: interaction.user.tag, inline: true },
                    { name: '\uD83D\uDD12 Permission Level', value: this.getPermissionLevel(interaction.member), inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply(`\u274C ${result.message}`);
        }
    },

    async handleStatus(interaction, guildId) {
        const status = await musicPlayer.get24hStatus(guildId);

        const embed = new EmbedBuilder()
            .setColor(status.enabled ? '#00ff00' : '#ff6b6b')
            .setTitle('\uD83D\uDCCA 24/7 Mode Status')
            .addFields(
                { name: '\uD83D\uDD04 Status', value: status.enabled ? '\u2705 Enabled' : '\u274C Disabled', inline: true },
                { name: '\uD83D\uDCFB Channel', value: status.channelId ? `<#${status.channelId}>` : 'None', inline: true },
                { name: '\uD83C\uDFB5 Preset Songs', value: `${status.playlistInfo.totalSongs} songs`, inline: true },
                { name: '\uD83C\uDFB6 Currently Playing', value: status.currentSong ? `${status.currentSong.title}` : 'Nothing', inline: false },
                { name: '\uD83D\uDD00 Shuffle Mode', value: status.playlistInfo.shuffleMode ? 'On' : 'Off', inline: true },
                { name: '\u25B6\uFE0F Player Status', value: status.isPlaying ? 'Active' : 'Inactive', inline: true },
                { name: '\uD83D\uDD12 Access Control', value: 'Restricted to Managers & Bot Admins only', inline: false }
            )
            .setTimestamp();

        if (!status.playlistInfo.hasValidSongs) {
            embed.addFields({
                name: '\u26A0\uFE0F Warning',
                value: 'No preset music files found. Add .mp3 or .flac files to `/data/preset-music/` folder.',
                inline: false
            });
        }

        embed.addFields({
            name: '\uD83D\uDC64 Your Access Level',
            value: this.getPermissionLevel(interaction.member),
            inline: true
        });

        await interaction.editReply({ embeds: [embed] });
    },

    getPermissionLevel(member) {
        if (member.user.id === process.env.ADMIN_ID) {
            return '\uD83D\uDD34 Bot Administrator';
        } else if (member.permissions.has('Administrator')) {
            return '\uD83D\uDFE0 Server Administrator';
        } else if (member.permissions.has('ManageGuild')) {
            return '\uD83D\uDFE1 Server Manager';
        } else {
            return '\uD83D\uDD35 Regular Member';
        }
    }
};
