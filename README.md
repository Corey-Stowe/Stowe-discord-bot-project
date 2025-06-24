# StoweBot

A lightweight Discord music bot built with Discord.js v14, designed to be simple, fast, and dependency-free with advanced 24/7 preset music support.

## Features

- 🎵 **Music Playbook** - Play music from YouTube and other sources
- ⚡ **Lightweight** - No third-party music libraries like Lavalink required
- 🔄 **Discord.js v14** - Built with the latest Discord.js version
- 🎛️ **Queue Management** - Add, skip, pause, and manage your music queue
- 🕰️ **24/7 Mode** - Continuous music playback with preset local files
- 💾 **Local Audio Caching** - Downloads and caches audio files for better performance
- 🎚️ **Loop Modes** - Single song, queue, or off loop options
- 📱 **Slash Commands** - Modern Discord slash command support
- 🔀 **Shuffle Support** - Randomize playlist order
- 🗂️ **Auto-Scan** - Automatically detects new music files in preset folder
- 📱**Improve UI** - New UI control

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Corey-Stowe/stowebot.git
cd stowebot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_client_id
ADMIN_ID=your_discord_user_id
```

4. Create required directories:
```bash
mkdir -p data/preset-music
mkdir -p downloads
```

5. Start the bot:
```bash
npm start
```

## Usage

### Basic Music Commands

- `/play <song>` - Play a song from YouTube or add to queue
- `/skip` - Skip the current song
- `/stop` - Stop playback and clear queue
- `/queue` - Show current music queue
- `/pause` - Pause current song
- `/resume` - Resume playbook
- `/loop <mode>` - Set loop mode (off/single/queue)

### 24/7 Mode Commands

- `/mode24h enable <channel>` - Enable 24/7 mode in a voice channel
- `/mode24h disable` - Disable 24/7 mode
- `/mode24h status` - Check 24/7 mode status

### Admin Commands (Requires ADMIN_ID)

- `/admin24h update` - Scan and update preset music playlist
- `/admin24h list` - Show current 24/7 playlist
- `/admin24h stats` - Show detailed system statistics
- `/admin24h shuffle` - Enable shuffle and shuffle current playlist
- `/admin24h clear` - Clear the entire preset playlist
- `/admin24h cache <action>` - Manage cache and downloads
- `/admin24h directory` - Show music directory contents
- `/cleancache <type>` - Clean expired cache and downloads

### Example Usage

```
/play never gonna give you up
/queue
/skip
/mode24h enable #music-channel
/admin24h stats
/cleancache expired
```

## Key Notes

### Discord.js v14 Upgrade
- ✅ **Migrated to v14** - Uses latest Discord.js features and security updates
- ✅ **Slash Commands** - Full support for Discord's modern command system
- ✅ **Voice Connections** - Updated to use @discordjs/voice package
- ✅ **Intents System** - Properly configured for Discord.js v14 requirements

### No Lavalink Dependency
- ✅ **Direct Streaming** - Uses @distube/ytdl-core for YouTube audio extraction
- ✅ **Reduced Complexity** - No need to manage separate Lavalink nodes
- ✅ **Local Caching** - Downloads audio files for offline playback
- ✅ **Easier Deployment** - Single process deployment

### Lightweight Architecture
- ✅ **Minimal Dependencies** - Only essential packages included
- ✅ **File-based Database** - Uses JSON files instead of external databases
- ✅ **Efficient Memory Usage** - Optimized for performance
- ✅ **Fast Startup** - Quick bot initialization
- ✅ **Auto-cleanup** - Automatic cache and download management

## Base Code Structure

```javascript
// Basic bot setup with Discord.js v14
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Music player with 24/7 support
const musicPlayer = require('./utils/musicPlayer');
const preset24h = require('./utils/preset24h');

// Voice connection and playback
async function playMusic(interaction, query) {
    const channel = interaction.member.voice.channel;
    if (!channel) {
        return interaction.reply('You need to be in a voice channel!');
    }
    
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
    });
    
    const player = createAudioPlayer();
    musicPlayer.setPlayer(interaction.guild.id, player, connection);
    connection.subscribe(player);
}
```

## Configuration

### Required Permissions
- Connect to voice channels
- Speak in voice channels
- Use slash commands
- Send messages
- Manage Server (for 24/7 mode)

### Environment Variables
```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id  
ADMIN_ID=your_discord_user_id
GUILD_ID=your_test_guild_id (optional, for development)
```

### 24/7 Mode Setup
1. Create the preset music directory: `data/preset-music/`
2. Add your music files (.mp3, .flac, .wav, .ogg, .m4a) to this folder
3. Use `/admin24h update` to scan and add files to playlist
4. Enable 24/7 mode with `/mode24h enable #channel`

## Development

### Project Structure
```
stowebot/
├── commands/           # Slash command files
│   ├── play.js
│   ├── queue.js
│   ├── mode24h.js
│   ├── admin24h.js
│   └── cleancache.js
├── utils/             # Core utility modules
│   ├── musicPlayer.js
│   ├── preset24h.js
│   ├── database.js
│   └── audioDownloader.js
├── src/
│   ├── commands/      # Additional commands
│   └── utils/         # Additional utilities
├── data/              # Data storage
│   ├── preset-music/  # 24/7 music files
│   ├── cache.json     # YouTube cache
│   ├── queues.json    # Guild queues
│   └── guild_settings.json
├── downloads/         # Temporary audio downloads
├── .env
└── package.json
```

### Dependencies
```json
{
  "discord.js": "^14.x.x",
  "@discordjs/voice": "^0.16.x",
  "@distube/ytdl-core": "^4.x.x"
}
```

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Troubleshooting

### Common Issues
- **Bot not joining voice channel**: Check voice permissions
- **No audio playing**: Verify ytdl-core is working and URLs are valid
- **24/7 mode not working**: Ensure preset music files exist in `/data/preset-music/`
- **Commands not working**: Check if slash commands are registered

### Performance Tips
- Use `/cleancache expired` regularly to clean old cache
- Monitor download folder size with `/admin24h stats`
- Use high-quality audio files for 24/7 mode

## License

MIT License - see LICENSE file for details

## Support

For support and questions, please open an issue on GitHub or join our Discord server.

---
**Note**: This bot requires Node.js 16.9.0 or higher and FFmpeg installed on your system for audio processing.
