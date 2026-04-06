const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const http = require('http');

// V10.1 - STABLE VERSION WITH DATE FIX
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('GROUP SUPERVISOR BOT V10.1 IS ONLINE\n');
});
server.listen(PORT, '0.0.0.0');

const TOKEN = process.env.BOT_TOKEN || '8629827264:AAHnQ8LwpLO74NbLErGsd5ujk4xiRRRYEHw';
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

const DISTRICT_ADMINS = {
    5807811746: "Dang‘ara tumani", 922449047: "Beshariq tumani", 5547706955: "Buvayda tumani",
    8544693602: "So‘x tumani", 1969769846: "Rishton tumani", 341362677: "Yozyovon tumani",
    6229419604: "Oltiariq tumani", 595501640: "Toshloq tumani", 503222829: "Qo‘shtepa tumani",
    8145453879: "Bag‘dod tumani", 1894911241: "Furqat tumani", 6822495768: "Marg‘ilon shahri",
    271593039: "O‘zbekiston tumani", 583173715: "Quvasoy shahri", 345359050: "Farg‘ona shahri",
    1130890451: "Qo‘qon shahri", 309212107: "Quva tumani", 104416763: "Farg‘ona tumani",
    7862384262: "Uchko‘prik tumani"
};

let db = { tasks: [], topics: [] }; 
let users_db = {};

function loadDb() {
    if (fs.existsSync(DB_PATH)) { 
        try {
            db = JSON.parse(fs.readFileSync(DB_PATH));
        } catch (e) { db = { tasks: [], topics: [] }; }
    }
    if (fs.existsSync(USERS_DB_PATH)) { 
        try {
            users_db = JSON.parse(fs.readFileSync(USERS_DB_PATH)); 
        } catch (e) { users_db = {}; }
    }
}
function saveDb() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
loadDb();

function getDistrict(uid, name = "") {
    if (DISTRICT_ADMINS[uid]) return DISTRICT_ADMINS[uid];
    if (users_db[uid] && users_db[uid].district) return users_db[uid].district;
    const found = HUDUD_KEYWORDS.find(k => name.toLowerCase().includes(k.split(' ')[0].toLowerCase()));
    return found || null;
}

function generateMonitoringText(task) {
    let text = `📊 <b>IJRO MONITORINGI (LIVE):</b>\n` +
               `📝 <i>${task.text.substring(0, 40)}...</i>\n\n` +
               `<b>№  HUDUD NOMI      | TANISHGAN | IJRO</b>\n` +
               `--------------------------------------\n`;
    HUDUD_KEYWORDS.forEach((h, i) => {
        let seen = (task.seen_regions && task.seen_regions.includes(h)) ? "📥" : "🛑";
        let completed = (task.completed_regions && task.completed_regions.includes(h)) ? "✅" : "🛑";
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
    } catch (e) {}
}

const taskWizard = new Scenes.WizardScene('TASK_WIZARD',
    (ctx) => {
        ctx.replyWithHTML("📝 <b>Янги топшириқ матнини ёзинг:</b>");
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.taskText = ctx.message.text;
        const topicButtons = [];
        for (let i = 0; i < db.topics.length; i += 2) {
            const row = [Markup.button.callback(db.topics[i].name, `topic_${db.topics[i].id}`)];
            if (db.topics[i + 1]) row.push(Markup.button.callback(db.topics[i + 1].name, `topic_${db.topics[i + 1].id}`));
            topicButtons.push(row);
        }
        ctx.replyWithHTML("📂 <b>Бўлимни танланг:</b>", Markup.inlineKeyboard(topicButtons.length > 0 ? topicButtons : [[Markup.button.callback("❌ Yo'q", "none")]]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.topicId = ctx.callbackQuery.data.replace('topic_', '');
        const topic = db.topics.find(t => t.id == ctx.wizard.state.topicId);
        if (!topic) return ctx.scene.leave();
        ctx.wizard.state.topicName = topic.name;
        ctx.replyWithHTML("⏱ <b>Muddatni kiritng:</b>\n<i>Misol: 24 (soat) yoki 11.04.2026 15:00</i>");
        return ctx.wizard.next();
    },
    async (ctx) => {
        const input = ctx.message.text.trim();
        let deadline;
        const dateParsed = moment(input, "DD.MM.YYYY HH:mm", true);
        if (dateParsed.isValid()) {
            deadline = dateParsed.tz("Asia/Tashkent");
        } else {
            const hours = parseInt(input);
            if (!isNaN(hours)) {
                deadline = moment().tz("Asia/Tashkent").add(hours, 'hours');
            } else {
                return ctx.reply("Format xato. Misol: 24 yoki 11.04.2026 15:00");
            }
        }
        
        const task = {
            id: Date.now(),
            topic_id: ctx.wizard.state.topicId,
            text: ctx.wizard.state.taskText,
            deadline: deadline.format("YYYY-MM-DD HH:mm:ss"),
            completed_regions: [], seen_regions: [], expiry_reported: false
        };
        db.tasks.push(task); saveDb();

        try {
            await bot.telegram.sendMessage(task.topic_id, 
                `📢 <b>ЯНГИ ТОПШИРИҚ ҚАЙД ЭТИЛДИ:</b>\n` +
                `📝 <i>${task.text}</i>\n` +
                `📅 Тугаш вақти: <b>${deadline.format("DD.MM.YYYY HH:mm")}</b>\n\n` +
                `#topshiriq_nazorati`, { 
                    parse_mode: 'HTML', 
                    message_thread_id: task.topic_id,
                    ...Markup.inlineKeyboard([[Markup.button.callback("📥 Tanishdim", `seen_${task.id}`)]])
                });

            const mMsg = await bot.telegram.sendMessage(task.topic_id, generateMonitoringText(task), { 
                parse_mode: 'HTML', 
                message_thread_id: task.topic_id 
            });
            
            task.monitoring_msg_id = mMsg.message_id;
            saveDb();
            ctx.replyWithHTML(`✅ Топшириқ <b>"${ctx.wizard.state.topicName}"</b> бўлимига юборилди.`);
        } catch (e) {
            ctx.reply(`❌ Xato: ${e.message}\n\nBot admin ekanini ko'ring.`);
        }
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([taskWizard]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
    ctx.reply("🤖 Xush kelibsiz!", Markup.keyboard([['🚀 Yangi topshiriq', '📊 Tahlil']]).resize());
});

bot.hears('🚀 Yangi topshiriq', (ctx) => ctx.scene.enter('TASK_WIZARD'));

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('seen_')) {
        const taskId = data.replace('seen_', '');
        const task = db.tasks.find(t => t.id == taskId);
        if (!task) return;
        const region = getDistrict(ctx.from.id, (ctx.from.first_name || ""));
        if (!region) return ctx.answerCbQuery("Tuman aniqlanmadi.");
        if (!task.seen_regions.includes(region)) {
            task.seen_regions.push(region);
            saveDb();
            updateLiveMonitoring(task.id);
            bot.telegram.sendMessage(task.topic_id, `🔔 ${region} tanishdi.`, { message_thread_id: task.topic_id });
            ctx.answerCbQuery("Qabul qilindi.");
        }
    }
});

bot.on(['message', 'photo', 'document'], (ctx) => {
    const tid = ctx.message.message_thread_id;
    if (!tid || ctx.from.is_bot) return;
    const now = moment().tz("Asia/Tashkent");
    const activeTasks = db.tasks.filter(t => t.topic_id == tid && moment(t.deadline).isAfter(now));
    if (activeTasks.length === 0) return;
    const region = getDistrict(ctx.from.id, (ctx.from.first_name || ""));
    if (region) {
        activeTasks.forEach(task => {
            if (!task.completed_regions.includes(region)) {
                task.completed_regions.push(region);
                saveDb();
                updateLiveMonitoring(task.id);
                ctx.reply(`✅ ${region} bajardi.`, { reply_to_message_id: ctx.message.message_id });
            }
        });
    }
});

bot.launch({ dropPendingUpdates: true }).then(() => console.log("ONLINE"));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
