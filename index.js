const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const http = require('http');

// SERVER FOR RENDER
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => res.end('BOT ONLINE\n'));
server.listen(PORT, '0.0.0.0');

// XAVFSIZ TOKEN (Render Environment Variables-dan o'qiydi)
const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
    console.error("🚨 ERROR: BOT_TOKEN topilmadi! Render-da Environment Variable qo'shing.");
}

const ADMINS = [65002404, 786314811, 5310405293, 121730039]; 
const GROUP_ID = '-1002262665652';

const bot = new Telegraf(TOKEN);
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

if (fs.existsSync(DB_PATH)) { 
    try {
        const loaded = JSON.parse(fs.readFileSync(DB_PATH));
        db.tasks = loaded.tasks || [];
        db.topics = (loaded.topics && loaded.topics.length > 0) ? loaded.topics : INITIAL_TOPICS;
    } catch (e) { db = { tasks: [], topics: INITIAL_TOPICS }; }
}
if (fs.existsSync(USERS_DB_PATH)) { users_db = JSON.parse(fs.readFileSync(USERS_DB_PATH)); }

function saveDb() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function getDistrict(uid, name = "") {
    if (DISTRICT_ADMINS[uid]) return DISTRICT_ADMINS[uid];
    if (users_db[uid] && users_db[uid].district) return users_db[uid].district;
    const found = HUDUD_KEYWORDS.find(k => name.toLowerCase().includes(k.split(' ')[0].toLowerCase()));
    return found || null;
}

const taskWizard = new Scenes.WizardScene('TASK_WIZARD',
    (ctx) => {
        const btns = db.topics.map(t => [Markup.button.callback(t.name, `sel_topic_${t.id}`)]);
        ctx.replyWithHTML("📂 <b>Bo'limni tanlang:</b>", Markup.inlineKeyboard(btns));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.topicId = ctx.callbackQuery.data.replace('sel_topic_', '');
        ctx.wizard.state.topicName = db.topics.find(t => t.id == ctx.wizard.state.topicId).name;
        ctx.replyWithHTML(`📍 <b>${ctx.wizard.state.topicName}</b>\n\n⚙️ <b>Ijro turi:</b>`, Markup.inlineKeyboard([
            [Markup.button.callback("✅ Standart", "req_std")], [Markup.button.callback("📊 Excel + PDF", "req_xls_pdf")],
            [Markup.button.callback("📂 Word + PDF", "req_doc_pdf")], [Markup.button.callback("📦 Elektron + Imzoli", "req_any_pdf")]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.reqType = ctx.callbackQuery.data;
        if (ctx.wizard.state.fwd_text) {
            ctx.replyWithHTML(`📝 <b>Mazmun (Forward):</b>\n<i>${ctx.wizard.state.fwd_text}</i>\n\n<b>Tahrirlaymizmi?</b>`, 
                Markup.inlineKeyboard([[Markup.button.callback("📝 Tahrirlash", "edit_fwd"), Markup.button.callback("✅ Ha", "keep_fwd")]]));
        } else ctx.replyWithHTML("📝 <b>Matnni yozing:</b>");
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'edit_fwd') { ctx.reply("✍️ Tahrirlang:"); return; }
        if (ctx.message) ctx.wizard.state.taskText = ctx.message.text;
        else if (ctx.callbackQuery?.data === 'keep_fwd') ctx.wizard.state.taskText = ctx.wizard.state.fwd_text;
        ctx.wizard.state.attachments = ctx.wizard.state.fwd_attachmentId ? [ctx.wizard.state.fwd_attachmentId] : [];
        ctx.replyWithHTML(`📎 <b>Hujjatlarni tashlang:</b>`, Markup.inlineKeyboard([[Markup.button.callback("🏁 Tugatish", "finish_files")]]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'finish_files') { ctx.reply("⏱ Muddat? (15.04.2026 12:00)"); return ctx.wizard.next(); }
        if (ctx.message?.document || ctx.message?.photo || ctx.message?.video) {
            ctx.wizard.state.attachments.push(ctx.message.message_id);
            ctx.reply(`✅ (${ctx.wizard.state.attachments.length}). Yana?`, Markup.inlineKeyboard([[Markup.button.callback("🏁 Tugatish", "finish_files")]]));
        }
        return;
    },
    (ctx) => {
        const d = moment(ctx.message.text, "DD.MM.YYYY HH:mm", true);
        if (!d.isValid()) return ctx.reply("Xato! (DD.MM.YYYY HH:mm)");
        ctx.wizard.state.deadline = d;
        ctx.replyWithHTML(`🏁 <b>TASDIQLASH:</b>\nBo'lim: <b>${ctx.wizard.state.topicName}</b>\n\nYuboraylikmi?`, Markup.inlineKeyboard([[Markup.button.callback("✅ Ha", "confirm_send"), Markup.button.callback("❌ Yo'q", "confirm_cancel")]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'confirm_send') {
            const rN = { "req_std": "Fayl yuboring.", "req_xls_pdf": "Excel + PDF!", "req_doc_pdf": "Word + PDF!", "req_any_pdf": "Elektron + Imzoli!" };
            const cap = `🚨 <b>YANGI TOPSHIRIQ:</b>\n<i>${ctx.wizard.state.taskText}</i>\n🏁 Muddat: <b>${ctx.wizard.state.deadline.format("DD.MM.YYYY HH:mm")}</b>\n📊: <b>${rN[ctx.wizard.state.reqType]}</b>`;
            let fmsg;
            for (let i = 0; i < ctx.wizard.state.attachments.length; i++) {
                const m = await bot.telegram.copyMessage(GROUP_ID, ctx.from.id, ctx.wizard.state.attachments[i], { caption: i === 0 ? cap : null, parse_mode: 'HTML', message_thread_id: ctx.wizard.state.topicId });
                if (i === 0) fmsg = m;
            }
            if (!fmsg) fmsg = await bot.telegram.sendMessage(GROUP_ID, cap, { parse_mode: 'HTML', message_thread_id: ctx.wizard.state.topicId });
            const t = { id: Date.now(), msg_id: fmsg.message_id, topic_id: ctx.wizard.state.topicId, text: ctx.wizard.state.taskText, deadline: ctx.wizard.state.deadline.format("YYYY-MM-DD HH:mm:ss"), reqType: ctx.wizard.state.reqType, completed_regions: [], read_regions: [], pending_files: {} };
            db.tasks.push(t); saveDb();
            await bot.telegram.editMessageReplyMarkup(GROUP_ID, fmsg.message_id, null, { inline_keyboard: [[{ text: "👁 Tanishdim", callback_data: `read_task_${t.id}` }], [{ text: "🚀 Ijro yuborish", url: `https://t.me/${ctx.botInfo.username}?start=submit_${t.id}` }]] });
            ctx.reply("🚀 Yuborildi!");
        } else ctx.reply("Bekor qilindi.");
        return ctx.scene.leave();
    }
);

const submitWizard = new Scenes.WizardScene('SUBMIT_WIZARD',
    (ctx) => { const task = db.tasks.find(t => t.id == ctx.wizard.state.taskId); if (!task) return ctx.scene.leave(); const dist = getDistrict(ctx.from.id, ""); if (!dist) { ctx.reply("🚨 Ro'yxatdan o'ting: /start?register"); return ctx.scene.leave(); } ctx.wizard.state.task = task; ctx.wizard.state.district = dist; ctx.replyWithHTML(`📍 <b>${dist}</b>,\n"${task.text.substring(0, 30)}..." ijrosini yuboring:`); return ctx.wizard.next(); },
    async (ctx) => { if (ctx.callbackQuery?.data === 'partial_send') { await postToGroup(ctx, ctx.wizard.state.task, ctx.wizard.state.district, true); ctx.reply("⚠️ Chala yuborildi."); return ctx.scene.leave(); } const t = ctx.wizard.state.task; const dist = ctx.wizard.state.district; if (t.reqType !== 'req_std') { if (!t.pending_files[dist]) t.pending_files[dist] = { electronic: false, confirmed: false, files: [] }; if (ctx.message?.document) { const n = ctx.message.document.file_name.toLowerCase(); if (n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.docx') || n.endsWith('.doc') || n.endsWith('.zip')) t.pending_files[dist].electronic = true; if (n.endsWith('.pdf')) t.pending_files[dist].confirmed = true; t.pending_files[dist].files.push(ctx.message.message_id); } if (ctx.message?.photo) { t.pending_files[dist].confirmed = true; t.pending_files[dist].files.push(ctx.message.message_id); } if (t.pending_files[dist].electronic && t.pending_files[dist].confirmed) { t.completed_regions.push(dist); saveDb(); await postToGroup(ctx, t, dist, false); ctx.reply("🚀 To'liq yuborildi!"); return ctx.scene.leave(); } else { saveDb(); ctx.replyWithHTML(`✅ Qabul qilindi. Hammasi tayyormi?`, Markup.inlineKeyboard([[Markup.button.callback("⚠️ Chala yuborish", "partial_send")], [Markup.button.callback("➕ Yana bor", "wait")]])); return; } } else { t.completed_regions.push(dist); saveDb(); await postToGroup(ctx, t, dist, false); ctx.reply("🚀 Yuborildi!"); return ctx.scene.leave(); } }
);

async function postToGroup(ctx, task, district, isPartial) {
    const s = isPartial ? "⚠️ CHALA IJRO" : "✅ TO'LIQ IJRO";
    const cap = `🔄 <b>${district.toUpperCase()}</b> ijro yubordi:\n📝 <i>${task.text.substring(0, 50)}...</i>\n📊: <b>${s}</b>\n\n#ijro_nazorati`;
    const f = task.pending_files[district]?.files || [ctx.message.message_id];
    for (const mid of f) await bot.telegram.copyMessage(GROUP_ID, ctx.from.id, mid, { message_thread_id: task.topic_id, caption: mid === f[0] ? cap : null, parse_mode: 'HTML' });
}

const regWizard = new Scenes.WizardScene('REG_WIZARD',
    (ctx) => { ctx.replyWithHTML("🤖 Tuman:", Markup.inlineKeyboard(HUDUD_KEYWORDS.map(k => [Markup.button.callback(k, `reg_h_${k}`)]))); return ctx.wizard.next(); },
    (ctx) => { if (!ctx.callbackQuery) return; ctx.wizard.state.regDistrict = ctx.callbackQuery.data.replace('reg_h_', ''); ctx.reply("F.I.Sh?"); return ctx.wizard.next(); },
    (ctx) => { users_db[ctx.from.id] = { district: ctx.wizard.state.regDistrict, fio: ctx.message.text, username: ctx.from.username }; fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users_db, null, 2)); ctx.reply("✅ Tayyor."); return ctx.scene.leave(); }
);

const stage = new Scenes.Stage([taskWizard, submitWizard, regWizard]);
bot.use(session()); bot.use(stage.middleware());

bot.on('message', (ctx) => {
    if (ctx.chat.type === 'private' && isAdmin(ctx.from.id) && (ctx.message.forward_from || ctx.message.forward_origin)) {
        const text = ctx.message.text || ctx.message.caption || "";
        const aid = (ctx.message.document || ctx.message.photo || ctx.message.video) ? ctx.message.message_id : null;
        ctx.replyWithHTML(`📡 <b>Vazirlik xabari!</b>`, Markup.inlineKeyboard([[Markup.button.callback("✅ Topshiriq qilish", "fwd_create")]]));
        ctx.session.fwd_data = { text, aid };
    }
});

bot.action('fwd_create', (ctx) => { const data = ctx.session.fwd_data; ctx.scene.enter('TASK_WIZARD', { fwd_text: data.text, fwd_attachmentId: data.aid }); });

bot.start(async (ctx) => {
    const p = ctx.startPayload;
    if (p?.startsWith('submit_')) return ctx.scene.enter('SUBMIT_WIZARD', { taskId: p.replace('submit_', '') });
    if (p === 'register') return ctx.scene.enter('REG_WIZARD');
    ctx.replyWithHTML("🤖 <b>Nazoratchi Bot Online!</b>\n\n/vazifa_yangi — Yangi topshiriq");
});

bot.command('vazifa_yangi', (ctx) => { if (isAdmin(ctx.from.id)) ctx.scene.enter('TASK_WIZARD'); });

bot.action(/^read_task_(\d+)$/, async (ctx) => {
    const tid = ctx.match[1]; const t = db.tasks.find(x => x.id == tid); if (!t) return;
    const dist = getDistrict(ctx.from.id, ""); if (!dist) return ctx.answerCbQuery("Ro'yxatdan o'ting!");
    if (t.read_regions.includes(dist)) return; t.read_regions.push(dist); saveDb();
    ctx.reply(`👁 <b>${dist}</b> tanishdi.`, { parse_mode: 'HTML' });
});

cron.schedule('*/15 * * * *', () => {
    db.tasks.forEach(t => {
        const missing = HUDUD_KEYWORDS.filter(r => !t.read_regions.includes(r));
        if (missing.length > 0) bot.telegram.sendMessage(GROUP_ID, `⚠️ <b>TANISHMAGANLAR:</b>\n🔴 <code>${missing.join(', ')}</code>`, { parse_mode: 'HTML', message_thread_id: t.topic_id });
    });
}, { timezone: "Asia/Tashkent" });

bot.launch().then(() => console.log("PRODUCTION BOT ONLINE"));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });
