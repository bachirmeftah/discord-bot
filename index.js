/*
* index.js (محدث بالكامل)
* - يضيف حلقة اللعبة الليلية
* - يضيف قناة الذئاب الخاصة
* - يضيف لوحة التصويت الحية
*/

const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, 
    PermissionsBitField, ChannelType, ComponentType 
} = require("discord.js");
const LoupGarouGame = require("./game");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages // *** مهم جداً للرسائل الخاصة ***
    ]
});

const games = new Map();
const allRoles = [
    { label: "المستذئب", value: "wolf", emoji: "🐺" },
    { label: "المستذئب الأبيض", value: "white_wolf", emoji: "👻" },
    { label: "قروي", value: "villager", emoji: "🧑‍🌾" },
    { label: "الساحرة", value: "witch", emoji: "🧙" },
    { label: "الصياد", value: "hunter", emoji: "🎯" },
    { label: "العرافة", value: "seer", emoji: "👁️" }
];

// (توابع createSetupMessage و createJoiningMessage كما هي من قبل مع زر الإلغاء)
// ... (نسخها من الكود السابق)
function createSetupMessage(game) {
    const embed = new EmbedBuilder().setColor(0x0099FF).setTitle("🐺 إعداد لعبة المستذئبين 🐺").setDescription(game.getSetupDescription()).setFooter({ text: `الأدوار: ${game.getTotalRoles()}/${game.maxPlayers}` });
    const addRoleMenu = new StringSelectMenuBuilder().setCustomId('add_role').setPlaceholder('إضافة دور...').addOptions(allRoles.map(role => ({ label: role.label, value: role.value, emoji: role.emoji })));
    const removeRoleMenu = new StringSelectMenuBuilder().setCustomId('remove_role').setPlaceholder('إزالة دور...').addOptions(game.roleSetup.size > 0 ? Array.from(game.roleSetup.keys()).map(roleValue => { const role = allRoles.find(r => r.value === roleValue); return { label: role.label, value: role.value, emoji: role.emoji, description: `العدد: ${game.roleSetup.get(roleValue)}` }; }) : [{ label: "لا توجد أدوار", value: "none", default: true }]).setDisabled(game.roleSetup.size === 0);
    const confirmSetupButton = new ButtonBuilder().setCustomId('confirm_setup').setLabel('تأكيد الإعدادات وبدء الانضمام').setStyle(ButtonStyle.Success).setDisabled(game.getTotalRoles() === 0); 
    const cancelGameButton = new ButtonBuilder().setCustomId('cancel_game').setLabel('إلغاء اللعبة ⛔').setStyle(ButtonStyle.Danger);
    const row1 = new ActionRowBuilder().addComponents(addRoleMenu);
    const row2 = new ActionRowBuilder().addComponents(removeRoleMenu);
    const row3 = new ActionRowBuilder().addComponents(confirmSetupButton, cancelGameButton);
    return { embeds: [embed], components: [row1, row2, row3] };
}
function createJoiningMessage(game) {
    const embed = new EmbedBuilder().setColor(0x57F287).setTitle("🐺 مرحلة الانضمام 🐺").setDescription("تم تأكيد الأدوار! اضغط على الزر أدناه للانضمام إلى اللعبة.").addFields({ name: 'ملخص الأدوار', value: game.getRoleSummary(), inline: true }, { name: 'اللاعبون المنضمون', value: game.players.length > 0 ? game.players.map(p => p.username).join('\n') : "لا أحد بعد", inline: true }).setFooter({ text: `اللاعبون: ${game.players.length}/${game.getTotalRoles()}` });
    const joinButton = new ButtonBuilder().setCustomId('join_game').setLabel('انضمام 🟢').setStyle(ButtonStyle.Primary);
    const cancelGameButton = new ButtonBuilder().setCustomId('cancel_game').setLabel('إلغاء اللعبة ⛔').setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(joinButton, cancelGameButton);
    return { embeds: [embed], components: [row] };
}
// ...


client.on("ready", () => console.log(`Logged in as ${client.user.tag}`));

client.on("messageCreate", async msg => {
    if (msg.author.bot) return;
    if (msg.content === "\\start") {
        if (games.has(msg.guild.id)) return msg.reply("❌ توجد لعبة قيد الإعداد بالفعل!");
        const game = new LoupGarouGame(msg.author.id);
        games.set(msg.guild.id, game);
        const setupMessage = createSetupMessage(game);
        await msg.channel.send(setupMessage);
    }
});

client.on("interactionCreate", async interaction => {
    const game = games.get(interaction.guild.id);
    if (!game) return;

    // --- أزرار عامة ---
    if (interaction.customId === 'join_game') {
        if (game.state !== 'joining') return interaction.reply({ content: "❌ مرحلة الانضمام لم تبدأ.", ephemeral: true });
        const reply = game.addPlayer(interaction.user);
        await interaction.reply({ content: reply, ephemeral: true });
        if (!reply.startsWith("❌")) {
            if (game.players.length === game.getTotalRoles()) {
                await interaction.message.edit({ content: "⌛ اكتمل العدد! جاري توزيع الأدوار...", embeds: [], components: [] });
                await startGameLogic(interaction, game); // تمرير interaction
            } else {
                await interaction.message.edit(createJoiningMessage(game));
            }
        }
        return;
    }

    if (interaction.customId === 'cancel_game') {
        if (interaction.user.id !== game.adminId) return interaction.reply({ content: "❌ أنت لست منظم اللعبة!", ephemeral: true });
        games.delete(interaction.guild.id);
        await interaction.update({ content: '⛔ تم إلغاء اللعبة.', embeds: [], components: [] });
        return;
    }

    // --- زر بدء الليل (للمنظم) ---
    if (interaction.customId.startsWith('start_night_')) {
        if (interaction.user.id !== game.adminId) return interaction.reply({ content: "❌ أنت لست منظم اللعبة!", ephemeral: true });
        
        // تعطيل الزر
        await interaction.update({ components: [] }); 
        
        // بدء سلسلة الليل
        await runNightSequence(client, game, interaction.channel);
        return;
    }


    // --- تفاعلات المنظم (الإعداد) ---
    if (interaction.user.id !== game.adminId) {
        return interaction.reply({ content: "❌ أنت لست منظم اللعبة!", ephemeral: true });
    }
    
    if (interaction.isStringSelectMenu()) {
        const selectedValue = interaction.values[0];
        if (selectedValue === 'none') return interaction.deferUpdate(); 
        if (interaction.customId === 'add_role') game.addRole(selectedValue);
        if (interaction.customId === 'remove_role') game.removeRole(selectedValue);
        await interaction.update(createSetupMessage(game));
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'confirm_setup') {
            if (game.getTotalRoles() === 0) return interaction.reply({ content: "❌ يجب اختيار دور واحد!", ephemeral: true });
            game.state = 'joining';
            await interaction.update(createJoiningMessage(game));
        }
    }
});

// --- بداية منطق اللعبة ---

async function startGameLogic(interaction, game) {
    const channel = interaction.channel;
    const assignedPlayers = game.assignRoles();
    if (typeof assignedPlayers === "string") {
        await channel.send(assignedPlayers);
        games.delete(interaction.guild.id);
        return;
    }

    // *** 1. إنشاء قناة الذئاب ***
    const wolves = assignedPlayers.filter(p => p.role === 'wolf' || p.role === 'white_wolf');
    if (wolves.length > 0) {
        try {
            const wolfChannel = await interaction.guild.channels.create({
                name: `🐺-الذئاب-${Math.floor(Math.random() * 100)}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, // إخفاء عن @everyone
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }, // السماح للبوت
                    ...wolves.map(wolf => ({ id: wolf.id, allow: [PermissionsBitField.Flags.ViewChannel] })) // السماح للذئاب
                ],
            });
            game.setWolfChannel(wolfChannel.id);
            await wolfChannel.send(`مرحباً أيها الذئاب. هذه قناتكم السرية. ${wolves.map(w => `<@${w.id}>`).join(' ')}`);
        } catch (err) {
            console.error(err);
            await channel.send("⚠️ فشل في إنشاء قناة الذئاب! تأكد من صلاحياتي.");
        }
    }

    // *** 2. إرسال الأدوار في الخاص ***
    await channel.send("🎭 تم توزيع الأدوار... يرجى التحقق من رسائلك الخاصة!");
    for (let p of assignedPlayers) {
        try {
            let user = await client.users.fetch(p.id);
            await user.send(`مرحباً ${p.username}! دورك في اللعبة هو: **${p.role}**`);
        } catch (err) {
            channel.send(`⚠️ لم أتمكن من إرسال رسالة خاصة لـ <@${p.id}>.`);
        }
    }
    
    // *** 3. إعلان النهار الأول وزر بدء الليل ***
    game.state = 'day';
    game.nightNum = 0;
    
    const startNightButton = new ButtonBuilder()
        .setCustomId(`start_night_${game.nightNum + 1}`) // e.g., start_night_1
        .setLabel('الانتقال إلى الليل 🌙')
        .setStyle(ButtonStyle.Secondary);

    await channel.send({
        content: `🌞 **النهار الأول قد بدأ!** (للمنظم: اضغط الزر لبدء الليل الأول)\nاللاعبون: ${game.getLivingPlayers().map(p => p.username).join(', ')}`,
        components: [new ActionRowBuilder().addComponents(startNightButton)]
    });
}

// --- سلسلة الليل ---

async function runNightSequence(client, game, channel) {
    game.state = 'night';
    game.nightNum++;
    game.resetNightActions();
    
    await channel.send(`🌙 **الليل ${game.nightNum} قد بدأ...** الجميع يغلق عينيه.`);

    // الترتيب: حامي، عرافة، ذئاب، ساحرة
    
    if (game.roleSetup.has('guard')) {
        await runGuardTurn(client, game);
    }
    
    if (game.roleSetup.has('seer')) {
        await runSeerTurn(client, game);
    }
    
    if (game.roleSetup.has('wolf') || game.roleSetup.has('white_wolf')) {
        await runWolvesTurn(client, game);
    }
    
    if (game.roleSetup.has('witch')) {
        await runWitchTurn(client, game);
    }

    // *** بعد انتهاء كل الأدوار ***
    await resolveNight(client, game, channel);
}

// --- أدوار الليل ---

async function runGuardTurn(client, game) {
    const guard = game.getLivingPlayersByRole('guard')[0];
    if (!guard) return;

    const targets = game.getLivingPlayers().map(p => new ButtonBuilder()
        .setCustomId(`guard_${p.id}`)
        .setLabel(p.username));
    
    const row = new ActionRowBuilder().addComponents(targets);
    const msg = await client.users.send(guard.id, { content: "اختر من تريد حمايته (30 ثانية).", components: [row] });

    try {
        const collector = msg.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
        
        await new Promise(resolve => {
            collector.on('collect', async i => {
                game.nightActions.guardTarget = i.customId.split('_')[1];
                await i.update({ content: `✅ تم اختيار حماية ${i.component.label}.`, components: [] });
                collector.stop();
                resolve();
            });
            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await msg.edit({ content: "⏳ انتهى الوقت ولم تختر أحداً.", components: [] });
                }
                resolve();
            });
        });
    } catch (err) { console.error("Guard DM failed"); }
}

async function runSeerTurn(client, game) {
    const seer = game.getLivingPlayersByRole('seer')[0];
    if (!seer) return;

    const targets = game.getLivingPlayers().filter(p => p.id !== seer.id).map(p => new ButtonBuilder()
        .setCustomId(`seer_${p.id}`)
        .setLabel(p.username));
    
    const row = new ActionRowBuilder().addComponents(targets);
    const msg = await client.users.send(seer.id, { content: "اختر من تريد كشف دوره (30 ثانية).", components: [row] });

    try {
        const collector = msg.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
        
        await new Promise(resolve => {
            collector.on('collect', async i => {
                const targetId = i.customId.split('_')[1];
                const targetPlayer = game.getPlayerById(targetId);
                await i.update({ content: `👁️ دور ${targetPlayer.username} هو: **${targetPlayer.role}**`, components: [] });
                collector.stop();
                resolve();
            });
            collector.on('end', async (collected) => {
                if (collected.size === 0) await msg.edit({ content: "⏳ انتهى الوقت.", components: [] });
                resolve();
            });
        });
    } catch (err) { console.error("Seer DM failed"); }
}

async function runWolvesTurn(client, game) {
    const wolves = game.getLivingPlayersByRole('wolf'); // .concat(game.getLivingPlayersByRole('white_wolf'))
    if (wolves.length === 0 || !game.wolfChannelId) return;
    
    const wolfChannel = await client.channels.fetch(game.wolfChannelId);
    const targets = game.getLivingPlayers().filter(p => p.role !== 'wolf' && p.role !== 'white_wolf');
    if (targets.length === 0) return wolfChannel.send("لا يوجد قرويون لقتلهم.");

    const targetButtons = targets.map(p => new ButtonBuilder()
        .setCustomId(`wolf_${p.id}`)
        .setLabel(p.username));
    const row = new ActionRowBuilder().addComponents(targetButtons);

    // دالة لإنشاء لوحة التصويت
    const generatePoll = () => {
        const votes = new Map(); // key: targetId, value: count
        // حساب الأصوات الحالية
        for (const targetId of game.nightActions.wolfVotes.values()) {
            votes.set(targetId, (votes.get(targetId) || 0) + 1);
        }
        
        let desc = "🐺 أيها الذئاب، اختاروا ضحيتكم (30 ثانية).\n**التصويت الحالي:**\n";
        if (votes.size === 0) desc += "لا توجد أصوات بعد.";
        else {
            desc += targets.map(t => {
                const targetVotes = votes.get(t.id) || 0;
                return `${t.username}: ${targetVotes} 🐺`;
            }).join('\n');
        }
        return desc;
    };

    const embed = new EmbedBuilder().setColor(0xFF0000).setDescription(generatePoll());
    const msg = await wolfChannel.send({ embeds: [embed], components: [row] });

    try {
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
        
        collector.on('collect', async i => {
            if (!wolves.find(w => w.id === i.user.id)) {
                return i.reply({ content: "أنت لست ذئباً!", ephemeral: true });
            }
            
            const targetId = i.customId.split('_')[1];
            // تسجيل أو تغيير التصويت
            game.nightActions.wolfVotes.set(i.user.id, targetId);
            
            // تحديث لوحة التصويت الحية
            embed.setDescription(generatePoll());
            await i.update({ embeds: [embed] });
        });

        await new Promise(resolve => {
            collector.on('end', () => {
                msg.edit({ components: [] }); // تعطيل الأزرار
                
                // *** حساب النتيجة النهائية ***
                const votes = new Map();
                for (const targetId of game.nightActions.wolfVotes.values()) {
                    votes.set(targetId, (votes.get(targetId) || 0) + 1);
                }

                if (votes.size === 0) {
                    wolfChannel.send("⏳ انتهى الوقت. لم يتم اختيار أحد.");
                    game.nightActions.wolfTarget = null;
                    resolve();
                    return;
                }

                // إيجاد أعلى تصويت
                let maxVotes = 0;
                let finalTargetId = null;
                let tie = false;

                for (const [targetId, count] of votes.entries()) {
                    if (count > maxVotes) {
                        maxVotes = count;
                        finalTargetId = targetId;
                        tie = false;
                    } else if (count === maxVotes) {
                        tie = true;
                    }
                }

                if (tie) {
                    wolfChannel.send(`⌛ تعادلت الأصوات! لا يوجد ضحية الليلة.`);
                    game.nightActions.wolfTarget = null;
                } else {
                    const victim = game.getPlayerById(finalTargetId);
                    wolfChannel.send(`🔒 تم الاتفاق على قتل: **${victim.username}**`);
                    game.nightActions.wolfTarget = finalTargetId;
                }
                resolve();
            });
        });
    } catch (err) { console.error("Wolf turn failed"); }
}

async function runWitchTurn(client, game) {
    const witch = game.getLivingPlayersByRole('witch')[0];
    if (!witch || (witch.potions.heal === 0 && witch.potions.poison === 0)) return;

    let content = "دورك أيتها الساحرة (30 ثانية).\n";
    const buttons = [];
    const victimId = game.nightActions.wolfTarget; // الضحية من الذئاب

    if (victimId && witch.potions.heal > 0) {
        const victim = game.getPlayerById(victimId);
        content += `الذئاب هاجموا: **${victim.username}**. \n`;
        buttons.push(new ButtonBuilder().setCustomId('witch_heal').setLabel('استخدام جرعة الشفاء 🧪').setStyle(ButtonStyle.Success));
    } else {
        content += "الذئاب لم يقتلوا أحداً.\n";
    }

    if (witch.potions.poison > 0) {
        buttons.push(new ButtonBuilder().setCustomId('witch_poison').setLabel('استخدام جرعة السم ☠️').setStyle(ButtonStyle.Danger));
    }
    buttons.push(new ButtonBuilder().setCustomId('witch_nothing').setLabel('عدم فعل شيء').setStyle(ButtonStyle.Secondary));
    
    const row = new ActionRowBuilder().addComponents(buttons);
    const msg = await client.users.send(witch.id, { content: content, components: [row] });

    try {
        const collector = msg.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
        
        await new Promise(resolve => {
            collector.on('collect', async i => {
                await i.update({ components: [] }); // تعطيل الأزرار
                
                if (i.customId === 'witch_heal') {
                    game.nightActions.witchHealUsed = true;
                    witch.potions.heal = 0;
                    await i.editReply({ content: "✅ تم إنقاذ الضحية." });
                } 
                else if (i.customId === 'witch_poison') {
                    witch.potions.poison = 0;
                    // إظهار قائمة لاختيار ضحية السم
                    const targets = game.getLivingPlayers().filter(p => p.id !== witch.id).map(p => new ButtonBuilder()
                        .setCustomId(`poison_${p.id}`)
                        .setLabel(p.username));
                    const poisonMsg = await i.editReply({ content: "من تريد تسميمه؟ (30 ثانية)", components: [new ActionRowBuilder().addComponents(targets)] });
                    
                    const poisonCollector = poisonMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
                    poisonCollector.on('collect', async i2 => {
                        game.nightActions.witchPoisonTarget = i2.customId.split('_')[1];
                        await i2.update({ content: `✅ تم اختيار تسميم ${i2.component.label}.`, components: [] });
                        poisonCollector.stop();
                    });
                    poisonCollector.on('end', (collected) => {
                        if (collected.size === 0) i.editReply({ content: "⏳ انتهى الوقت ولم تختاري ضحية للسم.", components: [] });
                        resolve(); // إنهاء دور الساحرة
                    });
                    return; // لا تقم بـ resolve هنا، انتظر جامع السم
                } 
                else if (i.customId === 'witch_nothing') {
                    await i.editReply({ content: "😴 قررتِ عدم فعل شيء." });
                }
                collector.stop();
                resolve();
            });

            collector.on('end', async (collected) => {
                if (collected.size === 0) await msg.edit({ content: "⏳ انتهى الوقت.", components: [] });
                resolve();
            });
        });
    } catch (err) { console.error("Witch DM failed"); }
}


// --- نهاية الليل ---

async function resolveNight(client, game, channel) {
    const actions = game.nightActions;
    const deadPlayers = new Map(); // key: id, value: {player, cause}

    // 1. حساب ضحية الذئاب (مع مراعاة الحماية والشفاء)
    if (actions.wolfTarget) {
        if (actions.wolfTarget !== actions.guardTarget && !actions.witchHealUsed) {
            // مات
            const victim = game.getPlayerById(actions.wolfTarget);
            deadPlayers.set(victim.id, {player: victim, cause: 'wolf'});
        }
    }

    // 2. حساب ضحية الساحرة (السم)
    if (actions.witchPoisonTarget) {
        // السم يقتل حتى لو كان محمياً
        const victim = game.getPlayerById(actions.witchPoisonTarget);
        deadPlayers.set(victim.id, {player: victim, cause: 'witch'});
    }

    // 3. تطبيق القتل والإعلان
    game.state = 'day';
    let deathSummary = "🌞 **طلع النهار!**\n";

    if (deadPlayers.size === 0) {
        deathSummary += "لحسن الحظ، لم يمت أحد الليلة.";
    } else {
        for (const [id, data] of deadPlayers.entries()) {
            game.killPlayer(id);
            deathSummary += `⚰️ وجدنا **${data.player.username}** ميتاً. (دوره كان: ${data.player.role})\n`;
        }
    }
    
    await channel.send(deathSummary);

    // 4. التحقق من الفوز
    if (checkWinConditions(game, channel)) return;

    // 5. بدء النهار التالي (التصويت، أو حالياً زر الليل التالي)
    const startNightButton = new ButtonBuilder()
        .setCustomId(`start_night_${game.nightNum + 1}`)
        .setLabel(`الانتقال إلى الليل ${game.nightNum + 1} 🌙`)
        .setStyle(ButtonStyle.Secondary);

    await channel.send({
        content: `**النهار ${game.nightNum} بدأ.** ناقشوا وصوتوا. (للمنظم: اضغط لبدء الليل التالي).\n**الأحياء:** ${game.getLivingPlayers().map(p => p.username).join(', ')}`,
        components: [new ActionRowBuilder().addComponents(startNightButton)]
    });
}

function checkWinConditions(game, channel) {
    const living = game.getLivingPlayers();
    const wolves = living.filter(p => p.role === 'wolf' || p.role === 'white_wolf');
    const villagers = living.filter(p => p.role !== 'wolf' && p.role !== 'white_wolf');

    let gameOver = false;
    if (wolves.length === 0) {
        channel.send("🎉 **انتهت اللعبة!** مات جميع المستذئبين. **القرية تفوز!**");
        gameOver = true;
    } else if (wolves.length >= villagers.length) {
        channel.send("🐺 **انتهت اللعبة!** عدد المستذئبين يساوي أو يفوق القرويين. **المستذئبون يفوزون!**");
        gameOver = true;
    }

    if (gameOver) {
        games.delete(channel.guild.id); // إنهاء اللعبة
    }
    return gameOver;
}

client.login("MTQzOTU3NTI1ODc2MzEwMDM1NA.GkJMIb.jFOWBM3ElXUL7OC2AxBRACshEo61mezVnX5DIo"); // استبدل التوكن