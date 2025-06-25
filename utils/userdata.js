const fs = require('fs').promises;
const path = require('path');

class UserDataManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data');
        this.userDataFile = path.join(this.dataPath, 'userdata.json');
        this.defaultUserData = {
            balance: 1000, // Starting balance
            lastWork: 0,
            lastCrime: 0,
            lastSlut: 0,
            lastRob: 0,
            totalEarned: 0,
            totalSpent: 0,
            gamesPlayed: 0,
            gamesWon: 0,
            createdAt: Date.now(),
            language: null // null = use bot default, 'en'/'vi'/'ja' = user preference
        };
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.dataPath, { recursive: true });
            
            try {
                await fs.access(this.userDataFile);
            } catch {
                await fs.writeFile(this.userDataFile, JSON.stringify({}));
            }
        } catch (error) {
            console.error('UserData init error:', error);
        }
    }

    async getUserData(userId) {
        try {
            const data = await fs.readFile(this.userDataFile, 'utf8');
            const userData = JSON.parse(data);
            
            if (!userData[userId]) {
                userData[userId] = this.defaultUserData;
                await this.saveUserData(userData);
            }
            
            return userData[userId];
        } catch (error) {
            console.error('Error getting user data:', error);
            return null;
        }
    }

    async updateUserData(userId, updates) {
        try {
            const data = await fs.readFile(this.userDataFile, 'utf8');
            const userData = JSON.parse(data);
            
            if (!userData[userId]) {
                await this.getUserData(userId); // Initialize if doesn't exist
                return this.updateUserData(userId, updates);
            }
            
            Object.assign(userData[userId], updates);
            await this.saveUserData(userData);
            return userData[userId];
        } catch (error) {
            console.error('Error updating user data:', error);
            return null;
        }
    }

    async saveUserData(userData) {
        try {
            await fs.writeFile(this.userDataFile, JSON.stringify(userData, null, 2));
        } catch (error) {
            console.error('Error saving user data:', error);
        }
    }

    async addBalance(userId, amount, reason = 'Unknown') {
        const userData = await this.getUserData(userId);
        if (!userData) return false;
        
        const newBalance = userData.balance + Math.abs(amount);
        await this.updateUserData(userId, { 
            balance: newBalance,
            totalEarned: userData.totalEarned + Math.abs(amount)
        });
        return true;
    }

    async subtractBalance(userId, amount, reason = 'Unknown') {
        const userData = await this.getUserData(userId);
        if (!userData) return false;
        
        if (userData.balance < Math.abs(amount)) {
            return false; // Insufficient funds
        }
        
        const newBalance = userData.balance - Math.abs(amount);
        await this.updateUserData(userId, { 
            balance: newBalance,
            totalSpent: userData.totalSpent + Math.abs(amount)
        });
        return true;
    }

    async transferBalance(fromUserId, toUserId, amount) {
        const fromUser = await this.getUserData(fromUserId);
        const toUser = await this.getUserData(toUserId);
        
        if (!fromUser || !toUser) return false;
        if (fromUser.balance < Math.abs(amount)) return false;
        
        await this.subtractBalance(fromUserId, amount, 'Transfer out');
        await this.addBalance(toUserId, amount, 'Transfer in');
        return true;
    }

    async getLeaderboard(limit = 10) {
        try {
            const data = await fs.readFile(this.userDataFile, 'utf8');
            const userData = JSON.parse(data);
            
            const users = Object.entries(userData)
                .map(([userId, data]) => ({ userId, ...data }))
                .sort((a, b) => b.balance - a.balance)
                .slice(0, limit);
                
            return users;
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            return [];
        }
    }

    formatMoney(amount) {
        return `💰${Math.floor(amount).toLocaleString()}`;
    }

    // Get user's preferred language
    async getUserLanguage(userId) {
        const userData = await this.getUserData(userId);
        return userData ? userData.language : null;
    }

    // Set user's language preference
    async setUserLanguage(userId, languageCode) {
        try {
            return await this.updateUserData(userId, { language: languageCode });
        } catch (error) {
            console.error('Error setting user language:', error);
            return false;
        }
    }
}

module.exports = new UserDataManager();
