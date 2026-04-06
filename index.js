const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
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
const ADMINS = [65002404, 786314811, 5310405293, 121730039]; 
const ADMIN_PHONES = ['998916523484', '998942729194', '998903034201']; 

const bot = new Telegraf(TOKEN);

// Admin ekanligini tekshirish uchun yordamchi
function isAdmin(uid) {
    return ADMINS.includes(Number(uid));
}

function isPhoneAdmin(phone) {
    const clean = phone.replace(/\D/g, '');
    return ADMIN_PHONES.some(p => p === clean);
}

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

if (fs.existsSync(DB_PATH)) { db = JSON.parse(fs.readFileSync(DB_PATH)); }
if (fs.existsSync(USERS_DB_PATH)) { users_db = JSON.parse(fs.readFileSync(USERS_DB_PATH)); }

function saveDb() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// Tuman/Shahar aniqlash uchun yordamchi funksiya
function getDistrict(uid, name = "") {
    if (DISTRICT_ADMINS[uid]) return DISTRICT_ADMINS[uid];
    if (users_db[uid] && users_db[uid].district) return users_db[uid].district;
    const found = HUDUD_KEYWORDS.find(k => name.toLowerCase().includes(k.split(' ')[0].toLowerCase()));
    return found || null;
}

// WIZARD FOR TASK CREATION
const taskWizard = new Scenes.WizardScene('TASK_WIZARD',
    (ctx) => {
        ctx.replyWithHTML("📝 <b>Yangi topshiriq matnini yozing:</b>\n\n(Yoki bekor qilish uchun /cancel)");
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.taskText = ctx.message.text;
        ctx.replyWithHTML("📎 <b>Topshiriqqa ilova (fayl, rasm) bormi?</b>\n\nAgar bo'lsa, faylni yuboring. Agar bo'lmasa, <b>/skip</b> ni bosing.");
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message && ctx.message.text !== '/skip') {
            ctx.wizard.state.attachment = ctx.message.message_id;
        }
        const topicButtons = db.topics.map(t => [Markup.button.callback(t.name, `topic_${t.id}`)]);
        ctx.replyWithHTML("📂 <b>Topshiriq qaysi bo'limga yuborilsin?</b>", 
            Markup.inlineKeyboard(topicButtons.length > 0 ? topicButtons : [[Markup.button.callback("❌ Bo'limlar yo'q", "none")]]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return ctx.reply("Iltimos, bo'limni tanlang.");
        ctx.wizard.state.topicId = ctx.callbackQuery.data.replace('topic_', '');
        ctx.wizard.state.topicName = db.topics.find(t => t.id == ctx.wizard.state.topicId).name;
        ctx.replyWithHTML("⏱ <b>Ijro muddatini yozing (soatda):</b>\nMisol uchun: 24");
        return ctx.wizard.next();
    },
    (ctx) => {
        const hours = parseInt(ctx.message.text);
        if (isNaN(hours)) return ctx.reply("Faqat son kiriting (masalan: 24)");
        
        const now = moment().tz("Asia/Tashkent");
        const deadline = moment(now).add(hours, 'hours');
        const task = {
            id: Date.now(),
            topic_id: ctx.wizard.state.topicId,
            text: ctx.wizard.state.taskText,
            deadline: deadline.format("YYYY-MM-DD HH:mm:ss"),
            created_at: now.format("YYYY-MM-DD HH:mm:ss"),
            completed_regions: [],
            read_regions: [],
            expiry_reported: false,
            read_reported: false
        };
        db.tasks.push(task); saveDb();

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback("👁 Tanishdim", `read_task_${task.id}`)]
        ]);

        const caption = `🚨 <b>YANGI TOPSHIRIQ QAYD ETILDI:</b>\n` +
            `📝 <i>${task.text}</i>\n` +
            `⏱ Ijro muddati: <b>${hours} soat</b>\n` +
            `🏁 Tugash vaqti: <b>${deadline.format("DD.MM.YYYY HH:mm")}</b>\n\n` +
            `⚠️ <i>Hurmatli mas'ullar, topshiriq bilan tanishgandan so'ng pastdagi tugmani bosing!</i>\n\n` +
            `#topshiriq_nazorati`;

        if (ctx.wizard.state.attachment) {
            bot.telegram.copyMessage(ctx.wizard.state.topicId, ctx.from.id, ctx.wizard.state.attachment, {
                caption: caption,
                parse_mode: 'HTML',
                ...keyboard
            });
        } else {
            bot.telegram.sendMessage(ctx.wizard.state.topicId, caption, { parse_mode: 'HTML', ...keyboard });
        }

        ctx.replyWithHTML(`✅ Topshiriq <b>"${ctx.wizard.state.topicName}"</b> bo'limiga yuborildi.`);
        return ctx.scene.leave();
    }
);

// --- REGISTRATION SCENE FOR NEW USERS ---
const regWizard = new Scenes.WizardScene('REG_WIZARD',
    (ctx) => {
        ctx.replyWithHTML("🤖 <b>Ro'yxatdan o'tish:</b>\nIltimos, tuman/shahringizni tanlang:", 
            Markup.inlineKeyboard(HUDUD_KEYWORDS.map(k => [Markup.button.callback(k, `reg_h_${k}`)])));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return ctx.reply("Tumanni tanlang.");
        ctx.wizard.state.regDistrict = ctx.callbackQuery.data.replace('reg_h_', '');
        ctx.replyWithHTML(`📍 <b>${ctx.wizard.state.regDistrict}</b> tanlandi.\n\nEndi F.I.Sh.ingizni yozing:`);
        return ctx.wizard.next();
    },
    (ctx) => {
        const fio = ctx.message.text;
        const uid = ctx.from.id;
        users_db[uid] = { 
            district: ctx.wizard.state.regDistrict, 
            fio: fio, 
            username: ctx.from.username 
        };
        fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users_db, null, 2));
        
        ctx.replyWithHTML(`✅ <b>Tabriklaymiz!</b>\nSiz <b>${ctx.wizard.state.regDistrict}</b> mas'uli sifatida ro'yxatdan o'tdingiz.`,
            Markup.keyboard([["📲 Telefonni tasdiqlash"]]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message.contact && !ctx.message.text?.includes('📲')) {
            return ctx.reply("Iltimos, pastdagi tugmani bosib telefon raqamingizni yuboring:",
                Markup.keyboard([[Markup.button.contactRequest("📲 Telefonni tasdiqlash")]]).resize());
        }
        
        const phone = ctx.message.contact ? ctx.message.contact.phone_number : null;
        if (phone && isPhoneAdmin(phone)) {
            const uid = ctx.from.id;
            if (!ADMINS.includes(uid)) ADMINS.push(uid);
            ctx.replyWithHTML("🌟 <b>Adminlik huquqi faollashtirildi!</b>\nEndi siz topshiriq bera olasiz.", Markup.removeKeyboard());
        } else {
            ctx.replyWithHTML("✅ Ro'yxatdan o'tish yakunlandi.", Markup.removeKeyboard());
        }
        return ctx.scene.leave();
    }
);

const globalStage = new Scenes.Stage([taskWizard, regWizard]);
bot.use(session());
bot.use(globalStage.middleware());

// LISTEN FOR TOPIC CREATION
bot.on('message', (ctx, next) => {
    if (ctx.message.forum_topic_created) {
        const tid = ctx.message.message_thread_id;
        let tname = ctx.message.forum_topic_created.name;
        if (!db.topics.find(t => t.id == tid)) {
            db.topics.push({ id: tid, name: tname }); saveDb();
        }
    }
    return next();
});

// START
bot.start(async (ctx) => {
    if (ctx.startPayload && ctx.startPayload === 'register') {
        return ctx.scene.enter('REG_WIZARD');
    }
    ctx.replyWithHTML("🤖 <b>Guruh Nazoratchisi Botiga xush kelibsiz!</b>\n\n" +
    "Topshiriqni botning lichkasida yozib, guruh bo'limlariga yuborishingiz mumkin.\n\n" +
    "📍 <b>Buyruq:</b>\n/vazifa_yangi — Yangi topshiriq yaratish");
});

bot.command('vazifa_yangi', (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.replyWithHTML("🚨 <b>Kechirasiz, sizda bunday huquq yo'q.</b>\nFaqat nazoratchi adminlar topshiriq bera oladi.");
    }
    ctx.scene.enter('TASK_WIZARD');
});

bot.command('cancel', (ctx) => ctx.scene.leave());

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
                ctx.reply(`✅ <b>${foundRegion}</b> ijrosi "${task.text.substring(0, 30)}..." topshiriqi bo'yicha qabul qilindi.`, 
                    { reply_to_message_id: ctx.message.message_id, parse_mode: 'HTML' });
            }
        });
    }
});

// --- ACTION HANDLING (READ RECEIPTS) ---
bot.action(/^read_task_(\d+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = db.tasks.find(t => t.id == taskId);
    if (!task) return ctx.answerCbQuery("Topshiriq topilmadi.");

    const senderName = (ctx.from.first_name || "") + " " + (ctx.from.last_name || "");
    const district = getDistrict(ctx.from.id, senderName);

    if (!district) {
        return ctx.answerCbQuery("Siz ro'yxatdan o'tmagansiz! Botga kirib ro'yxatdan o'ting.", { show_alert: true });
    }

    if (task.read_regions.includes(district)) {
        return ctx.answerCbQuery("Siz allaqachon tanishgansiz.");
    }

    task.read_regions.push(district);
    saveDb();

    ctx.answerCbQuery(`${district} tanishdi.`);
    ctx.reply(`👁 <b>${district}</b> mas'uli topshiriq bilan tanishdi.`, { parse_mode: 'HTML' });

    if (task.read_regions.length === HUDUD_KEYWORDS.length && !task.read_reported) {
        ctx.reply(`✅ <b>BARCHA TUMANLAR TANISHIB CHIQDI!</b>\n\nEndi ijro holati nazoratga olinadi.`, { parse_mode: 'HTML' });
        task.read_reported = true; saveDb();
    }
});

// --- CRON: REMINDERS (15 MINS) ---
cron.schedule('*/15 * * * *', () => {
    const now = moment().tz("Asia/Tashkent");
    db.tasks.forEach(task => {
        const deadline = moment(task.deadline);

        if (task.read_regions.length < HUDUD_KEYWORDS.length && !task.read_reported) {
            const missing = HUDUD_KEYWORDS.filter(r => !task.read_regions.includes(r));
            bot.telegram.sendMessage(task.topic_id, 
                `⚠️ <b>HALI TANISHMAGANLAR (${missing.length} ta):</b>\n` +
                `🔴 <code>${missing.join(', ')}</code>\n\n` +
                `<i>Iltimos, "Tanishdim" tugmasini bosing!</i>`, { parse_mode: 'HTML' });
        }

        if (now.isBefore(deadline) && task.read_reported) {
            const timeLeft = moment.duration(deadline.diff(now));
            const hoursLeft = Math.floor(timeLeft.asHours());
            const minsLeft = timeLeft.minutes();
            const missingExec = HUDUD_KEYWORDS.filter(r => !task.completed_regions.includes(r));
            if (missingExec.length > 0) {
                bot.telegram.sendMessage(task.topic_id, 
                    `⏳ <b>IJRO MUDDATI TUGASHIGA:</b> <b>${hoursLeft} soat ${minsLeft} daqiqa</b> qoldi.\n\n` +
                    `🛑 <b>HALI TOPSHIRMAGANLAR (${missingExec.length} ta):</b>\n` +
                    `👉 <code>${missingExec.join(', ')}</code>`, { parse_mode: 'HTML' });
            }
        }
        
        if (now.isAfter(deadline) && now.diff(deadline, 'minutes') <= 16 && !task.expiry_reported) {
            const missing = HUDUD_KEYWORDS.filter(r => !task.completed_regions.includes(r));
            bot.telegram.sendMessage(task.topic_id, 
                `🏁 <b>TOPSHIRIQ MUDDATI TUGADI!</b>\n` +
                `📝 Topshiriq: <i>${task.text.substring(0, 50)}...</i>\n\n` +
                `🛑 <b>BAJARMAGANLAR (${missing.length} ta):</b>\n` +
                `👉 <code>${missing.join(', ')}</code>`, { parse_mode: 'HTML' });
            task.expiry_reported = true;
            saveDb();
        }
    });
}, { timezone: "Asia/Tashkent" });

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log("ADVANCED TOPIC SUPERVISOR ONLINE"))
    .catch(err => console.error("Bot launch error:", err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    server.close();
});
