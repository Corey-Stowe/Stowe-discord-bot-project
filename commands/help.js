const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands and their usage')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Get detailed help for a specific command')
                .setRequired(false)),

    async execute(interaction) {
        const specificCommand = interaction.options.getString('command');

        if (specificCommand) {
            await this.showSpecificHelp(interaction, specificCommand);
        } else {
            await this.showMainHelp(interaction);
        }
    },

    async showMainHelp(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#00d4ff')
            .setTitle('StoweBot Free - Command Help')
            .setDescription('A free, open-source Discord music bot. Use the dropdown menu below to explore different categories.')
            .addFields(
                {
                    name: 'Music Commands',
                    value: '`/play` - Multi-platform music streaming\n`/queue` - Show music queue\n`/skip` - Skip current song\n`/stop` - Stop playback\n`/resume` - Resume music\n`/nowplaying` - Current song info\n`/loop` - Loop modes',
                    inline: true
                },
                {
                    name: 'Utility Commands',
                    value: '`/info` - Bot information\n`/ping` - Check latency\n`/suggestion` - Music recommendations\n`/language` - Language settings',
                    inline: true
                },
                {
                    name: 'Admin Commands',
                    value: '`/admin24h` - 24/7 music system\n`/cleancache` - Cache management',
                    inline: true
                }
            )
            .setFooter({
                text: 'Use /help <command> for detailed help on a specific command',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        // Create category selection menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Choose a category for detailed commands')
            .addOptions([
                {
                    label: 'Music Commands',
                    description: 'Multi-platform music streaming & management',
                    value: 'music'
                },
                {
                    label: 'Utility Commands',
                    description: 'Bot settings and information',
                    value: 'utility'
                },
                {
                    label: 'Admin Commands',
                    description: 'Administrative tools (Admin only)',
                    value: 'admin'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            embeds: [embed],
            components: [row]
        });

        // Handle category selection
        const collector = response.createMessageComponentCollector({
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (selectInteraction) => {
            if (selectInteraction.user.id !== interaction.user.id) {
                return selectInteraction.reply({
                    content: 'Only the command user can use this menu!',
                    flags: [4096]
                });
            }

            const category = selectInteraction.values[0];
            await this.showCategoryHelp(selectInteraction, category);
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        StringSelectMenuBuilder.from(selectMenu).setDisabled(true)
                    );
                await response.edit({ components: [disabledRow] });
            } catch (error) {
                // Message might have been deleted
            }
        });
    },

    async showCategoryHelp(interaction, category) {
        const categories = {
            music: {
                title: 'Music Commands',
                color: '#ff6b6b',
                commands: [
                    { name: '/play <url|query>', description: 'Play from YouTube, SoundCloud, or Spotify. Supports playlists and search queries.' },
                    { name: '/play <query> platform:<platform>', description: 'Search specific platform (youtube/soundcloud/spotify)' },
                    { name: '/play <query> autoselect:false', description: 'Manual song selection from search results' },
                    { name: '/queue', description: 'Show the current music queue with song details and controls' },
                    { name: '/skip', description: 'Skip the current song and play next in queue' },
                    { name: '/stop', description: 'Stop music playback and clear the entire queue' },
                    { name: '/resume', description: 'Resume music playback if queue exists' },
                    { name: '/nowplaying', description: 'Show detailed information about the current song' },
                    { name: '/loop [mode]', description: 'Control loop settings: single (current song), queue (entire queue), or off' }
                ]
            },
            utility: {
                title: 'Utility Commands',
                color: '#0099ff',
                commands: [
                    { name: '/info', description: 'Show bot information, system stats, uptime, and useful links' },
                    { name: '/ping', description: 'Check bot latency and Discord API response time' },
                    { name: '/suggestion auto <enabled>', description: 'Toggle auto-suggestion mode for music recommendations' },
                    { name: '/suggestion list <type>', description: 'Get song recommendations (trending, history, lastfm)' },
                    { name: '/suggestion stats', description: 'View your listening statistics and recommendation data' },
                    { name: '/language set <lang>', description: 'Set bot language (en/vi/ja)' },
                    { name: '/language status', description: 'Show current language settings' }
                ]
            },
            admin: {
                title: 'Admin Commands',
                color: '#ff0000',
                commands: [
                    { name: '/admin24h enable <channel>', description: 'Enable 24/7 music mode in specified voice channel' },
                    { name: '/admin24h disable', description: 'Disable 24/7 music mode' },
                    { name: '/admin24h status', description: 'Check 24/7 system status and settings' },
                    { name: '/admin24h update', description: 'Scan preset music directory for new files' },
                    { name: '/cleancache [type]', description: 'Clean cache and show system memory statistics' }
                ]
            }
        };

        const categoryData = categories[category];
        if (!categoryData) return;

        const commandList = categoryData.commands
            .map(cmd => `**${cmd.name}**\n${cmd.description}`)
            .join('\n\n');

        const embed = new EmbedBuilder()
            .setColor(categoryData.color)
            .setTitle(categoryData.title)
            .setDescription(commandList)
            .setFooter({
                text: 'Use /help <command> for detailed help • StoweBot Free',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.update({ embeds: [embed] });
    },

    async showSpecificHelp(interaction, commandName) {
        // Remove slash if provided
        commandName = commandName.replace(/^\//, '');

        const commandHelp = {
            play: {
                title: 'Play Command',
                description: 'Multi-platform music streaming from YouTube, SoundCloud, and Spotify',
                usage: '/play <url|query> [platform:<platform>] [autoselect:<true|false>]',
                examples: [
                    '/play https://youtu.be/dQw4w9WgXcQ',
                    '/play https://soundcloud.com/artist/track',
                    '/play https://open.spotify.com/track/...',
                    '/play lofi hip hop',
                    '/play chill beats platform:soundcloud',
                    '/play rock music autoselect:false'
                ],
                notes: 'Supports direct URLs, playlists, and search queries. Platform options: auto, youtube, soundcloud, spotify. Use autoselect:false for manual song selection.'
            },
            suggestion: {
                title: 'Suggestion Command',
                description: 'Music recommendation system with auto-suggestion and Last.fm integration',
                usage: '/suggestion <auto|list|stats|clearhistory|enhance>',
                examples: [
                    '/suggestion auto enabled:true',
                    '/suggestion list type:trending',
                    '/suggestion list type:lastfm count:10',
                    '/suggestion stats',
                    '/suggestion clearhistory'
                ],
                notes: 'Get personalized music recommendations based on your listening history. Enable auto-suggestion to automatically queue songs when the queue runs low. Supports Last.fm integration for enhanced suggestions.'
            },
            language: {
                title: 'Language Command',
                description: 'Manage bot language settings with i18n support',
                usage: '/language <set|status> [language]',
                examples: [
                    '/language set en',
                    '/language set vi',
                    '/language set ja',
                    '/language status'
                ],
                notes: 'Supported languages: English (en), Vietnamese (vi), Japanese (ja).'
            },
            info: {
                title: 'Info Command',
                description: 'Display comprehensive bot information and statistics',
                usage: '/info',
                examples: ['/info'],
                notes: 'Shows bot version, uptime, server count, memory usage, and useful links.'
            },
            admin24h: {
                title: '24/7 Admin Command',
                description: 'Manage continuous music playback system',
                usage: '/admin24h <enable|disable|status|update> [channel]',
                examples: [
                    '/admin24h enable #music',
                    '/admin24h disable',
                    '/admin24h status',
                    '/admin24h update'
                ],
                notes: 'Admin only. Enables continuous background music from preset files in data/preset-music/. Use /admin24h update to scan for new music files.'
            }
        };

        const helpData = commandHelp[commandName];
        if (!helpData) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Command Not Found')
                .setDescription(`No help available for command: \`${commandName}\``)
                .addFields({
                    name: 'Available Commands',
                    value: 'Use `/help` without arguments to see all available commands, or try one of these:\n\n' +
                           'Music: `play`, `queue`, `skip`, `stop`, `resume`, `loop`\n' +
                           'Utility: `info`, `ping`, `suggestion`, `language`\n' +
                           'Admin: `admin24h`, `cleancache`',
                    inline: false
                })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor('#00d4ff')
            .setTitle(helpData.title)
            .setDescription(helpData.description)
            .addFields(
                { name: 'Usage', value: `\`${helpData.usage}\``, inline: false },
                { name: 'Examples', value: helpData.examples.map(ex => `\`${ex}\``).join('\n'), inline: false },
                { name: 'Notes', value: helpData.notes, inline: false }
            )
            .setFooter({
                text: 'StoweBot Free • Use /help for all commands',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
