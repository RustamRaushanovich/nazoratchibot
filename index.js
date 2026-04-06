const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const path = require('path');
const http = require('http');

// RENDER HEALTH CHECK
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('GROUP SUPERVISOR BOT IS ONLINE\n');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Health check server listening on port ${PORT}`);
});

const TOKEN = '8629827264:AAH1OBjYsuzi4OwcMp-KGUmssV9OWXdDGE0';
const ADMINS = [65002404]; 
const bot = new Telegraf(TOKEN);

const DB_PATH = './supervisor_db.json';
const USERS_DB_PATH = './users_db.json';

const HUDUD_KEYWORDS = [
    "Farg‘ona shahri", "Marg‘ilon shahri", "Beshariq tumani", "Bag‘dod tumani",
    "Uchko‘prik tumani", "Qo‘shtepa tumani", "Farg‘ona tumani", "O‘zbekiston tumani",
    "Dang‘ara tumani", "Rishton tumani", "So‘x tumani", "Toshloq tumani",
    "Oltiariq tumani", "Furqat tumani", "Buvayda tumani", "Quva tumani",
    "Qo‘qon shahri", "Quvasoy shahri", "Yozyovon tumani"
];

// Rasmiy tuman adminlari (ID orqali aniqlash uchun)
const DISTRICT_ADMINS = {
    5807811746: "Dang‘ara tumani",
    922449047: "Beshariq tumani",
    5547706955: "Buvayda tumani",
    8544693602: "So‘x tumani",
    1969769846: "Rishton tumani",
    341362677: "Yozyovon tumani",
    6229419604: "Oltiariq tumani",
    595501640: "Toshloq tumani",
    503222829: "Qo‘shtepa tumani",
    8145453879: "Bag‘dod tumani",
    1894911241: "Furqat tumani",
    6822495768: "Marg‘ilon shahri",
    271593039: "O‘zbekiston tumani",
    583173715: "Quvasoy shahri",
    345359050: "Farg‘ona shahri",
    1130890451: "Qo‘qon shahri",
    309212107: "Quva tumani",
    104416763: "Farg‘ona tumani",
    7862384262: "Uchko‘prik tumani"
};

let db = { tasks: [], topics: [] }; 
let users_db = {};

function loadDb() {
    if (fs.existsSync(DB_PATH)) { 
        try {
            const data = JSON.parse(fs.readFileSync(DB_PATH));
            db.tasks = data.tasks || [];
            db.topics = data.topics || [];
        } catch (e) { console.error("Error loading DB:", e); }
    }
    if (fs.existsSync(USERS_DB_PATH)) { 
        try {
            users_db = JSON.parse(fs.readFileSync(USERS_DB_PATH)); 
        } catch (e) { console.error("Error loading Users DB:", e); }
    }
}

function saveDb() { 
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); 
}

loadDb();

// Tuman/Shahar aniqlash uchun yordamchi funksiya
function getDistrict(uid, name = "") {
    // 1. Rasmiy Adminlar ro'yxatidan qidirish (1-ustunlik)
    if (DISTRICT_ADMINS[uid]) return DISTRICT_ADMINS[uid];

    // 2. Telegram ID orqali bazadan qidirish (2-ustunlik)
    if (users_db[uid] && users_db[uid].district) return users_db[uid].district;
    
    // 3. Fallback: Ism-sharifdan qidirish
    const found = HUDUD_KEYWORDS.find(k => name.toLowerCase().includes(k.split(' ')[0].toLowerCase()));
    return found || null;
}

// WIZARD FOR TASK CREATION
const taskWizard = new Scenes.WizardScene('TASK_WIZARD',
    (ctx) => {
        ctx.replyWithHTML("📝 <b>Янги топшириқ матнини ёзинг:</b>");
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.taskText = ctx.message.text;
        
        // Buttons in 2 columns for better UI
        const topicButtons = [];
        for (let i = 0; i < db.topics.length; i += 2) {
            const row = [Markup.button.callback(db.topics[i].name, `topic_${db.topics[i].id}`)];
            if (db.topics[i + 1]) {
                row.push(Markup.button.callback(db.topics[i + 1].name, `topic_${db.topics[i + 1].id}`));
            }
            topicButtons.push(row);
        }

        ctx.replyWithHTML("📂 <b>Топшириқ қайси бўлимга юборилсин?</b>", 
            Markup.inlineKeyboard(topicButtons.length > 0 ? topicButtons : [[Markup.button.callback("❌ Бўлимлар йўқ", "none")]]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return ctx.reply("Илтимос, бўлимни танланг.");
        ctx.wizard.state.topicId = ctx.callbackQuery.data.replace('topic_', '');
        ctx.wizard.state.topicName = db.topics.find(t => t.id == ctx.wizard.state.topicId).name;
        ctx.replyWithHTML("⏱ <b>Ижро муддатини ёзинг (соатда):</b>\nМисол учун: 24");
        return ctx.wizard.next();
    },
    async (ctx) => {
        const hours = parseInt(ctx.message.text);
        if (isNaN(hours)) return ctx.reply("Фақат сон киритинг (масалан: 24)");
        
        const now = moment().tz("Asia/Tashkent");
        const deadline = moment(now).add(hours, 'hours');
        const task = {
            id: Date.now(),
            topic_id: ctx.wizard.state.topicId,
            text: ctx.wizard.state.taskText,
            deadline: deadline.format("YYYY-MM-DD HH:mm:ss"),
            completed_regions: [],
            seen_regions: [],
            expiry_reported: false
        };
        db.tasks.push(task); saveDb();

        const taskMsg = await bot.telegram.sendMessage(ctx.wizard.state.topicId, 
            `📢 <b>ЯНГИ ТОПШИРИҚ ҚАЙД ЭТИЛДИ:</b>\n` +
            `📝 <i>${task.text}</i>\n` +
            `⏱ Муддат: <b>${hours} соат</b>\n` +
            `📅 Тугаш вақти: <b>${deadline.format("DD.MM.YYYY HH:mm")}</b>\n\n` +
            `#topshiriq_nazorati`, { 
                parse_mode: 'HTML', 
                message_thread_id: ctx.wizard.state.topicId,
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("📥 Tanishdim", `seen_${task.id}`)],
                    [Markup.button.callback("📊 Ijro holati", `status_${task.id}`)]
                ])
            });

        // Create Live Monitoring Message
        const monitoringMsg = await bot.telegram.sendMessage(ctx.wizard.state.topicId, 
            generateMonitoringText(task), { 
                parse_mode: 'HTML', 
                message_thread_id: ctx.wizard.state.topicId 
            });
        
        task.monitoring_msg_id = monitoringMsg.message_id;
        saveDb();

        ctx.replyWithHTML(`✅ Топшириқ <b>"${ctx.wizard.state.topicName}"</b> бўлимига юборилди va назоратга олинди.`);
        return ctx.scene.leave();
    }
);

// Helper to generate the 19-district monitoring table (Table Format)
function generateMonitoringText(task) {
    let text = `📊 <b>IJRO MONITORINGI (LIVE):</b>\n` +
               `📝 <i>${task.text.substring(0, 40)}...</i>\n\n` +
               `<b>№  HUDUD NOMI      | TANISHGAN | IJRO</b>\n` +
               `--------------------------------------\n`;
    
    HUDUD_KEYWORDS.forEach((h, i) => {
        let seen = (task.seen_regions && task.seen_regions.includes(h)) ? "📥" : "🛑";
        let completed = task.completed_regions.includes(h) ? "✅" : "🛑";
        
        // Tabular alignment (basic)
        text += `<b>${i + 1}.</b> ${h}: ${seen} | ${completed}\n`;
    });
    
    text += `\n🕒 Yangilanish: <b>${moment().tz("Asia/Tashkent").format("HH:mm:ss")}</b>\n` +
            `✅ - Bajarildi | 📥 - Tanishdi | 🛑 - Reaksiya yo'q`;
    return text;
}

async function updateLiveMonitoring(taskId) {
    const task = db.tasks.find(t => t.id == taskId);
    if (!task || !task.monitoring_msg_id) return;
    try {
        await bot.telegram.editMessageText(task.topic_id, task.monitoring_msg_id, null, generateMonitoringText(task), { parse_mode: 'HTML' });
    } catch (e) { console.error("Edit Monitoring Error:", e.message); }
}

const stage = new Scenes.Stage([taskWizard]);
bot.use(session()); bot.use(stage.middleware());

// LISTEN FOR TOPIC CREATION/MESSAGES TO MAP TOPICS
bot.on('message', (ctx, next) => {
    if (ctx.message.is_topic_message || ctx.message.message_thread_id) {
        const tid = ctx.message.message_thread_id;
        const forumTopicCreated = ctx.message.forum_topic_created;
        let tname = forumTopicCreated ? forumTopicCreated.name : "Бўлим (Номи номалум)";
        
        if (!db.topics.find(t => t.id == tid)) {
            db.topics.push({ id: tid, name: tname }); saveDb();
            console.log(`NEW TOPIC MAPPED: ${tname} (${tid})`);
        }
    }
    return next();
});

// START
bot.start((ctx) => {
    ctx.replyWithHTML("🤖 <b>Гуруҳ Назоратчиси Ботига хуш келибсиз!</b>\n\n" +
    "Топшириқни ботнинг личкасида ёзиб, гуруҳ бўлимларига юборишингиз мумкин.\n\n" +
    "📍 <b>Буйруқ:</b>\n/vazifa_yangi — Янги топшириқ яратиш");
});

// CALLBACK QUERY HANDLING
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const uid = ctx.from.id;
    const senderName = (ctx.from.first_name || "") + " " + (ctx.from.last_name || "");

    if (data.startsWith('seen_')) {
        const taskId = data.replace('seen_', '');
        const task = db.tasks.find(t => t.id == taskId);
        if (!task) return ctx.answerCbQuery("Topshiriq topilmadi.");

        const region = getDistrict(uid, senderName);
        if (!region) return ctx.answerCbQuery("Sizning tumaningiz aniqlanmadi. Iltimos, ismingizga tuman nomini qo'shing.");

        if (!task.seen_regions) task.seen_regions = [];
        if (!task.seen_regions.includes(region)) {
            task.seen_regions.push(region);
            saveDb();
            updateLiveMonitoring(task.id);
            
            // Send group notification
            bot.telegram.sendMessage(task.topic_id, `🔔 <b>${region}</b> mas'uli topshiriq bilan tanishdi.`, 
                { parse_mode: 'HTML', message_thread_id: task.topic_id });
                
            return ctx.answerCbQuery(`✅ ${region}: Tanishib chiqildi.`);
        } else {
            return ctx.answerCbQuery("Siz allaqachon tanishib chiqqansiz.");
        }
    }

    if (data.startsWith('status_')) {
        const taskId = data.replace('status_', '');
        const task = db.tasks.find(t => t.id == taskId);
        if (!task) return ctx.answerCbQuery("Topshiriq topilmadi.");

        const completed = task.completed_regions || [];
        const seen = (task.seen_regions || []).filter(r => !completed.includes(r));
        const missing = HUDUD_KEYWORDS.filter(r => !completed.includes(r) && !(task.seen_regions || []).includes(r));

        let statusMsg = `📊 <b>IJRO HOLATI TAHLILI:</b>\n\n` +
            `✅ <b>BAJARGANLAR (${completed.length} ta):</b>\n` +
            (completed.length > 0 ? `👉 <code>${completed.join(', ')}</code>\n\n` : `👉 <i>Hali hech kim bajarmadi</i>\n\n`) +
            
            `📥 <b>TANISHGAN, LEKIN BAJARMAYOTGANLAR (${seen.length} ta):</b>\n` +
            (seen.length > 0 ? `👉 <code>${seen.join(', ')}</code>\n\n` : `👉 <i>Bundaylar yo'q</i>\n\n`) +
            
            `🛑 <b>UMUMAN JAVOB BERMAGANLAR (${missing.length} ta):</b>\n` +
            (missing.length > 0 ? `👉 <code>${missing.join(', ')}</code>` : `👉 <i>Hamma xabardor</i>`);

        return ctx.replyWithHTML(statusMsg, { reply_to_message_id: ctx.callbackQuery.message.message_id });
    }
});

bot.command('vazifa_yangi', (ctx) => ctx.scene.enter('TASK_WIZARD'));

// TASK MONITORING
bot.on(['message', 'photo', 'document'], (ctx) => {
    const topicId = ctx.message.message_thread_id;
    if (!topicId || ctx.from.is_bot) return;

    const now = moment().tz("Asia/Tashkent");
    const activeTasks = db.tasks.filter(t => t.topic_id == topicId && moment(t.deadline).isAfter(now));
    if (activeTasks.length === 0) return;

    const senderName = (ctx.from.first_name || "") + " " + (ctx.from.last_name || "");
    const foundRegion = getDistrict(ctx.from.id, senderName);

    if (foundRegion) {
        activeTasks.forEach(task => {
            if (!task.completed_regions.includes(foundRegion)) {
                task.completed_regions.push(foundRegion);
                saveDb();
                updateLiveMonitoring(task.id);
                
                // Group notification
                ctx.reply(`✅ <b>${foundRegion}</b> topshiriq ijrosini yubordi. Munnosabat qabul qilindi.`, 
                    { reply_to_message_id: ctx.message.message_id, parse_mode: 'HTML' });
            }
        });
    }
});

// TAHLIL
bot.command('tahlil', (ctx) => {
    const topicId = ctx.message.message_thread_id;
    const tasks = db.tasks.filter(t => t.topic_id == topicId);
    if (tasks.length === 0) return ctx.reply("❌ Бу бўлимда топшириқлар йўқ.");

    let msg = `📊 <b>БЎЛИМДАГИ ТОПШИРИҚЛАР ТАҲЛИЛИ:</b>\n\n`;
    tasks.slice(-5).forEach((task, idx) => {
        const missing = HUDUD_KEYWORDS.filter(r => !task.completed_regions.includes(r));
        msg += `<b>${idx+1}. ${task.text.substring(0, 50)}...</b>\n` +
               `✅ Бажарди: <b>${task.completed_regions.length} та</b>\n` +
               `🛑 Бажармади: <b>${missing.length} та</b>\n` +
               (missing.length > 0 && missing.length < 10 ? `👉 ${missing.join(', ')}\n` : '') +
               `------------------------\n`;
    });
    ctx.replyWithHTML(msg);
});

// Check for expired tasks every 30 minutes
cron.schedule('*/30 * * * *', () => {
    const now = moment().tz("Asia/Tashkent");
    db.tasks.forEach(task => {
        const deadline = moment(task.deadline);
        if (now.isAfter(deadline) && now.diff(deadline, 'minutes') <= 30 && !task.expiry_reported) {
            const completed = task.completed_regions || [];
            const seen = (task.seen_regions || []).filter(r => !completed.includes(r));
            const missing = HUDUD_KEYWORDS.filter(r => !completed.includes(r) && !(task.seen_regions || []).includes(r));

            if (completed.length < HUDUD_KEYWORDS.length) {
                bot.telegram.sendMessage(task.topic_id, 
                    `🏁 <b>ТОПШИРИҚ МУДДАТИ ТУГАДИ! (YAKUNIY SVOD)</b>\n\n` +
                    `📝 Топшириқ: <i>${task.text.substring(0, 50)}...</i>\n\n` +
                    `🛑 <b>БАЖАРМАГАНЛАР (${missing.length + seen.length} ta):</b>\n` +
                    (seen.length > 0 ? `📥 Tanishgan, lekin topshirmagan: <code>${seen.join(', ')}</code>\n` : '') +
                    (missing.length > 0 ? `🛑 Umuman javob bermagan: <code>${missing.join(', ')}</code>\n` : '') +
                    `\n#yakuniy_tahlil`, { parse_mode: 'HTML' });
            }
            task.expiry_reported = true;
            saveDb();
        }
    });
}, { timezone: "Asia/Tashkent" });

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log("ADVANCED TOPIC SUPERVISOR ONLINE"))
    .catch(err => console.error("Bot launch error:", err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    server.close();
});
