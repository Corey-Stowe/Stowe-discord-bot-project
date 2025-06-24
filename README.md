# StoweBot

A comprehensive Discord bot built with Discord.js v14, featuring music playback, economy system, gambling games, chemistry tools, and multi-language support.

## Features

### 🎵 Music System
- **YouTube Integration** - Play videos and playlists directly from YouTube
- **24/7 Mode** - Continuous music playback with preset local files
- **Queue Management** - Advanced queue system with controls
- **Loop Modes** - Single song, queue, or off loop options
- **Audio Caching** - Downloads and caches audio files for better performance
- **Interactive Controls** - Button-based music controls
- **Playlist Support** - Support for YouTube playlists (up to 50 videos)

### 💰 Economy System
- **Virtual Currency** - Earn and spend coins through various activities
- **Work System** - Multiple job types with cooldowns
- **Balance Management** - Track user balances and transactions
- **Leaderboards** - Server-wide wealth rankings
- **Gift Codes** - Admin-created redeemable codes for rewards

### 🎰 Gambling Games
- **Tài Xỉu (Sicbo)** - Traditional Vietnamese dice game with multiple betting options
- **Tôm Cua Cá** - Vietnamese animal dice game
- **Rock Paper Scissors** - Classic game with money betting
- **Baccarat** - Card game with Player/Banker/Tie options
- **Crime System** - Risk-based money earning with multiple crime types

### 🧪 Chemistry Tools
- **Chemical Equation Balancer** - Automatically balance chemical equations
- **Element Lookup** - Periodic table information
- **Compound Database** - Common chemical compounds reference

### 🌐 Multi-Language Support
- **Language Management** - Support for English, Vietnamese, and Japanese
- **Personal Language Settings** - Users can set individual language preferences
- **Auto-Translation** - Automatic command scanning and translation generation
- **I18n Statistics** - Translation coverage and completion tracking

### 🔧 Advanced Features
- **Admin Management** - Comprehensive admin tools for all systems
- **Cache Management** - Automatic cleanup and size monitoring
- **System Statistics** - Detailed bot and system information
- **Help System** - Interactive categorized help with examples

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Corey-Stowe/Stowe-discord-bot-project.git
cd stowebot
```

2. Install dependencies:
```bash
npm install
```

3. Rename file `.env.example` to `.env.` file:
```env
CLIENT_ID=your_bot_client_id
ADMIN_ID=your_discord_user_id
GUILD_ID=your_test_guild_id

# Language Settings
BOT_LANGUAGE=en
# Available: en (English), vi (Vietnamese), ja (Japanese)
# Cache Management Configuration
CACHE_MAX_SIZE_MB=1024
CACHE_CLEANUP_COUNT=5
CACHE_AUTO_CLEANUP=true
```

4. Create required directories:
```bash
mkdir -p data/preset-music
mkdir -p downloads
mkdir -p data
```
5. Register slash command for bot:
```bash
npm run deploy
```

5. Start the bot:
```bash
npm start
```

## Project Structure

```
stowebot/
├── commands/              # Main slash command files
│   ├── play.js           # Music playback command
│   ├── queue.js          # Music queue management
│   ├── mode24h.js        # 24/7 music mode control
│   ├── nowplaying.js     # Current song display with controls
│   ├── loop.js           # Loop mode management
│   ├── resume.js         # Resume music playback
│   ├── taixiu.js         # Tài Xỉu gambling game
│   ├── tomcuaca.js       # Tôm Cua Cá gambling game
│   ├── crime.js          # Crime system for earning money
│   ├── chebal.js         # Chemical equation balancer
│   ├── language.js       # Language management system
│   ├── help.js           # Interactive help system
│   ├── info.js           # Bot and system information
│   ├── admin24h.js       # 24/7 system administration
│   └── cleancache.js     # Cache and download management
├── src/
│   ├── commands/         # Additional command modules
│   └── utils/            # Source utility modules
│       └── cacheManager.js # Cache management utility
├── utils/                # Core utility modules
│   ├── musicPlayer.js    # Main music playback engine
│   ├── preset24h.js      # 24/7 preset music system
│   ├── database.js       # File-based database operations
│   ├── userdata.js       # User economy data management
│   ├── giftCodeManager.js # Gift code system
│   └── i18n.js           # Internationalization system
├── Plugins/              # External service integrations
│   └── Youtube.js        # YouTube API integration
├── languages/            # Translation files
│   ├── en.json          # English translations
│   ├── vi.json          # Vietnamese translations
│   └── ja.json          # Japanese translations
├── data/                 # Data storage directory
│   ├── preset-music/    # 24/7 music files (.mp3, .flac, .wav)
│   ├── cache.json       # YouTube video cache
│   ├── queues.json      # Guild music queues
│   ├── userdata.json    # User economy data
│   ├── giftcodes.json   # Active gift codes
│   ├── guild_settings.json # Guild-specific settings
│   └── translations/     # Generated translation files
├── downloads/            # Temporary audio downloads
├── .env                 # Environment configuration
├── package.json
└── README.md
```

## Folder Structure Explained

### `/commands/` - Main Command Files
Contains all primary slash commands that users interact with. Each file represents a distinct bot feature:
- **Music Commands**: `play.js`, `queue.js`, `mode24h.js`, `nowplaying.js`, `loop.js`, `resume.js`
- **Economy Commands**: User balance and money management
- **Gambling Commands**: `taixiu.js`, `tomcuaca.js`, `crime.js` - Games for earning/losing money
- **Utility Commands**: `help.js`, `info.js`, `language.js`, `chebal.js`
- **Admin Commands**: `admin24h.js`, `cleancache.js` - Administrative tools

### `/utils/` - Core System Modules
Backend logic and data management:
- **`musicPlayer.js`** - Main music engine handling voice connections, playback, and queue management
- **`preset24h.js`** - 24/7 music system with local file scanning and playlist management
- **`database.js`** - JSON file-based database operations for queues and settings
- **`userdata.js`** - User economy system managing balances, transactions, and statistics
- **`giftCodeManager.js`** - Gift code creation, validation, and redemption system
- **`i18n.js`** - Multi-language support with automatic translation management

### `/Plugins/` - External Integrations
- **`Youtube.js`** - YouTube API wrapper for video/playlist information and audio extraction

### `/languages/` - Translation Files
JSON files containing translations for each supported language:
- **`en.json`** - English (default)
- **`vi.json`** - Vietnamese
- **`ja.json`** - Japanese

### `/data/` - Persistent Data Storage
- **`preset-music/`** - Local music files for 24/7 mode (supports .mp3, .flac, .wav, .ogg, .m4a)
- **`cache.json`** - YouTube video metadata cache for faster loading
- **`userdata.json`** - User profiles with balances, statistics, and game history
- **`queues.json`** - Per-guild music queues and settings
- **`giftcodes.json`** - Active gift codes and redemption history

### `/downloads/` - Temporary Files
Cached audio files downloaded from YouTube, automatically cleaned based on age and size limits

## Usage

### Music Commands
```bash
/play <url>              # Play YouTube video/playlist
/queue                   # Show current music queue
/nowplaying             # Show current song with controls
/loop <mode>            # Set loop mode (off/single/queue)
/resume                 # Resume playback from queue
/mode24h enable <channel> # Enable 24/7 mode
/mode24h status         # Check 24/7 mode status
```

### Economy & Gambling
```bash
/money [user]           # Check balance and profile
/work                   # Earn money (15s cooldown)
/taixiu <amount>        # Play Tài Xỉu dice game
/tomcuaca <amount>      # Play Vietnamese animal dice
/crime                  # Commit crimes for money (risky)
/redeem <code>          # Redeem gift codes
```

### Utility Commands
```bash
/help [command]         # Interactive help system
/info                   # Bot and system statistics
/language personal <lang> # Set personal language
/chebal <equation>      # Balance chemical equations
```

### Admin Commands
```bash
/admin24h update        # Scan preset music directory
/admin24h stats         # Show system statistics
/cleancache info        # Show detailed cache information
/admingift create <amount> # Create gift codes
/economyadmin give <user> <amount> # Manage user economy
```

## Configuration

### Required Permissions
- **Voice Permissions**: Connect, Speak in voice channels
- **Text Permissions**: Send Messages, Use Slash Commands
- **Guild Permissions**: Manage Server (for 24/7 mode setup)

### Environment Variables
```env
CLIENT_ID=your_bot_client_id
ADMIN_ID=your_discord_user_id
GUILD_ID=your_test_guild_id

# Language Settings
BOT_LANGUAGE=en
# Available: en (English), vi (Vietnamese), ja (Japanese)
# Cache Management Configuration
CACHE_MAX_SIZE_MB=1024
CACHE_CLEANUP_COUNT=5
CACHE_AUTO_CLEANUP=true
```

### 24/7 Mode Setup
1. Create directory: `data/preset-music/`
2. Add music files (.mp3, .flac, .wav, .ogg, .m4a)
3. Run `/admin24h update` to scan files
4. Use `/mode24h enable #channel` to start

## Key Technical Features

### Discord.js v14 Implementation
- ✅ **Modern Architecture** - Built with latest Discord.js features
- ✅ **Slash Commands** - Full application command support
- ✅ **Button Interactions** - Interactive UI components
- ✅ **Voice System** - @discordjs/voice integration

### Performance Optimizations
- ✅ **Intelligent Caching** - YouTube metadata and audio file caching
- ✅ **Memory Management** - Automatic cleanup of old files
- ✅ **Efficient Queuing** - JSON-based queue persistence
- ✅ **Size Monitoring** - Automatic cache size management

### Multi-Language System
- ✅ **Dynamic Translations** - Real-time language switching
- ✅ **User Preferences** - Individual language settings
- ✅ **Auto-Generation** - Automatic translation file management
- ✅ **Command Scanning** - Automatic detection of translatable strings

## Dependencies

```json
{
  "discord.js": "^14.x.x",
  "@discordjs/voice": "^0.16.x", 
  "@distube/ytdl-core": "^4.x.x",
  "sodium": "^3.x.x"
}
```

## Troubleshooting

### Common Issues
- **Voice Connection**: Check FFmpeg installation and voice permissions
- **YouTube Playback**: Verify ytdl-core compatibility and network connectivity
- **24/7 Mode**: Ensure music files exist in `/data/preset-music/` and run `/admin24h update`
- **Language Issues**: Check translation files in `/languages/` directory

### Performance Monitoring
- Use `/cleancache info` for comprehensive system statistics
- Monitor `/downloads/` folder size regularly
- Check `/admin24h stats` for 24/7 system health

## License

MIT License - see LICENSE file for details

## Support

- **Repository**: [GitHub Issues](https://github.com/Corey-Stowe/Stowe-discord-bot-project/issues)
- **Documentation**: This README and in-bot `/help` command

---
**Requirements**: Node.js 18+, FFmpeg, Discord Bot Token
