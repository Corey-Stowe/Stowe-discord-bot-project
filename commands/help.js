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
            .setTitle('🤖 StoweBot - Command Help')
            .setDescription('Welcome to StoweBot! Here are all available commands organized by category.\nUse the dropdown menu below to explore different categories.')
            .addFields(
                {
                    name: '🎵 Music Commands',
                    value: '`/play` - Multi-platform music streaming\n`/queue` - Show music queue\n`/skip` - Skip current song\n`/stop` - Stop playback\n`/resume` - Resume music\n`/nowplaying` - Current song info\n`/loop` - Loop modes',
                    inline: true
                },
                {
                    name: '💰 Economy Commands',
                    value: '`/balance` - Check balance\n`/bal` - Quick balance check\n`/money` - Detailed profile\n`/work` - Earn money\n`/transfer` - Send money\n`/leaderboard` - Top users',
                    inline: true
                },
                {
                    name: '🎰 Gambling Commands',
                    value: '`/taixiu` - Vietnamese dice game\n`/tomcuaca` - Animal dice game\n`/rps` - Rock Paper Scissors\n`/baccarat` - Baccarat card game\n`/dice` - Simple dice\n`/crime` - Crime minigame',
                    inline: true
                },
                {
                    name: '🎮 Mini Games',
                    value: '`/chemistry` - Chemistry knowledge game\n`/loop` - Number pattern game',
                    inline: true
                },
                {
                    name: '🔧 Utility Commands',
                    value: '`/info` - Bot information\n`/ping` - Check latency\n`/language` - Language settings\n`/redeem` - Redeem codes\n`/gift` - Available gifts\n`/mygifts` - Gift history',
                    inline: true
                },
                {
                    name: '👑 Admin Commands',
                    value: '`/admin24h` - 24/7 music system\n`/admingift` - Gift management\n`/economyadmin` - Economy admin\n`/chebal` - Chemistry balancer\n`/cleancache` - Cache management\n`/resetslash` - Reset commands',
                    inline: true
                }
            )
            .setFooter({ 
                text: 'Use /help <command> for detailed help on a specific command • Version 2.4',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        // Create category selection menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Choose a category for detailed commands')
            .addOptions([
                {
                    label: '🎵 Music Commands',
                    description: 'Multi-platform music streaming & management',
                    value: 'music'
                },
                {
                    label: '💰 Economy Commands',
                    description: 'Manage your virtual currency',
                    value: 'economy'
                },
                {
                    label: '🎰 Gambling Commands',
                    description: 'Games to win or lose money',
                    value: 'gambling'
                },
                {
                    label: '🎮 Mini Games',
                    description: 'Fun educational games',
                    value: 'minigames'
                },
                {
                    label: '🔧 Utility Commands',
                    description: 'Bot settings and information',
                    value: 'utility'
                },
                {
                    label: '👑 Admin Commands',
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
                    content: '❌ Only the command user can use this menu!', 
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
                title: '🎵 Music Commands',
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
            economy: {
                title: '💰 Economy Commands',
                color: '#00ff88',
                commands: [
                    { name: '/balance [user]', description: 'Check your balance or someone else\'s balance' },
                    { name: '/bal [user]', description: 'Quick balance check with work cooldown info' },
                    { name: '/money [user]', description: 'Detailed economy profile with statistics and rankings' },
                    { name: '/work', description: 'Work to earn 100-500 coins (15 second cooldown)' },
                    { name: '/transfer <user> <amount>', description: 'Transfer money to another user safely' },
                    { name: '/leaderboard [limit]', description: 'Show the richest users on the server (default: top 10)' },
                    { name: '/redeem <code>', description: 'Redeem gift codes for money rewards' },
                    { name: '/gift', description: 'Check available gifts and promotions' },
                    { name: '/mygifts', description: 'View your gift redemption history' }
                ]
            },
            gambling: {
                title: '🎰 Gambling Commands',
                color: '#9932cc',
                commands: [
                    { name: '/taixiu <amount>', description: 'Vietnamese Tài Xỉu dice game - bet on dice sum (Over/Under)' },
                    { name: '/tomcuaca <amount>', description: 'Vietnamese Tôm Cua Cá - animal dice game with multiple betting options' },
                    { name: '/rps <amount> <choice>', description: 'Rock Paper Scissors - choose rock, paper, or scissors' },
                    { name: '/baccarat <amount> <bet>', description: 'Baccarat card game - bet on player, banker, or tie' },
                    { name: '/dice <amount>', description: 'Simple dice game - roll for random payouts' },
                    { name: '/crime <amount>', description: 'Commit crimes for money (risky, higher rewards, 30 second cooldown)' }
                ]
            },
            minigames: {
                title: '🎮 Mini Games',
                color: '#ff9500',
                commands: [
                    { name: '/chemistry', description: 'Chemistry knowledge game - test your chemistry skills' },
                    { name: '/loop', description: 'Number pattern game - find the pattern in sequences' }
                ]
            },
            utility: {
                title: '🔧 Utility Commands',
                color: '#0099ff',
                commands: [
                    { name: '/info', description: 'Show bot information, system stats, uptime, and useful links' },
                    { name: '/ping', description: 'Check bot latency and Discord API response time' },
                    { name: '/language personal <lang>', description: 'Set your personal language (en/vi/ja)' },
                    { name: '/language server <lang>', description: 'Set server default language (Admin only)' },
                    { name: '/language current', description: 'Show current language settings' }
                ]
            },
            admin: {
                title: '👑 Admin Commands',
                color: '#ff0000',
                commands: [
                    { name: '/admin24h enable <channel>', description: 'Enable 24/7 music mode in specified voice channel' },
                    { name: '/admin24h disable', description: 'Disable 24/7 music mode' },
                    { name: '/admin24h status', description: 'Check 24/7 system status and settings' },
                    { name: '/admingift create <code> <amount>', description: 'Create new gift codes with specified value' },
                    { name: '/admingift list', description: 'List all active gift codes and usage stats' },
                    { name: '/admingift delete <code>', description: 'Delete/deactivate a gift code' },
                    { name: '/economyadmin give <user> <amount>', description: 'Give money to a user' },
                    { name: '/economyadmin take <user> <amount>', description: 'Take money from a user' },
                    { name: '/economyadmin reset <user>', description: 'Reset a user\'s balance to 0' },
                    { name: '/economyadmin stats', description: 'Show server economy statistics' },
                    { name: '/chebal <equation>', description: 'Balance chemical equations (Admin chemistry tool)' },
                    { name: '/cleancache [type]', description: 'Clean cache and show system memory statistics' },
                    { name: '/resetslash', description: 'Reset and redeploy all slash commands' }
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
                text: 'Use /help <command> for detailed help • StoweBot v2.4',
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
                title: '🎵 Play Command',
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
            taixiu: {
                title: '🎲 Tài Xỉu Command',
                description: 'Traditional Vietnamese dice game (Sicbo) - bet on dice sum',
                usage: '/taixiu <amount>',
                examples: ['/taixiu 100', '/taixiu 500'],
                notes: 'Payouts: Tài (11-17) = 2x, Xỉu (4-10) = 2x, Triple = 180x, Specific numbers = 6x-60x. Three dice are rolled and summed.'
            },
            tomcuaca: {
                title: '🦐 Tôm Cua Cá Command',
                description: 'Vietnamese animal dice game with six betting options',
                usage: '/tomcuaca <amount>',
                examples: ['/tomcuaca 250', '/tomcuaca 1000'],
                notes: 'Bet on: 🦐 Tôm, 🦀 Cua, 🐟 Cá, 🦌 Nai, 🐓 Gà, 🦆 Nằm. Win if your animal appears on the dice. Multiple matches = higher payouts!'
            },
            work: {
                title: '💼 Work Command',
                description: 'Work various jobs to earn money with different outcomes',
                usage: '/work',
                examples: ['/work'],
                notes: 'Earn 100-500 coins per work session. Features multiple job types with random events. 15 second cooldown between uses.'
            },
            baccarat: {
                title: '🃏 Baccarat Command',
                description: 'Classic casino Baccarat card game',
                usage: '/baccarat <amount> <bet>',
                examples: [
                    '/baccarat 500 player',
                    '/baccarat 300 banker',
                    '/baccarat 100 tie'
                ],
                notes: 'Payouts: Player = 2x, Banker = 1.95x (5% commission), Tie = 9x. Cards 1-9 = face value, 10/J/Q/K = 0, A = 1. Closest to 9 wins.'
            },
            language: {
                title: '🌐 Language Command',
                description: 'Manage bot language settings with full i18n support',
                usage: '/language <subcommand> [language]',
                examples: [
                    '/language personal en',
                    '/language personal vi',
                    '/language server ja',
                    '/language current'
                ],
                notes: 'Supported: English (en), Vietnamese (vi), Japanese (ja). Personal settings override server defaults. Server language requires admin permissions.'
            },
            chemistry: {
                title: '🧪 Chemistry Game',
                description: 'Educational chemistry knowledge game with various topics',
                usage: '/chemistry',
                examples: ['/chemistry'],
                notes: 'Test your chemistry knowledge! Covers elements, compounds, reactions, and more. Educational and fun way to learn chemistry.'
            },
            info: {
                title: 'ℹ️ Info Command',
                description: 'Display comprehensive bot information and statistics',
                usage: '/info',
                examples: ['/info'],
                notes: 'Shows bot version, uptime, server count, memory usage, feature overview, and useful links including source code and documentation.'
            },
            admin24h: {
                title: '🎵 24/7 Admin Command',
                description: 'Manage continuous music playback system',
                usage: '/admin24h <enable|disable|status> [channel]',
                examples: [
                    '/admin24h enable #music',
                    '/admin24h disable',
                    '/admin24h status'
                ],
                notes: 'Admin only. Enables continuous background music from preset files. Useful for music lounges and radio-style channels.'
            }
        };

        const helpData = commandHelp[commandName];
        if (!helpData) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Command Not Found')
                .setDescription(`No help available for command: \`${commandName}\``)
                .addFields({
                    name: '💡 Available Commands',
                    value: 'Use `/help` without arguments to see all available commands, or try one of these categories:\n\n🎵 Music: `play`, `queue`, `skip`, `stop`, `resume`, `loop`\n💰 Economy: `balance`, `work`, `transfer`, `leaderboard`\n🎰 Gambling: `taixiu`, `tomcuaca`, `rps`, `baccarat`, `dice`\n🔧 Utility: `info`, `ping`, `language`, `help`',
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
                { name: '📝 Usage', value: `\`${helpData.usage}\``, inline: false },
                { name: '💡 Examples', value: helpData.examples.map(ex => `\`${ex}\``).join('\n'), inline: false },
                { name: '📋 Notes', value: helpData.notes, inline: false }
            )
            .setFooter({ 
                text: 'StoweBot v2.4 • Use /help for all commands',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};