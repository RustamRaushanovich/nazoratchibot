const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const http = require('http');

// SERVER FOR RENDER
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => res.end('SUPERVISOR BOT ONLINE\n'));
server.listen(PORT, '0.0.0.0');

const TOKEN = '8629827264:AAH1OBjYsuzi4OwcMp-KGUmssV9OWXdDGE0';
const ADMINS = [65002404, 786314811, 5310405293, 121730039, 5310405293]; 
const ADMIN_PHONES = ['998916523484', '998942729194', '998903034201'];
const GROUP_ID = '-1002262665652';

const bot = new Telegraf(TOKEN);

// Admin check
const isAdmin = (uid) => ADMINS.includes(Number(uid));

const DB_PATH = './supervisor_db.json';
const USERS_DB_PATH = './users_db.json';

const HUDUD_KEYWORDS = [
    "Farg‘ona shahri", "Marg‘ilon shahri", "Beshariq tumani", "Bag‘dod tumani",
    "Uchko‘prik tumani", "Qo‘shtepa tumani", "Farg‘ona tumani", "O‘zbekiston tumani",
    "Dang‘ara tumani", "Rishton tumani", "So‘x tumani", "Toshloq tumani",
    "Oltiariq tumani", "Furqat tumani", "Buvayda tumani", "Quva tumani",
    "Qo‘qon shahri", "Quvasoy shahri", "Yozyovon tumani"
];

// Bo'limlar ro'yxati (Pre-filled)
const INITIAL_TOPICS = [
    { id: 20758, name: "Tezkor topshiriqlar" }, { id: 20759, name: "Oila va xotin-qizlar" },
    { id: 20760, name: "Ijtimoiy soha" }, { id: 20761, name: "Yoshlar masalalari" },
    { id: 20762, name: "Xotin-qizlar" }, { id: 20763, name: "Ma'naviyat va ma'rifat" },
    { id: 20764, name: "Ta'lim" }, { id: 20765, name: "Sport" },
    { id: 20766, name: "Sog'liqni saqlash" }, { id: 20767, name: "Madaniyat" },
    { id: 20768, name: "Mahalla va nuroniylar" }, { id: 20769, name: "Tadbirkorlik" },
    { id: 20770, name: "Investitsiya" }, { id: 20771, name: "Qishloq xo'jaligi" },
    { id: 20772, name: "Qurilish" }, { id: 20773, name: "Obodonlashtirish" },
    { id: 20774, name: "Kommunal soha" }, { id: 20775, name: "Soliq va moliya" },
    { id: 20776, name: "Davlat xizmatlari" }, { id: 20777, name: "Adliya" },
    { id: 20778, name: "Ichki ishlar" }, { id: 20779, name: "Favqulodda vaziyatlar" },
    { id: 20780, name: "Mudofaa ishlari" }, { id: 20781, name: "Arxiv" },
    { id: 20782, name: "Statistika" }, { id: 20783, name: "Kadastr" }
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

let db = { tasks: [], topics: INITIAL_TOPICS }; 
let users_db = {};

if (fs.existsSync(DB_PATH)) { db = JSON.parse(fs.readFileSync(DB_PATH)); }
if (fs.existsSync(USERS_DB_PATH)) { users_db = JSON.parse(fs.readFileSync(USERS_DB_PATH)); }

function saveDb() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function getDistrict(uid, name = "") {
    if (DISTRICT_ADMINS[uid]) return DISTRICT_ADMINS[uid];
    if (users_db[uid] && users_db[uid].district) return users_db[uid].district;
    const found = HUDUD_KEYWORDS.find(k => name.toLowerCase().includes(k.split(' ')[0].toLowerCase()));
    return found || null;
}

// --- TASK WIZARD ---
const taskWizard = new Scenes.WizardScene('TASK_WIZARD',
    (ctx) => {
        // BIRINCHI QADAM: BO'LIMLARNI CHIQARISH
        const topicButtons = db.topics.map(t => [Markup.button.callback(t.name, `sel_topic_${t.id}`)]);
        ctx.replyWithHTML("📂 <b>Topshiriq qaysi bo'limga yuborilsin?</b>", Markup.inlineKeyboard(topicButtons));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return ctx.reply("Iltimos, bo'limni tanlang.");
        ctx.wizard.state.topicId = ctx.callbackQuery.data.replace('sel_topic_', '');
        ctx.wizard.state.topicName = db.topics.find(t => t.id == ctx.wizard.state.topicId).name;
        
        ctx.replyWithHTML(`📍 Bo'lim: <b>${ctx.wizard.state.topicName}</b>\n\n⚙️ <b>Ijro turini tanlang:</b>`, Markup.inlineKeyboard([
            [Markup.button.callback("✅ Standart", "req_std")],
            [Markup.button.callback("📊 Excel + PDF", "req_xls_pdf")],
            [Markup.button.callback("📂 Word + PDF", "req_doc_pdf")],
            [Markup.button.callback("📦 Elektron + Tasdiqlangan", "req_any_pdf")]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return ctx.reply("Ijro turini tanlang.");
        ctx.wizard.state.reqType = ctx.callbackQuery.data;

        if (ctx.wizard.state.fwd_text) {
            ctx.replyWithHTML(`📝 <b>Xabar matni (Forward):</b>\n\n<i>${ctx.wizard.state.fwd_text}</i>\n\n<b>Uni tahrirlaysizmi?</b>`, 
                Markup.inlineKeyboard([[Markup.button.callback("📝 Tahrirlash", "edit_fwd"), Markup.button.callback("✅ Ha, yuborish", "keep_fwd")]]));
        } else {
            ctx.replyWithHTML("📝 <b>Topshiriq matnini yozing:</b>");
        }
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'edit_fwd') {
            ctx.replyWithHTML("✍️ <b>Matnni tahrirlang va qaytadan yuboring:</b>");
            return;
        }
        if (ctx.message) ctx.wizard.state.taskText = ctx.message.text;
        else if (ctx.callbackQuery && ctx.callbackQuery.data === 'keep_fwd') ctx.wizard.state.taskText = ctx.wizard.state.fwd_text;
        
        ctx.wizard.state.attachmentIds = ctx.wizard.state.fwd_attachmentId ? [ctx.wizard.state.fwd_attachmentId] : [];
        ctx.replyWithHTML(`📎 <b>Ilovalarni tashlang (fayl, rasm):</b>\n\nTugatgach <b>'🏁 Tugatish'</b> tugmasini bosing:`,
            Markup.inlineKeyboard([[Markup.button.callback("🏁 Tugatish", "finish_files")]]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'finish_files') {
            ctx.replyWithHTML("⏱ <b>Ijro muddatini kiriting:</b> (Misol: 10.04.2026 18:00)");
            return ctx.wizard.next();
        }
        if (ctx.message && (ctx.message.document || ctx.message.photo || ctx.message.video)) {
            ctx.wizard.state.attachmentIds.push(ctx.message.message_id);
            ctx.replyWithHTML(`✅ Fayl qo'shildi (${ctx.wizard.state.attachmentIds.length} ta). Yana bormi?`,
                Markup.inlineKeyboard([[Markup.button.callback("🏁 Tugatish", "finish_files")]]));
        }
        return;
    },
    (ctx) => {
        const deadline = moment(ctx.message.text, "DD.MM.YYYY HH:mm", true);
        if (!deadline.isValid()) return ctx.reply("Format xato! DD.MM.YYYY HH:mm yozing:");
        ctx.wizard.state.deadline = deadline;
        
        ctx.replyWithHTML(`🏁 <b>TASDIQLASH:</b>\n` +
            `📂 Bo'lim: <b>${ctx.wizard.state.topicName}</b>\n` +
            `📝 Matn: <i>${ctx.wizard.state.taskText.substring(0, 100)}...</i>\n` +
            `⏱ Muddat: <b>${deadline.format("DD.MM.YYYY HH:mm")}</b>\n\n` +
            `Yuborilsinmi?`,
            Markup.inlineKeyboard([[Markup.button.callback("✅ Yuborish", "confirm_send"), Markup.button.callback("❌ Bekor qilish", "confirm_cancel")]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery || ctx.callbackQuery.data === 'confirm_cancel') { ctx.reply("Topshiriq bekor qilindi."); return ctx.scene.leave(); }

        const reqNames = {
            "req_std": "Bajarilgach fayl yuboring.",
            "req_xls_pdf": "Majburiy Excel va PDF/Rasm (imzoli) shaklda!",
            "req_doc_pdf": "Majburiy Word va PDF/Rasm (imzoli) shaklda!",
            "req_any_pdf": "Elektron va Imzoli fayllar majburiy!"
        };

        const caption = `🚨 <b>YANGI TOPSHIRIQ:</b>\n` +
            `📝 <i>${ctx.wizard.state.taskText}</i>\n` +
            `🏁 Muddat: <b>${ctx.wizard.state.deadline.format("DD.MM.YYYY HH:mm")}</b> gacha\n` +
            `📊 Talab: <b>${reqNames[ctx.wizard.state.reqType]}</b>\n\n` +
            `#topshiriq_nazorati`;

        let firstMsg;
        const ids = ctx.wizard.state.attachmentIds;
        
        if (ids.length > 0) {
            for (let i = 0; i < ids.length; i++) {
                const m = await bot.telegram.copyMessage(GROUP_ID, ctx.from.id, ids[i], {
                    caption: i === 0 ? caption : null, parse_mode: 'HTML', message_thread_id: ctx.wizard.state.topicId,
                });
                if (i === 0) firstMsg = m;
            }
        } else {
            firstMsg = await bot.telegram.sendMessage(GROUP_ID, caption, {
                parse_mode: 'HTML', message_thread_id: ctx.wizard.state.topicId,
            });
        }

        const task = {
            id: Date.now(), msg_id: firstMsg.message_id, topic_id: ctx.wizard.state.topicId,
            text: ctx.wizard.state.taskText, deadline: ctx.wizard.state.deadline.format("YYYY-MM-DD HH:mm:ss"),
            reqType: ctx.wizard.state.reqType, completed_regions: [], read_regions: [], pending_files: {},
            expiry_reported: false, read_reported: false
        };
        db.tasks.push(task); saveDb();
        
        await bot.telegram.editMessageReplyMarkup(GROUP_ID, firstMsg.message_id, null, {
            inline_keyboard: [
                [{ text: "👁 Tanishdim", callback_data: `read_task_${task.id}` }],
                [{ text: "🚀 Ijro yuborish", url: `https://t.me/${ctx.botInfo.username}?start=submit_${task.id}` }]
            ]
        });

        ctx.reply("🚀 Topshiriq guruhga yuborildi!");
        return ctx.scene.leave();
    }
);

// --- SUBMISSION HUB ---
const submitWizard = new Scenes.WizardScene('SUBMIT_WIZARD',
    (ctx) => {
        const payload = ctx.wizard.state.taskId;
        const task = db.tasks.find(t => t.id == payload);
        if (!task) return ctx.scene.leave();
        const district = getDistrict(ctx.from.id, "");
        if (!district) { ctx.reply("🚨 Avval ro'yxatdan o'ting: /start?register"); return ctx.scene.leave(); }
        ctx.wizard.state.task = task; ctx.wizard.state.district = district;
        ctx.replyWithHTML(`📍 <b>${district}</b>,\n"${task.text.substring(0, 30)}..." bo'yicha ijro yuboring:`);
        return ctx.wizard.next();
    },
    async (ctx) => {
        const task = ctx.wizard.state.task; const district = ctx.wizard.state.district;
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'partial_send') {
            await postToGroup(ctx, task, district, true);
            ctx.reply("⚠️ Chala ijro yuborildi."); return ctx.scene.leave();
        }
        if (task.reqType !== 'req_std') {
            if (!task.pending_files[district]) task.pending_files[district] = { electronic: false, confirmed: false, files: [] };
            const doc = ctx.message?.document; const ph = ctx.message?.photo;
            if (doc) {
                const n = doc.file_name.toLowerCase();
                const isE = n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.docx') || n.endsWith('.doc') || n.endsWith('.zip');
                const isC = n.endsWith('.pdf');
                if (isE) task.pending_files[district].electronic = true;
                if (isC) task.pending_files[district].confirmed = true;
                task.pending_files[district].files.push(ctx.message.message_id);
            }
            if (ph) { task.pending_files[district].confirmed = true; task.pending_files[district].files.push(ctx.message.message_id); }
            
            if (task.pending_files[district].electronic && task.pending_files[district].confirmed) {
                task.completed_regions.push(district); saveDb();
                await postToGroup(ctx, task, district, false);
                ctx.reply("🚀 To'liq ijro yuborildi!"); return ctx.scene.leave();
            } else {
                saveDb();
                ctx.replyWithHTML(`✅ Qabul qilindi. Hammasi tayyormi?`,
                    Markup.inlineKeyboard([[Markup.button.callback("⚠️ Chala ijroni guruhga chiqarish", "partial_send")], [Markup.button.callback("➕ Yana fayl bor", "wait")]]));
                return;
            }
        } else {
            task.completed_regions.push(district); saveDb();
            await postToGroup(ctx, task, district, false);
            ctx.reply("🚀 Yuborildi!"); return ctx.scene.leave();
        }
    }
);

async function postToGroup(ctx, task, district, isPartial) {
    const status = isPartial ? "⚠️ CHALA IJRO" : "✅ TO'LIQ IJRO";
    const caption = `🔄 <b>${district.toUpperCase()}</b> ijro yubordi:\n\n📝 <i>${task.text.substring(0, 50)}...</i>\n📊 Holati: <b>${status}</b>\n\n#ijro_nazorati`;
    const files = task.pending_files[district]?.files || [ctx.message.message_id];
    for (const mid of files) {
        await bot.telegram.copyMessage(GROUP_ID, ctx.from.id, mid, {
            message_thread_id: task.topic_id, caption: mid === files[0] ? caption : null, parse_mode: 'HTML'
        });
    }
}

// --- REGISTRATION ---
const regWizard = new Scenes.WizardScene('REG_WIZARD',
    (ctx) => { ctx.replyWithHTML("🤖 Tumanlar:", Markup.inlineKeyboard(HUDUD_KEYWORDS.map(k => [Markup.button.callback(k, `reg_h_${k}`)]))); return ctx.wizard.next(); },
    (ctx) => { if (!ctx.callbackQuery) return; ctx.wizard.state.regDistrict = ctx.callbackQuery.data.replace('reg_h_', ''); ctx.reply("F.I.Sh.ingiz?"); return ctx.wizard.next(); },
    (ctx) => { const uid = ctx.from.id; users_db[uid] = { district: ctx.wizard.state.regDistrict, fio: ctx.message.text, username: ctx.from.username }; fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users_db, null, 2)); ctx.reply("✅ Ro'yxatdan o'tdingiz."); return ctx.scene.leave(); }
);

const globalStage = new Scenes.Stage([taskWizard, submitWizard, regWizard]);
bot.use(session()); bot.use(globalStage.middleware());

bot.on('message', (ctx) => {
    if (ctx.chat.type === 'private' && isAdmin(ctx.from.id) && (ctx.message.forward_from || ctx.message.forward_origin)) {
        const text = ctx.message.text || ctx.message.caption || "";
        const aid = (ctx.message.document || ctx.message.photo || ctx.message.video) ? ctx.message.message_id : null;
        ctx.replyWithHTML(`📡 <b>Vazirlik xabari!</b>\n\nUshbu matnni tahrirlab topshiriq qilamizmi?`,
            Markup.inlineKeyboard([[Markup.button.callback("✅ Ha, topshiriq qilish", "fwd_create")]]));
        ctx.session.fwd_data = { text, aid };
        return;
    }
});

bot.action('fwd_create', (ctx) => {
    const data = ctx.session.fwd_data;
    ctx.scene.enter('TASK_WIZARD', { fwd_text: data.text, fwd_attachmentId: data.aid });
});

bot.start(async (ctx) => {
    const p = ctx.startPayload;
    if (p && p.startsWith('submit_')) return ctx.scene.enter('SUBMIT_WIZARD', { taskId: p.replace('submit_', '') });
    if (p === 'register') return ctx.scene.enter('REG_WIZARD');
    ctx.replyWithHTML("🤖 <b>Nazoratchi Bot Online!</b>\n\n/vazifa_yangi — Yangi topshiriq");
});

bot.command('vazifa_yangi', (ctx) => { if (isAdmin(ctx.from.id)) ctx.scene.enter('TASK_WIZARD'); else ctx.reply("🚨 Faqat adminlar topshiriq bera oladi."); });

bot.action(/^read_task_(\d+)$/, async (ctx) => {
    const taskId = ctx.match[1]; const task = db.tasks.find(t => t.id == taskId);
    if (!task) return;
    const district = getDistrict(ctx.from.id, "");
    if (!district) return ctx.answerCbQuery("Ro'yxatdan o'ting!", { show_alert: true });
    if (task.read_regions.includes(district)) return ctx.answerCbQuery("Tanishgansiz.");
    task.read_regions.push(district); saveDb();
    ctx.reply(`👁 <b>${district}</b> topshiriq bilan tanishdi.`, { parse_mode: 'HTML' });
});

cron.schedule('*/15 * * * *', () => {
    db.tasks.forEach(task => {
        if (!task.read_reported) {
            const missing = HUDUD_KEYWORDS.filter(r => !task.read_regions.includes(r));
            if (missing.length > 0) bot.telegram.sendMessage(GROUP_ID, `⚠️ <b>XALI TANISHMAGANLAR:</b>\n🔴 <code>${missing.join(', ')}</code>`, { parse_mode: 'HTML', message_thread_id: task.topic_id });
        }
    });
}, { timezone: "Asia/Tashkent" });

bot.launch().then(() => console.log("PRODUCTION BOT ONLINE"));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });
