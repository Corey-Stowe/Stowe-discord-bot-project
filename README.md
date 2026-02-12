# StoweBot Free

A free, open-source Discord music bot built with Discord.js v14 and DisTube v5. Supports YouTube, Spotify, SoundCloud, 24/7 playback, and multi-language support.

## Features

### Music System
- **YouTube** - Play videos and playlists directly from YouTube via yt-dlp
- **Spotify** - Play Spotify tracks, playlists, and albums (audio sourced from YouTube)
- **SoundCloud** - Stream tracks and playlists from SoundCloud
- **Multi-Platform Search** - Search across platforms with `/play <query> platform:<name>`
- **Auto-Platform Detection** - Automatically detects platform from URLs
- **24/7 Mode** - Continuous music playback with preset local files
- **Queue Management** - Full queue with skip, loop, and interactive controls
- **Loop Modes** - Single song, queue, or off
- **Music Recommendations** - Auto-suggestions based on listening history and Last.fm

### Multi-Language Support
- English, Vietnamese, Japanese
- Per-user language preferences via `/language set`

## Quick Start

### Prerequisites
- **Node.js** 18+ (recommended: 20 LTS)
- **FFmpeg** installed and in PATH
- **Discord Bot Token** from [Discord Developer Portal](https://discord.com/developers/applications)

### Installation

```bash
git clone <your-repo-url>
cd stowebot-free
cp .env.example .env
# Edit .env with your Discord bot token and client ID
npm install
npm run deploy   # Register slash commands with Discord
npm start        # Start the bot
```

### Development Mode

```bash
npm run dev      # Auto-restarts on file changes
```

## Commands

### Music
| Command | Description |
|---------|-------------|
| `/play <url\|query>` | Play from YouTube, Spotify, or SoundCloud |
| `/play <query> platform:youtube` | Search a specific platform |
| `/play <query> autoselect:false` | Choose from search results manually |
| `/queue` | Show current music queue |
| `/skip` | Skip current song |
| `/stop` | Stop playback and clear queue |
| `/pause` | Pause current song |
| `/resume` | Resume playback |
| `/nowplaying` | Show current song with controls |
| `/loop <off\|single\|queue>` | Set loop mode |

### 24/7 Mode (Admin)
| Command | Description |
|---------|-------------|
| `/mode24h enable <channel>` | Enable 24/7 mode in a voice channel |
| `/mode24h disable` | Disable 24/7 mode |
| `/mode24h status` | Check 24/7 status |
| `/admin24h update` | Scan preset music directory |
| `/admin24h stats` | Show 24/7 system statistics |

### Recommendations
| Command | Description |
|---------|-------------|
| `/suggestion auto enabled:true` | Enable auto-suggestions |
| `/suggestion list type:trending` | Get music recommendations |
| `/suggestion stats` | View listening statistics |

### Utility
| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/help <command>` | Detailed help for a command |
| `/info` | Bot and system statistics |
| `/ping` | Check bot latency |
| `/language set <en\|vi\|ja>` | Set your language |
| `/cleancache [type]` | Cache management (Admin) |

## Configuration

### Required
```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
ADMIN_ID=your_discord_user_id
```

### Optional
```env
# Guild-specific command deployment (faster for development)
GUILD_ID=your_test_guild_id

# Spotify support
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# Last.fm recommendations
LASTFM_API_KEY=your_lastfm_api_key
LASTFM_SHARED_SECRET=your_lastfm_shared_secret

# Language (default: en)
BOT_LANGUAGE=en

# Cache limits
CACHE_MAX_SIZE_MB=500
CACHE_CLEANUP_COUNT=5
CACHE_AUTO_CLEANUP=true
```

## 24/7 Mode Setup

1. Add music files to `data/preset-music/` (supports `.mp3`, `.flac`, `.wav`, `.ogg`, `.m4a`)
2. Run `/admin24h update` to scan files
3. Use `/mode24h enable #channel` to start continuous playback

## Project Structure

```
stowebot-free/
  commands/          # Slash command handlers
    play.js          # Multi-platform music playback
    queue.js         # Queue display and management
    skip.js          # Skip current song
    stop.js          # Stop and clear queue
    pause.js         # Pause playback
    resume.js        # Resume playback
    nowplaying.js    # Current song display
    loop.js          # Loop mode control
    mode24h.js       # 24/7 mode toggle
    admin24h.js      # 24/7 admin management
    suggestion.js    # Music recommendations
    language.js      # Language settings
    help.js          # Help system
    ping.js          # Latency check
    info.js          # Bot statistics
    cleancache.js    # Cache management
  utils/             # Core modules
    musicPlayer.js   # Main music engine (DisTube wrapper)
    preset24h.js     # 24/7 preset music system
    database.js      # JSON file database
    logger.js        # Logging system
    cacheManager.js  # Cache cleanup
    i18n.js          # Internationalization
    ytdlpSearch.js   # yt-dlp search utility
    recommendationEngine.js  # Music recommendations
  Plugins/
    LastFm.js        # Last.fm API integration
  scripts/
    patch-ytdlp.js   # Postinstall patch for yt-dlp
  i18n/              # Translation files (en, vi, ja)
  data/
    preset-music/    # 24/7 music files (add your own)
  downloads/         # Audio cache (auto-managed)
  logs/              # Application logs
  index.js           # Bot entry point
  slashbuilder.js    # Command deployment
  resetslash.js      # Command reset utility
  package.json
  .env.example
```

## Requirements

- Node.js 18+
- FFmpeg
- Discord Bot Token

## License

MIT License
