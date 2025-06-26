# StoweBot

A comprehensive Discord bot built with Discord.js v14, featuring music playback, economy system, gambling games, chemistry tools, and multi-language support.

## Features

### 🎵 Music System
- **YouTube Integration** - Play videos and playlists directly from YouTube
- **SoundCloud Support** - Stream music from SoundCloud tracks and playlists
- **Spotify Integration** - Play Spotify tracks, playlists, and albums (with YouTube/SoundCloud fallback for audio)
- **Multi-Platform Search** - Search across YouTube, SoundCloud, and Spotify with platform selection
- **Auto-Platform Detection** - Automatically detects platform from URLs
- **Smart Fallback System** - Spotify metadata with YouTube/SoundCloud audio streaming
- **Enhanced Matching** - Duration verification and ISRC-based matching for Spotify tracks
- **Match Quality Indicators** - Visual feedback showing audio source accuracy
- **24/7 Mode** - Continuous music playback with preset local files
- **Queue Management** - Advanced queue system with controls
- **Loop Modes** - Single song, queue, or off loop options
- **Audio Caching** - Downloads and caches audio files for better performance
- **Interactive Controls** - Button-based music controls
- **Playlist Support** - Support for YouTube playlists (up to 50 videos), SoundCloud sets, and Spotify playlists/albums

> **⚠️ Spotify Audio Limitation**: Spotify doesn't allow direct audio streaming through their API for third-party bots. When you request a Spotify track, the bot fetches metadata from Spotify but sources audio from YouTube/SoundCloud using an advanced matching algorithm with duration verification and quality indicators. See [SPOTIFY_MATCHING.md](SPOTIFY_MATCHING.md) for detailed information.

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

3. Rename file `.env.example` to `.env` file:
```env
# Required Discord Configuration
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_client_id
ADMIN_ID=your_discord_user_id
GUILD_ID=your_test_guild_id

# YouTube API Configuration (Recommended)
YOUTUBE_API_ENABLED=true          # Enable YouTube API functionality for users
YOUTUBE_PREFER_API=true           # Prefer API over cookies when both available

# Spotify API Credentials (optional - for Spotify support)
# Get these from: https://developer.spotify.com/dashboard/applications
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

# Language Settings
BOT_LANGUAGE=en
# Available: en (English), vi (Vietnamese), ja (Japanese)

# Cache Management Configuration
CACHE_MAX_SIZE_MB=1024
CACHE_CLEANUP_COUNT=5
CACHE_AUTO_CLEANUP=true
```

> **⚠️ Important YouTube Configuration:**
> - **`YOUTUBE_API_ENABLED=true`**: Allows users to add and manage their own YouTube Data API v3 keys via `/youtube` command for reliable, compliant access
> - **`YOUTUBE_API_ENABLED=false`**: Disables API functionality, relies only on cookie-based scraping (higher risk)
> - **`YOUTUBE_PREFER_API=true`**: When both API keys and cookies are available, prioritizes API for better performance and compliance
>
> **⚠️ Cookie Scraping Warning:** Cookie-based YouTube access may violate YouTube's Terms of Service and could result in account restrictions or IP bans. Use at your own risk. The YouTube API method is strongly recommended for production use.

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

## YouTube API Setup

StoweBot supports two methods for YouTube integration:

### 🔑 Method 1: YouTube Data API v3 (Recommended)

**Advantages:**
- ✅ Compliant with YouTube Terms of Service
- ✅ Faster and more reliable performance
- ✅ Better quota management and rate limiting
- ✅ No risk of account bans or IP blocking
- ✅ Multiple users can add their own API keys

**Setup Steps:**
1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the YouTube Data API v3
4. Create credentials (API Key)
5. (Optional) Configure API key restrictions for enhanced security
6. Set `YOUTUBE_API_ENABLED=true` in your `.env` file
7. Users can add their API keys using `/youtube add [key]` command

**User Commands:**
```bash
/youtube add [your-api-key]    # Add your YouTube API key
/youtube test                  # Test your API key functionality
/youtube quota                 # View your API quota usage
/youtube remove                # Remove your API key
```

### 🍪 Method 2: Cookie-Based Scraping (Fallback)

**⚠️ Important Warnings:**
- May violate YouTube's Terms of Service
- Risk of account restrictions or permanent bans
- Potential IP blocking and rate limiting issues
- Less reliable than official API
- Should only be used as temporary fallback

**Use Cases:**
- API quota exceeded temporarily
- Emergency fallback when API is unavailable
- Testing purposes only (not recommended for production)

**Admin Commands (Cookie Management):**
```bash
/cookies import               # Import cookies from file
/cookies status              # View current cookie status
/cookies refresh             # Refresh existing cookies
/cookies clear               # Clear all cookies
```

### � Method 3: Default Fallback (v2.4 Compatibility)

**When No API Keys or Cookies Are Configured:**
- ✅ Works out-of-the-box without any configuration
- ✅ Maintains backward compatibility with v2.4
- ✅ No setup required - just install and run
- ✅ Safe for testing and development
- ⚠️ Limited reliability compared to API method
- ⚠️ Subject to YouTube's rate limiting
- ⚠️ May experience occasional failures

**Perfect for:**
- Quick testing and development
- Users who don't want to configure API keys
- Backward compatibility with existing setups
- Small-scale personal use

**How It Works:**
The bot automatically detects if neither API keys nor cookies are configured and falls back to the basic YouTube scraping method used in v2.4, ensuring the bot continues to work without any special configuration.

### �📋 Configuration Examples

**Production Setup (Recommended):**
```env
YOUTUBE_API_ENABLED=true     # Users can add API keys
YOUTUBE_PREFER_API=true      # Prefer API over cookies
```

**Cookie-Only Setup (Not Recommended):**
```env
YOUTUBE_API_ENABLED=false    # Disable API functionality
YOUTUBE_PREFER_API=false     # Use only cookies
```

### 🔧 Configuration Variables Explained

#### YOUTUBE_API_ENABLED

This variable controls whether YouTube Data API v3 functionality is available to users.

**When `YOUTUBE_API_ENABLED=true` (Recommended):**
- ✅ `/youtube` command becomes available to all users
- ✅ Users can add their personal API keys via `/youtube add`
- ✅ API quota management and monitoring enabled
- ✅ Higher reliability and faster YouTube searches
- ✅ Compliance with YouTube Terms of Service
- ✅ Better playlist support and metadata
- ✅ **Best for:** Production environments, public bots, compliance-focused deployments

**When `YOUTUBE_API_ENABLED=false` (Not Recommended):**
- ❌ `/youtube` command is completely disabled
- ❌ No API key functionality available
- ⚠️ Falls back to cookie-based scraping only
- ⚠️ Higher risk of rate limiting and blocks
- ⚠️ Potential Terms of Service violations
- ⚠️ Less reliable YouTube functionality
- ⚠️ **Use cases:** Testing, temporary fallback, personal-use-only bots

#### YOUTUBE_PREFER_API

This variable controls which method is prioritized when both API keys and cookies are available.

**When `YOUTUBE_PREFER_API=true` (Recommended):**
- 🥇 **First Priority:** Check if user has valid API key
- 🥈 **Fallback:** Use cookies if no API key available
- ⚡ Faster response times with API
- 📊 Better quota management
- 🛡️ Higher compliance and reliability
- 🎯 **Result:** Maximum performance with compliant fallback

**When `YOUTUBE_PREFER_API=false` (Advanced Use):**
- 🥇 **First Priority:** Use cookies for scraping
- 🥈 **Fallback:** Use API key if cookies fail
- ⚠️ Higher risk of detection and blocking
- 🐌 Potentially slower responses
- ❓ Less predictable behavior
- 🔧 **Use case:** Testing cookie functionality, debugging

#### Configuration Combinations

| YOUTUBE_API_ENABLED | YOUTUBE_PREFER_API | Behavior | Use Case |
|--------------------|--------------------|----------|----------|
| `true` | `true` | 🏆 API first, cookies fallback | **Production (Recommended)** |
| `true` | `false` | 🔧 Cookies first, API fallback | Development/Testing |
| `false` | `true` | ⚠️ Cookies only (preference ignored) | Cookie-only mode |
| `false` | `false` | ⚠️ Cookies only | Cookie-only mode |

### 💡 Configuration Tips

- **For production:** Always use `YOUTUBE_API_ENABLED=true` with `YOUTUBE_PREFER_API=true`
- **For development:** Enable API but test both methods by toggling preference
- **For private use:** Consider cookie-only if you accept the risks
- **Migration:** Start with API enabled and migrate users gradually

### 📚 Additional Resources

For detailed setup instructions, see:
- [YOUTUBE_API_SETUP.md](YOUTUBE_API_SETUP.md) - Complete YouTube API setup guide
- [COOKIE_SETUP.md](COOKIE_SETUP.md) - Cookie extraction and import guide

## Project Structure

```
stowebot/
├── commands/                 # Main slash command files
│   ├── play.js              # 🎵 Multi-platform music playback (YouTube/SoundCloud/Spotify)
│   ├── queue.js             # 📋 Music queue management and display
│   ├── skip.js              # ⏭️ Skip current song
│   ├── stop.js              # ⏹️ Stop playback and clear queue
│   ├── pause.js             # ⏸️ Pause current song
│   ├── resume.js            # ▶️ Resume music playback
│   ├── nowplaying.js        # 🎶 Current song display with interactive controls
│   ├── loop.js              # 🔄 Loop mode management (off/single/queue)
│   ├── mode24h.js           # 🕐 24/7 music mode control
│   ├── balance.js           # 💰 Check user balance and profile
│   ├── money.js             # 💵 Detailed balance information
│   ├── work.js              # 👷 Work for money (economy system)
│   ├── transfer.js          # 💸 Transfer money between users
│   ├── leaderboard.js       # 🏆 Server wealth rankings
│   ├── redeem.js            # 🎁 Redeem gift codes
│   ├── taixiu.js            # 🎲 Vietnamese Tài Xỉu (High/Low) dice game
│   ├── tomcuaca.js          # 🦐 Vietnamese Tôm Cua Cá animal dice game
│   ├── dice.js              # 🎯 Simple dice gambling
│   ├── rps.js               # ✂️ Rock Paper Scissors with betting
│   ├── baccarat.js          # 🃏 Baccarat card game
│   ├── crime.js             # 🕵️ Crime system for earning money (risky)
│   ├── chemistry.js         # 🧪 Chemical equation balancer
│   ├── language.js          # 🌐 Language management system
│   ├── help.js              # ❓ Interactive categorized help system
│   ├── info.js              # ℹ️ Bot and system information
│   ├── ping.js              # 📡 Bot latency checker
│   ├── admin24h.js          # 👑 24/7 system administration
│   ├── admingift.js         # 🎁 Gift code management (admin)
│   ├── economyadmin.js      # 💼 Economy system administration
│   └── cleancache.js        # 🧹 Cache and download management
├── src/
│   ├── commands/            # Additional command modules
│   │   └── cleancache.js    # Enhanced cache management command
│   └── utils/               # Source utility modules
│       └── cacheManager.js  # Advanced cache management utility
├── utils/                   # Core utility modules
│   ├── musicPlayer.js       # 🎵 Main music playback engine with multi-platform support
│   ├── preset24h.js         # 🕐 24/7 preset music system and local file management
│   ├── database.js          # 💾 File-based database operations (JSON)
│   ├── userdata.js          # 👤 User economy data management and statistics
│   ├── economy.js           # 💰 Economy system core functions
│   ├── giftCodeManager.js   # 🎁 Gift code creation, validation, and redemption
│   ├── i18n.js              # 🌐 Internationalization system with auto-translation
│   ├── logger.js            # 📝 Advanced logging system with categories
│   └── audioDownloader.js   # 📥 Audio file downloading and caching system
├── Plugins/                 # External service integrations
│   ├── Youtube.js           # 🔴 YouTube API integration and video processing
│   ├── SoundCloud.js        # 🟠 SoundCloud integration with streaming support
│   └── Spotify.js           # 🟢 Spotify Web API integration with fallback system
├── i18n/                    # Translation files
│   ├── config.json          # i18n system configuration
│   ├── status.json          # Translation status and statistics
│   ├── en.json              # 🇺🇸 English translations (primary)
│   ├── vi.json              # 🇻🇳 Vietnamese translations
│   └── ja.json              # 🇯🇵 Japanese translations
├── data/                    # Data storage directory
│   ├── preset-music/        # 🎵 24/7 music files (.mp3, .flac, .wav, .ogg, .m4a)
│   ├── cache.json           # 📋 YouTube video metadata cache
│   ├── queues.json          # 🎶 Guild music queues and settings
│   ├── userdata.json        # 👤 User profiles, balances, and game statistics
│   ├── economy.json         # 💰 Economy system data and transactions
│   ├── giftcodes.json       # 🎁 Active gift codes and redemption history
│   ├── giftcode-config.json # ⚙️ Gift code system configuration
│   ├── giftcode_history.json # 📊 Gift code redemption history
│   └── guild_settings.json  # 🏰 Guild-specific settings and preferences
├── downloads/               # 📥 Temporary audio downloads (auto-managed)
├── logs/                    # 📝 Application logs (daily rotation)
│   ├── 2025-06-24.log      # Daily log files
│   └── 2025-06-25.log      # Current day log
├── .env                     # 🔐 Environment configuration
├── .env.example             # 📋 Environment configuration template
├── package.json             # 📦 Node.js dependencies and scripts
├── index.js                 # 🚀 Main bot entry point
├── slashbuilder.js          # ⚙️ Slash command deployment script
├── resetslash.js            # 🔄 Slash command reset utility
├── README.md                # 📖 This documentation
├── SOUNDCLOUD_USAGE.md      # 🟠 SoundCloud integration guide
├── SPOTIFY_USAGE.md         # 🟢 Spotify integration guide
├── SPOTIFY_MATCHING.md      # 🎯 Spotify matching algorithm documentation
├── SOUNDCLOUD_FIX.md        # 🔧 SoundCloud streaming fix documentation
├── SPOTIFY_SOLUTION.md      # 💡 Spotify implementation solution
└── IMPLEMENTATION_SUMMARY.md # 📋 Complete implementation summary
```

## Detailed Folder Structure

### 📁 `/commands/` - Main Command Files
**Purpose**: Contains all primary slash commands that users interact with
**Categories**:
- **🎵 Music Commands**: `play.js`, `queue.js`, `skip.js`, `stop.js`, `pause.js`, `resume.js`, `nowplaying.js`, `loop.js`, `mode24h.js`
- **💰 Economy Commands**: `balance.js`, `money.js`, `work.js`, `transfer.js`, `leaderboard.js`, `redeem.js`
- **🎰 Gambling Commands**: `taixiu.js`, `tomcuaca.js`, `dice.js`, `rps.js`, `baccarat.js`, `crime.js`
- **🔧 Utility Commands**: `help.js`, `info.js`, `ping.js`, `language.js`, `chemistry.js`
- **👑 Admin Commands**: `admin24h.js`, `admingift.js`, `economyadmin.js`, `cleancache.js`

### 📁 `/utils/` - Core System Modules
**Purpose**: Backend logic and data management systems
**Key Modules**:
- **`musicPlayer.js`** - Multi-platform music engine with YouTube/SoundCloud/Spotify support
- **`preset24h.js`** - 24/7 music system with local file scanning and management
- **`database.js`** - JSON file-based database for queues, settings, and persistence
- **`userdata.js`** - User economy profiles, balances, statistics, and game history
- **`giftCodeManager.js`** - Gift code lifecycle management and redemption tracking
- **`i18n.js`** - Advanced internationalization with auto-translation and caching
- **`logger.js`** - Structured logging system with categories and file rotation
- **`audioDownloader.js`** - Audio caching system with size management and cleanup

### 📁 `/Plugins/` - External Service Integrations
**Purpose**: Third-party platform integrations and API wrappers
**Services**:
- **`Youtube.js`** - YouTube Data API v3 integration, video/playlist processing, audio extraction
- **`SoundCloud.js`** - SoundCloud unofficial API integration with track/playlist streaming
- **`Spotify.js`** - Spotify Web API integration with metadata extraction and fallback logic

### 📁 `/i18n/` - Internationalization System
**Purpose**: Multi-language support and translation management
**Files**:
- **`config.json`** - i18n system configuration and settings
- **`status.json`** - Translation completion status and statistics
- **Language Files** - Complete translations for all supported languages
  - `en.json` - English (primary language)
  - `vi.json` - Vietnamese (full support)
  - `ja.json` - Japanese (full support)

### 📁 `/data/` - Persistent Data Storage
**Purpose**: All bot data persistence and configuration storage
**Critical Files**:
- **`preset-music/`** - Local music library for 24/7 mode (supports multiple formats)
- **`cache.json`** - YouTube metadata cache for performance optimization
- **`userdata.json`** - User profiles with economy data, statistics, and preferences
- **`queues.json`** - Per-guild music queues with persistence across restarts
- **`economy.json`** - Economy system transactions and global statistics
- **Gift Code System** - `giftcodes.json`, `giftcode-config.json`, `giftcode_history.json`
- **`guild_settings.json`** - Guild-specific configurations and preferences

### 📁 `/downloads/` - Temporary Audio Cache
**Purpose**: Downloaded audio file storage with automatic management
**Features**:
- Automatic size monitoring and cleanup
- Configurable maximum cache size
- Age-based file removal
- Performance optimization for repeated playback

### 📁 `/logs/` - Application Logging
**Purpose**: Structured logging with daily file rotation
**Features**:
- Daily log file creation
- Categorized logging (MUSIC, ECONOMY, SYSTEM, ERROR)
- Automatic log rotation and cleanup
- Performance and error tracking

## Usage

### 🎵 Music Commands
```bash
# Basic Playback
/play <url>                    # Play YouTube/SoundCloud/Spotify URL
/play <query>                  # Search for music (auto-detect best platform)
/play <query> platform:youtube # Search specifically on YouTube
/play <query> platform:soundcloud # Search specifically on SoundCloud
/play <query> platform:spotify # Search specifically on Spotify
/play <query> platform:auto    # Search all platforms (YouTube → SoundCloud → Spotify)
/play <query> autoselect:false # Show search results to choose from

# Queue Management
/queue                         # Show current music queue
/skip                         # Skip current song
/stop                         # Stop playback and clear queue
/pause                        # Pause current song
/resume                       # Resume playback

# Playback Controls
/nowplaying                   # Show current song with interactive controls
/loop off                     # Disable loop
/loop single                  # Loop current song
/loop queue                   # Loop entire queue

# 24/7 Mode (Admin)
/mode24h enable <channel>     # Enable 24/7 mode in voice channel
/mode24h disable              # Disable 24/7 mode
/mode24h status               # Check 24/7 mode status
```

### 💰 Economy Commands
```bash
# Balance Management
/balance                      # Check your balance
/balance <user>               # Check another user's balance
/money                        # Same as /balance with detailed stats
/leaderboard                  # Server wealth rankings

# Earning Money
/work                         # Work for money (15s cooldown)
/crime                        # Commit crimes for money (risky, 30s cooldown)

# Transactions
/transfer <user> <amount>     # Transfer money to another user
/redeem <code>                # Redeem gift codes
```

### 🎰 Gambling Commands
```bash
# Dice Games
/taixiu <amount>              # Vietnamese Tài Xỉu (High/Low) dice game
/tomcuaca <amount>            # Vietnamese Tôm Cua Cá animal dice game
/dice <amount>                # Simple dice roll gambling
/rps <amount>                 # Rock Paper Scissors with money betting

# Card Games
/baccarat <amount> <bet>      # Baccarat (player/banker/tie)
```

### 🧪 Chemistry Commands
```bash
/chemistry <equation>         # Balance chemical equations
/chemistry help               # Chemistry command help
```

### 🌐 Language Commands
```bash
/language personal <lang>     # Set your personal language (en/vi/ja)
/language server <lang>       # Set server default language (Admin only)
/language status              # Show current language settings
```

### 🔧 Utility Commands
```bash
/help                         # Interactive help system
/help <command>               # Get help for specific command
/info                         # Bot and system statistics
/ping                         # Check bot latency
```

### � YouTube API Management (User Commands)
```bash
/youtube add <api-key>        # Add your personal YouTube Data API v3 key
/youtube test                 # Test your API key functionality
/youtube quota                # View your API quota usage and limits
/youtube remove               # Remove your API key from the system
```

### �👑 Admin Commands
```bash
# 24/7 System Management
/admin24h update              # Scan preset music directory
/admin24h stats               # Show system statistics
/admin24h playlist            # Manage 24/7 playlist

# Cache & System Management
/cleancache info              # Show detailed cache information
/cleancache clear             # Clear download cache
/cleancache stats             # Show cache statistics
/cleancache cookies           # Clear YouTube cookies (admin only)
/cleancache apikeys           # Clear all YouTube API keys (admin only)

# YouTube Cookie Management (Admin Only - Use at Own Risk)
/cookies import               # Import YouTube cookies from file
/cookies status               # View current cookie status and health
/cookies refresh              # Refresh and validate existing cookies
/cookies clear                # Clear all stored cookies

# Economy Management
/admingift create <amount> <uses> # Create gift codes
/admingift list               # List active gift codes
/economyadmin give <user> <amount> # Give money to user
/economyadmin take <user> <amount> # Take money from user
/economyadmin reset <user>    # Reset user's economy data
/economyadmin stats           # Economy system statistics
```

> **⚠️ Admin Cookie Commands Warning:** The `/cookies` commands are for YouTube cookie management and should be used with extreme caution. Cookie-based scraping may violate YouTube's Terms of Service and could result in account restrictions. These commands are provided for emergency fallback situations only.

## Development Guide

### Prerequisites
- **Node.js** 16.9.0 or higher
- **FFmpeg** (for audio processing)
- **Git** (for version control)
- **Discord Bot Token** (from Discord Developer Portal)
- **Spotify API Credentials** (optional, for Spotify support)

### Development Setup

1. **Clone Repository**
```bash
git clone https://github.com/Corey-Stowe/Stowe-discord-bot-project.git
cd stowebot
```

2. **Install Dependencies**
```bash
npm install
```

3. **Environment Configuration**
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Create Required Directories**
```bash
mkdir -p data/preset-music
mkdir -p downloads
mkdir -p logs
mkdir -p i18n
```

5. **Deploy Slash Commands**
```bash
npm run deploy
```

6. **Development Scripts**
```bash
npm start              # Start the bot
npm run dev            # Start with nodemon (auto-restart)
npm run deploy         # Deploy slash commands
npm run test           # Run tests (if available)
npm run lint           # Code linting
```

### Code Structure

#### Command Development
```javascript
// commands/example.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('example')
        .setDescription('Example command'),

    async execute(interaction) {
        // Command logic here
        await interaction.reply('Hello World!');
    }
};
```

#### Plugin Development
```javascript
// Plugins/ExampleService.js
class ExampleService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        // Service initialization
    }

    async search(query) {
        // Service-specific logic
    }
}

module.exports = ExampleService;
```

#### Utility Development
```javascript
// utils/exampleUtil.js
class ExampleUtil {
    static format(data) {
        // Utility functions
    }
}

module.exports = ExampleUtil;
```

### Adding New Languages

1. **Create Translation File**
```bash
touch i18n/newlang.json
```

2. **Add Translations**
```json
{
    "common": {
        "error": "Error message",
        "success": "Success message"
    },
    "commands": {
        "example": {
            "description": "Command description"
        }
    }
}
```

3. **Update i18n Configuration**
```javascript
// utils/i18n.js
supportedLanguages: ['en', 'vi', 'ja', 'newlang']
```

### Testing Guidelines

#### Manual Testing
```bash
# Test music playback
/play https://youtube.com/watch?v=example
/play query platform:spotify

# Test economy system
/work
/balance
/taixiu 100

# Test admin functions
/admin24h stats
/cleancache info
```

#### Debugging
```javascript
// Enable debug logging
console.log('Debug info:', data);

// Error handling
try {
    // risky operation
} catch (error) {
    console.error('Error:', error);
    logger.error('MODULE', 'Error description', error);
}
```

### Performance Optimization

#### Cache Management
- Monitor `/downloads/` folder size
- Use `/cleancache info` for statistics
- Implement cleanup strategies for large deployments

#### Memory Usage
- Clear unused Discord.js collections
- Implement pagination for large queues
- Use streaming for large audio files

#### Database Optimization
- Backup JSON files regularly
- Implement data migration scripts
- Monitor file sizes and performance

### Deployment

#### Production Setup
```bash
# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start index.js --name stowebot

# PM2 commands
pm2 stop stowebot
pm2 restart stowebot
pm2 logs stowebot
pm2 monit
```

#### Environment Variables (Production)
```env
NODE_ENV=production
TOKEN=your_production_bot_token
ADMIN_ID=your_discord_user_id
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
BOT_LANGUAGE=en
CACHE_MAX_SIZE_MB=2048
CACHE_AUTO_CLEANUP=true
```

#### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Contributing

#### Code Standards
- Use ESLint configuration
- Follow Discord.js v14 patterns
- Implement proper error handling
- Add JSDoc comments for functions
- Use async/await for promises

#### Pull Request Process
1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

#### Issue Reporting
- Use issue templates
- Provide detailed reproduction steps
- Include bot logs and error messages
- Specify Discord.js and Node.js versions

## Configuration

### Required Permissions
- **Voice Permissions**: Connect, Speak in voice channels
- **Text Permissions**: Send Messages, Use Slash Commands
- **Guild Permissions**: Manage Server (for 24/7 mode setup)

### Environment Variables
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_client_id
ADMIN_ID=your_discord_user_id
GUILD_ID=your_test_guild_id

# YouTube API Configuration
YOUTUBE_API_ENABLED=true
YOUTUBE_PREFER_API=true

# Spotify API Credentials (optional)
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

# Bot Configuration
BOT_LANGUAGE=en

# Cache Management
CACHE_MAX_SIZE_MB=1024
CACHE_CLEANUP_COUNT=5
CACHE_AUTO_CLEANUP=true
```
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

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

## Version History

### � v2.5 - Enhanced YouTube Integration & API System (Current)
**Release Date**: June 2025
**Major Features**:
- ✅ **YouTube Data API v3 Integration** - Official API support with multi-user key management
- ✅ **Three-Tier Fallback System** - API → Cookies → Default (v2.4 compatibility)
- ✅ **User-Managed API Keys** - `/youtube` command for personal API key management
- ✅ **Enhanced Cookie System** - Advanced cookie validation and rotation via `/cookies` command
- ✅ **Automatic Method Detection** - Intelligent fallback ensures bot works without configuration
- ✅ **Quota Management** - Real-time API quota tracking and key rotation
- ✅ **Comprehensive Documentation** - Setup guides for API and cookie configurations
- ✅ **Admin Tools** - Enhanced `/cleancache` and `/info` commands for system monitoring
- ✅ **Improved Error Handling** - Fixed i18n null-safety issues and enhanced user feedback

**Technical Improvements**:
- Added `youtubeApiManager.js` for API key lifecycle management
- Enhanced `cookieManager.js` with validation and automatic refresh
- Updated YouTube plugin with intelligent method selection
- Improved logging with method-specific feedback
- Enhanced environment configuration with `.env.example`

### 🚀 v2.4 - Multi-Platform Music Integration
**Release Date**: May 2025
**Major Features**:
- ✅ **Spotify Integration** - Full Spotify track, playlist, and album support with YouTube/SoundCloud fallback
- ✅ **Enhanced SoundCloud Support** - Improved streaming reliability and playlist handling
- ✅ **Advanced Music Search** - Multi-platform search with auto-detection and manual selection
- ✅ **Smart Matching Algorithm** - Duration verification and ISRC-based matching for accurate audio sourcing
- ✅ **Platform Detection** - Automatic URL detection and appropriate streaming method selection
- ✅ **Enhanced User Experience** - Visual match quality indicators and transparent audio source display
Fixed Bug
- When you used `/play` with a playlist URL, all songs were added to the queue
- The bot didn't check if music was currently playing
- If nothing was playing, the first song should start automatically, but it didn't
- Users had to manually use `/resume` to start playback
**Technical Improvements**:
- Enhanced `musicPlayer.js` with platform-specific audio resolution
- Added `Plugins/Spotify.js` for Spotify Web API integration
- Improved `Plugins/SoundCloud.js` with better stream handling
- Advanced matching algorithm with duration tolerance and metadata verification
- Better error handling and user feedback systems

**Bug Fixes**:
- Fixed "Invalid YouTube URL" errors for SoundCloud tracks
- Resolved stream expiration issues
- Improved platform-specific error messages
- Enhanced fallback chain reliability

---

### 🎯 v2.3 - Economy & Gambling Enhancement
**Release Date**: May 2025
**Major Features**:
- ✅ **Enhanced Economy System** - Improved balance management and transaction logging
- ✅ **Advanced Gambling Games** - Tài Xỉu, Tôm Cua Cá, Baccarat, and Crime system
- ✅ **Gift Code System** - Admin-managed gift codes with redemption tracking
- ✅ **Leaderboards** - Server-wide wealth rankings and statistics
- ✅ **User Profiles** - Detailed user statistics and gambling history

**Technical Improvements**:
- Redesigned `userdata.js` for better data management
- Added `giftCodeManager.js` for gift code operations
- Enhanced admin tools for economy management
- Improved data persistence and backup systems

---

### 🌐 v2.2 - Multi-Language Support (i18n)
**Release Date**: April 2025
**Major Features**:
- ✅ **Multi-Language System** - Support for English, Vietnamese, and Japanese
- ✅ **Personal Language Preferences** - Individual user language settings
- ✅ **Dynamic Translation** - Real-time language switching without restart
- ✅ **Auto-Translation Management** - Automatic command scanning and translation generation
- ✅ **Translation Statistics** - Coverage tracking and completion monitoring

**Technical Improvements**:
- Complete rewrite of `utils/i18n.js` with advanced features
- Added translation files in `/i18n/` directory
- Implemented user language caching system
- Enhanced placeholder replacement with regex safety
- Added translation status monitoring and export features

**Supported Languages**:
- 🇺🇸 English (en) - Primary
- 🇻🇳 Vietnamese (vi) - Full support
- 🇯🇵 Japanese (ja) - Full support

---

### 🎵 v2.1 - Music Service Reliability Fix
**Release Date**: March 2025
**Major Features**:
- ✅ **Improved YouTube Integration** - Enhanced `ytdl-core` implementation
- ✅ **Audio Quality Enhancement** - Better format selection and quality options
- ✅ **Queue Persistence** - Reliable queue storage and restoration
- ✅ **24/7 Mode Stability** - Improved continuous playback reliability
- ✅ **Error Recovery** - Better handling of stream failures and reconnections

**Technical Improvements**:
- Enhanced `musicPlayer.js` with better error handling
- Improved `preset24h.js` for local file management
- Better voice connection stability
- Enhanced cache management for downloaded audio

**Bug Fixes**:
- Fixed queue corruption issues
- Resolved voice connection drops
- Improved audio stream reliability
- Enhanced error messaging for users

---

### ⚡ v2.0 - Discord.js v14 Native Implementation
**Release Date**: February 2025
**Major Features**:
- ✅ **Discord.js v14 Upgrade** - Complete migration to latest Discord.js version
- ✅ **Native Audio System** - Removed Lavalink dependency, using @discordjs/voice
- ✅ **Slash Commands** - Full application command implementation
- ✅ **Button Interactions** - Interactive UI components for music controls
- ✅ **Modern Architecture** - Complete codebase restructure

**Technical Improvements**:
- Replaced Lavalink with native @discordjs/voice
- Redesigned command system with slash commands
- Enhanced voice connection management
- Improved error handling and logging
- Modern JavaScript patterns (async/await, ES6+)

**Breaking Changes**:
- Removed Lavalink dependency
- Migrated from prefix commands to slash commands
- Updated voice connection system
- Changed configuration format

---

### 🔧 v1.2 - Playlist & Playback Fixes
**Release Date**: January 2025
**Major Features**:
- ✅ **YouTube Playlist Support** - Fixed playlist parsing and playback
- ✅ **Queue Management** - Enhanced queue operations and persistence
- ✅ **Playback Reliability** - Improved track transition and error handling
- ✅ **Audio Caching** - Basic audio file caching system

**Technical Improvements**:
- Fixed playlist URL parsing issues
- Enhanced queue data structure
- Improved audio stream handling
- Added basic caching mechanisms

**Bug Fixes**:
- Fixed playlist track ordering
- Resolved audio skipping issues
- Improved error recovery
- Enhanced user feedback

---

### 🎉 v1.0 - Initial Release
**Release Date**: December 2024
**Major Features**:
- ✅ **Discord.js v13 Foundation** - Initial bot framework
- ✅ **Lavalink Integration** - Music playback using Lavalink
- ✅ **Basic Commands** - Essential music and utility commands
- ✅ **YouTube Support** - Basic YouTube video playback
- ✅ **Simple Queue System** - Basic music queue functionality

**Initial Implementation**:
- Discord.js v13 bot framework
- Lavalink for music playback
- Basic prefix command system
- Simple queue management
- YouTube integration only

---

## Roadmap

### 🔮 v2.5 - Planned Features
- 🔄 **Apple Music Integration** - Support for Apple Music links and playlists
- 🔄 **Advanced Playlist Management** - Playlist creation, sharing, and management
- 🔄 **User Music Preferences** - Personal music settings and favorites
- 🔄 **Audio Effects** - Equalizer, bass boost, and audio filters
- 🔄 **Voice Channel Management** - Auto-join, auto-leave, and smart voice features

### 🔮 v3.0 - Future Vision
- 🔄 **Web Dashboard** - Browser-based bot management interface
- 🔄 **Music Discovery** - Recommendation system and trending music
- 🔄 **Social Features** - Music sharing, collaborative playlists, and listening parties
- 🔄 **Advanced Analytics** - Detailed usage statistics and insights
- 🔄 **Mobile App** - Companion mobile application for remote control

---

## License

MIT License - see LICENSE file for details

## Support

- **Repository**: [GitHub Issues](https://github.com/Corey-Stowe/Stowe-discord-bot-project/issues)
- **Documentation**: This README and in-bot `/help` command

---
**Requirements**: Node.js 16.9.0+, FFmpeg, Discord Bot Token
