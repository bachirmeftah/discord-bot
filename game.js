/*
* game.js (محدث بالكامل)
* - يدير حالة اللاعب (حي/ميت)
* - يدير جرعات الساحرة
* - يخزن قناة الذئاب
* - يخزن ويحسب إجراءات الليل
*/

class LoupGarouGame {
    constructor(adminId) {
        this.adminId = adminId;
        this.players = []; // {id, username, role, isAlive, ...}
        this.roleSetup = new Map();
        this.state = "setup"; // setup, joining, day, night, game_over
        this.maxPlayers = 24;
        
        this.wolfChannelId = null;
        this.nightNum = 0;
        this.nightActions = this.resetNightActions(); // يخزن اختيارات الليل
    }

    addPlayer(user) {
        if (this.state !== "joining") return "❌ لا يمكن الانضمام الآن!";
        if (this.players.find(p => p.id === user.id)) return "❌ أنت منضم بالفعل!";
        if (this.players.length >= this.getTotalRoles()) return "❌ اكتمل عدد اللاعبين.";

        // إضافة اللاعب بحالته الأساسية
        this.players.push({
            id: user.id, 
            username: user.username, 
            role: null, 
            isAlive: true 
        });
        
        return `🟢 ${user.username} انضم إلى اللعبة!`;
    }

    // دالة جديدة: تعيين قناة الذئاب
    setWolfChannel(channelId) {
        this.wolfChannelId = channelId;
    }

    // دالة جديدة: جلب اللاعبين الأحياء
    getLivingPlayers() {
        return this.players.filter(p => p.isAlive);
    }
    
    // دالة جديدة: جلب اللاعبين الأحياء بدور معين
    getLivingPlayersByRole(roleName) {
        return this.players.filter(p => p.isAlive && p.role === roleName);
    }

    // دالة جديدة: جلب لاعب بالـ ID
    getPlayerById(id) {
        return this.players.find(p => p.id === id);
    }
    
    // دالة جديدة: "قتل" لاعب
    killPlayer(playerId) {
        const player = this.getPlayerById(playerId);
        if (player) {
            player.isAlive = false;
        }
    }

    // دالة جديدة: إعادة تعيين إجراءات الليل
    resetNightActions() {
        this.nightActions = {
            guardTarget: null,
            seerChoice: null,
            wolfVotes: new Map(), // key: wolfId, value: targetId
            wolfTarget: null,
            witchHealUsed: false,
            witchPoisonTarget: null
        };
        return this.nightActions;
    }

    // (دوال addRole, removeRole, getTotalRoles, getRoleSummary, getSetupDescription كما هي)
    // ... (تأكد من وجودها من الكود السابق)
    addRole(roleName) {
        if (this.getTotalRoles() >= this.maxPlayers) return "❌ وصلت إلى الحد الأقصى للأدوار (24).";
        const count = this.roleSetup.get(roleName) || 0;
        this.roleSetup.set(roleName, count + 1);
    }
    removeRole(roleName) {
        const count = this.roleSetup.get(roleName) || 0;
        if (count <= 0) return;
        this.roleSetup.set(roleName, count - 1);
        if (count - 1 === 0) this.roleSetup.delete(roleName);
    }
    getTotalRoles() {
        let total = 0;
        for (const count of this.roleSetup.values()) total += count;
        return total;
    }
    getRoleSummary() {
        if (this.roleSetup.size === 0) return "لم يتم تحديد أدوار.";
        const roleNames = { 'wolf': '🐺 المستذئب', 'villager': '🧑‍🌾 قروي', 'witch': '🧙 الساحرة', 'hunter': '🎯 الصياد', 'seer': '👁️ العرافة', 'white_wolf': '👻 المستذئب الأبيض' };
        let summary = [];
        for (const [roleKey, count] of this.roleSetup.entries()) {
            if (count > 0) summary.push(`${roleNames[roleKey] || roleKey}: ${count}`);
        }
        return summary.join('\n');
    }
    getSetupDescription() {
        let desc = "اختر الأدوار التي تريد اللعب بها.\n\n";
        desc += `🐺 المستذئب: ${this.roleSetup.get('wolf') || 0}\n`;
        desc += `👻 المستذئب الأبيض: ${this.roleSetup.get('white_wolf') || 0}\n`;
        desc += `🧑‍🌾 قروي: ${this.roleSetup.get('villager') || 0}\n`;
        desc += `🧙 الساحرة: ${this.roleSetup.get('witch') || 0}\n`;
        desc += `🎯 الصياد: ${this.roleSetup.get('hunter') || 0}\n`;
        desc += `👁️ العرافة: ${this.roleSetup.get('seer') || 0}\n`;
        return desc;
    }
    // ...

    // تحديث assignRoles
    assignRoles() {
        const totalRoles = this.getTotalRoles();
        if (this.players.length !== totalRoles) return `❌ عدد اللاعبين (${this.players.length}) لا يتطابق مع عدد الأدوار (${totalRoles})!`;
        if (totalRoles === 0) return "❌ لم يتم اختيار أي أدوار!";

        this.state = "assigning_roles";
        let roleList = [];
        for (const [roleName, count] of this.roleSetup.entries()) {
            for (let i = 0; i < count; i++) {
                roleList.push(roleName);
            }
        }

        let shuffledPlayers = [...this.players].sort(() => Math.random() - 0.5);
        let shuffledRoles = roleList.sort(() => Math.random() - 0.5);

        for (let i = 0; i < shuffledPlayers.length; i++) {
            shuffledPlayers[i].role = shuffledRoles[i];
            shuffledPlayers[i].isAlive = true; // التأكد أنهم أحياء عند البدء
            
            // إضافة جرعات للساحرة
            if (shuffledRoles[i] === 'witch') {
                shuffledPlayers[i].potions = { heal: 1, poison: 1 };
            }
        }

        this.state = "day"; // سيتغير إلى day قريباً
        return shuffledPlayers; 
    }
}

module.exports = LoupGarouGame;