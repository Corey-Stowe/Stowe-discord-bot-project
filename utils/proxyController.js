#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class ProxyController {
    constructor() {
        this.configPath = path.join(__dirname, '../data/youtube_proxy_config.json');
        this.envPath = path.join(__dirname, '../.env');
    }

    loadConfig() {
        try {
            return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        } catch (error) {
            console.error('❌ Failed to load proxy config:', error.message);
            return null;
        }
    }

    saveConfig(config) {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            console.log('✅ Proxy configuration saved');
            return true;
        } catch (error) {
            console.error('❌ Failed to save proxy config:', error.message);
            return false;
        }
    }

    enableProxy(region = 'us') {
        const config = this.loadConfig();
        if (!config) return false;

        config.proxy.enabled = true;
        config.proxy.default_region = region;
        
        if (this.saveConfig(config)) {
            this.updateEnvFile('YOUTUBE_PROXY_ENABLED', 'true');
            this.updateEnvFile('YOUTUBE_PROXY_REGION', region);
            console.log(`🌍 Proxy enabled for region: ${region.toUpperCase()}`);
            console.log(`📍 Using server: ${config.proxy.servers[region]}`);
            return true;
        }
        return false;
    }

    disableProxy() {
        const config = this.loadConfig();
        if (!config) return false;

        config.proxy.enabled = false;
        
        if (this.saveConfig(config)) {
            this.updateEnvFile('YOUTUBE_PROXY_ENABLED', 'false');
            console.log('🚫 Proxy disabled');
            return true;
        }
        return false;
    }

    enableProxyRotation() {
        const config = this.loadConfig();
        if (!config) return false;

        config.proxy.rotation_enabled = true;
        
        if (this.saveConfig(config)) {
            this.updateEnvFile('YOUTUBE_PROXY_ROTATION', 'true');
            console.log('🔄 Proxy rotation enabled');
            return true;
        }
        return false;
    }

    listProxyServers() {
        const config = this.loadConfig();
        if (!config) return;

        console.log('🌍 Available proxy servers:');
        Object.entries(config.proxy.servers).forEach(([region, server]) => {
            const status = config.proxy.enabled && config.proxy.default_region === region ? '✅ ACTIVE' : '⚪ Available';
            console.log(`  ${region.toUpperCase()}: ${server} ${status}`);
        });
    }

    updateEnvFile(key, value) {
        try {
            let envContent = '';
            if (fs.existsSync(this.envPath)) {
                envContent = fs.readFileSync(this.envPath, 'utf8');
            }

            const lines = envContent.split('\n');
            const keyIndex = lines.findIndex(line => line.startsWith(`${key}=`));
            
            if (keyIndex !== -1) {
                lines[keyIndex] = `${key}=${value}`;
            } else {
                lines.push(`${key}=${value}`);
            }

            fs.writeFileSync(this.envPath, lines.join('\n'));
        } catch (error) {
            console.error('❌ Failed to update .env file:', error.message);
        }
    }

    status() {
        const config = this.loadConfig();
        if (!config) return;

        console.log('📊 Current Proxy Status:');
        console.log(`  Proxy Enabled: ${config.proxy.enabled ? '✅ YES' : '❌ NO'}`);
        console.log(`  Rotation Enabled: ${config.proxy.rotation_enabled ? '✅ YES' : '❌ NO'}`);
        console.log(`  Default Region: ${config.proxy.default_region.toUpperCase()}`);
        console.log(`  Current Server: ${config.proxy.servers[config.proxy.default_region]}`);
        console.log(`  Rotation Interval: ${config.proxy.rotation_interval / 60000} minutes`);
    }
}

// CLI Interface
const controller = new ProxyController();
const command = process.argv[2];
const param = process.argv[3];

switch (command) {
    case 'enable':
        controller.enableProxy(param || 'us');
        break;
    case 'disable':
        controller.disableProxy();
        break;
    case 'rotate':
        controller.enableProxyRotation();
        break;
    case 'list':
        controller.listProxyServers();
        break;
    case 'status':
        controller.status();
        break;
    default:
        console.log(`
🌍 YouTube Proxy Controller

Usage:
  node utils/proxyController.js <command> [options]

Commands:
  enable [region]  - Enable proxy for specified region (default: us)
  disable          - Disable proxy
  rotate           - Enable proxy rotation
  list             - List all available proxy servers
  status           - Show current proxy status

Available regions: au, uk, us, ca, fr, de, jp, sg, nl

Examples:
  node utils/proxyController.js enable jp
  node utils/proxyController.js rotate
  node utils/proxyController.js status
        `);
}
