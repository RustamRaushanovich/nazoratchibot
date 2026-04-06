const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const http = require('http');

console.log("🚀 ENGINE 4.0 STARTING...");

const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => res.end('ACTIVE\n'));
server.listen(PORT, '0.0.0.0');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) { process.exit(1); }

const bot = new Telegraf(TOKEN);
const ADMINS = [65002404, 786314811, 5310405293, 121730039];
const GROUP_ID = '-1002262665652';
const BOT_USERNAME = 'fmmtbnazoratchi_bot';

const DB_PATH = './supervisor_db.json';
const USERS_DB_PATH = './users_db.json';

const HUDUD_KEYWORDS = ["Farg‘ona shahri", "Marg‘ilon shahri", "Beshariq tumani", "Bag‘dod tumani", "Uchko‘prik tumani", "Qo‘shtepa tumani", "Farg‘ona tumani", "O‘zbekiston tumani", "Dang‘ara tumani", "Rishton tumani", "So‘x tumani", "Toshloq tumani", "Oltiariq tumani", "Furqat tumani", "Buvayda tumani", "Quva tumani", "Qo‘qon shahri", "Quvasoy shahri", "Yozyovon tumani"];

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

if (fs.existsSync(DB_PATH)) { try { const l = JSON.parse(fs.readFileSync(DB_PATH)); db.tasks = l.tasks || []; db.topics = (l.topics && l.topics.length > 0) ? l.topics : INITIAL_TOPICS; } catch(e) {} }
if (fs.existsSync(USERS_DB_PATH)) { try { users_db = JSON.parse(fs.readFileSync(USERS_DB_PATH)); } catch(e) {} }

const saveDb = () => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
const isAdmin = (uid) => ADMINS.includes(Number(uid));

const mainMenu = Markup.keyboard([['🚀 Yangi topshiriq', '📝 Tahrirlash'], ['📊 Statistika', 'ℹ️ Ma\'lumot']]).resize();

function getDistrict(uid) {
    if (DISTRICT_ADMINS[uid]) return DISTRICT_ADMINS[uid];
    if (users_db[uid] && users_db[uid].district) return users_db[uid].district;
    return null;
}

// --- TASK WIZARD ---
const taskWizard = new Scenes.WizardScene('TASK_WIZARD',
    (ctx) => {
        const btns = db.topics.map(t => [Markup.button.callback(t.name, `sel_t_${t.id}`)]);
        ctx.replyWithHTML("📂 <b>Bo'limni tanlang:</b>", Markup.inlineKeyboard(btns));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(0); return ctx.wizard.steps[0](ctx); }
        if (ctx.callbackQuery?.data === 'home') return ctx.scene.leave();
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.topicId = ctx.callbackQuery.data.replace('sel_t_', '');
        ctx.wizard.state.topicName = db.topics.find(t => t.id == ctx.wizard.state.topicId).name;
        ctx.replyWithHTML(`📍 <b>${ctx.wizard.state.topicName}</b>\n\n⚙️ <b>Ijro turini tanlang:</b>`, Markup.inlineKeyboard([
            [Markup.button.callback("✅ Standart", "req_std")], 
            [Markup.button.callback("📊 Excel + PDF", "req_xls_pdf")],
            [Markup.button.callback("📂 Word + PDF", "req_doc_pdf")], 
            [Markup.button.callback("📦 Elektron + Imzoli", "req_any_pdf")],
            [Markup.button.callback("🔙 Orqaga", "back"), Markup.button.callback("🏠 Menyu", "home")]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(1); return ctx.wizard.steps[1](ctx); }
        if (ctx.callbackQuery?.data === 'home') return ctx.scene.leave();
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.reqType = ctx.callbackQuery.data;
        ctx.replyWithHTML("📝 <b>Topshiriq matnini yozing:</b>", Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "back")]]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(2); return ctx.wizard.steps[2](ctx); }
        if (ctx.message) {
            ctx.wizard.state.taskText = ctx.message.text;
            ctx.wizard.state.attachments = [];
            ctx.replyWithHTML(`📎 <b>Hujjatlarni tashlang (yaratilmagan bo'lsa 'Tugatish'):</b>`, Markup.inlineKeyboard([[Markup.button.callback("🏁 Tugatish", "finish")], [Markup.button.callback("🔙 Orqaga", "back")]]));
            return ctx.wizard.next();
        }
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(3); return ctx.wizard.steps[3](ctx); }
        if (ctx.callbackQuery?.data === 'finish') { ctx.reply("⏱ Muddat? (15.04.2024 18:00)", Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "back")]])); return ctx.wizard.next(); }
        if (ctx.message) {
            ctx.wizard.state.attachments.push(ctx.message.message_id);
            ctx.reply(`✅ (${ctx.wizard.state.attachments.length}). Yana bo'lsa tashlang:`, Markup.inlineKeyboard([[Markup.button.callback("🏁 Tugatish", "finish")]]));
        }
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(4); return ctx.wizard.steps[4](ctx); }
        const d = moment(ctx.message.text, "DD.MM.YYYY HH:mm", true);
        if (!d.isValid()) return ctx.reply("Format: DD.MM.YYYY HH:mm");
        ctx.wizard.state.deadline = d;
        ctx.replyWithHTML(`🏁 <b>TASDIQLASH:</b>\nBo'lim: <b>${ctx.wizard.state.topicName}</b>\n\nYuboraylikmi?`, Markup.inlineKeyboard([[Markup.button.callback("✅ Ha, yuborish", "send")], [Markup.button.callback("🔙 Orqaga", "back")]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send') {
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
            await bot.telegram.editMessageReplyMarkup(GROUP_ID, fmsg.message_id, null, { inline_keyboard: [[{ text: "👁 Tanishdim", callback_data: `read_task_${t.id}` }], [{ text: "🚀 Ijro yuborish", url: `https://t.me/${BOT_USERNAME}?start=submit_${t.id}` }]] });
            ctx.reply("🚀 Guruhga yuborildi!", mainMenu);
            ctx.replyWithHTML(`📝 <b>Tahrirlash:</b>`, Markup.inlineKeyboard([[Markup.button.callback("📝 Matnni o'zgartirish", `edit_t_${t.id}`)]]));
        }
        return ctx.scene.leave();
    }
);

// --- EDIT WIZARD ---
const editWizard = new Scenes.WizardScene('EDIT_WIZARD',
    (ctx) => { ctx.reply("✍️ Yangi matnni yozing:"); return ctx.wizard.next(); },
    async (ctx) => {
        const task = db.tasks.find(x => x.id == ctx.wizard.state.taskId);
        task.text = ctx.message.text; saveDb();
        const cap = `🚨 <b>TAHRIRLANGAN TOPSHIRIQ:</b>\n<i>${task.text}</i>\n🏁 Muddat: <b>${moment(task.deadline).format("DD.MM.YYYY HH:mm")}</b>`;
        try { await bot.telegram.editMessageCaption(GROUP_ID, task.msg_id, null, cap, { parse_mode: 'HTML' }); } catch (e) { await bot.telegram.editMessageText(GROUP_ID, task.msg_id, null, cap, { parse_mode: 'HTML' }); }
        ctx.reply("✅ Tahrirlandi!", mainMenu);
        return ctx.scene.leave();
    }
);

const submitWizard = new Scenes.WizardScene('SUBMIT_WIZARD',
    (ctx) => { const task = db.tasks.find(t => t.id == ctx.wizard.state.taskId); if (!task) return ctx.scene.leave(); const dist = getDistrict(ctx.from.id); if (!dist) { ctx.reply("🚨 /start?register"); return ctx.scene.leave(); } ctx.wizard.state.task = task; ctx.wizard.state.district = dist; ctx.replyWithHTML(`📍 <b>${dist}</b> ijrosi:`); return ctx.wizard.next(); },
    async (ctx) => { if (ctx.callbackQuery?.data === 'partial_send') { await postToGroup(ctx, ctx.wizard.state.task, ctx.wizard.state.district, true); ctx.reply("⚠️ Chala yuborildi."); return ctx.scene.leave(); } const task = ctx.wizard.state.task; const dist = ctx.wizard.state.district; if (task.reqType !== 'req_std') { if (!task.pending_files[dist]) task.pending_files[dist] = { electronic: false, confirmed: false, files: [] }; if (ctx.message?.document) { const n = ctx.message.document.file_name.toLowerCase(); if (n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.docx') || n.endsWith('.doc') || n.endsWith('.zip')) task.pending_files[dist].electronic = true; if (n.endsWith('.pdf')) task.pending_files[dist].confirmed = true; task.pending_files[dist].files.push(ctx.message.message_id); } if (ctx.message?.photo) { task.pending_files[dist].confirmed = true; task.pending_files[dist].files.push(ctx.message.message_id); } if (task.pending_files[dist].electronic && task.pending_files[dist].confirmed) { task.completed_regions.push(dist); saveDb(); await postToGroup(ctx, task, dist, false); ctx.reply("🚀 To'liq yuborildi!"); return ctx.scene.leave(); } else { saveDb(); ctx.replyWithHTML(`✅ Fayl qabul qilindi. Hammasi tayyormi?`, Markup.inlineKeyboard([[Markup.button.callback("⚠️ Chala yuborish", "partial_send")], [Markup.button.callback("➕ Yana bor", "wait")]])); return; } } else { task.completed_regions.push(dist); saveDb(); await postToGroup(ctx, task, dist, false); ctx.reply("🚀 Yuborildi!"); return ctx.scene.leave(); } }
);

async function postToGroup(ctx, task, district, isPartial) {
    const s = isPartial ? "⚠️ CHALA IJRO" : "✅ TO'LIQ IJRO";
    const cap = `🔄 <b>${district.toUpperCase()}</b> ijro yubordi:\n📊: <b>${s}</b>\n\n#ijro_nazorati`;
    const f = task.pending_files[district]?.files || [ctx.message.message_id];
    for (const mid of f) await bot.telegram.copyMessage(GROUP_ID, ctx.from.id, mid, { message_thread_id: task.topic_id, caption: mid === f[0] ? cap : null, parse_mode: 'HTML' });
}

const regWizard = new Scenes.WizardScene('REG_WIZARD',
    (ctx) => { ctx.replyWithHTML("🤖 Tuman:", Markup.inlineKeyboard(HUDUD_KEYWORDS.map(k => [Markup.button.callback(k, `reg_h_${k}`)]))); return ctx.wizard.next(); },
    (ctx) => { if (!ctx.callbackQuery) return; ctx.wizard.state.regDistrict = ctx.callbackQuery.data.replace('reg_h_', ''); ctx.reply("F.I.Sh?"); return ctx.wizard.next(); },
    (ctx) => { users_db[ctx.from.id] = { district: ctx.wizard.state.regDistrict, fio: ctx.message.text, username: ctx.from.username }; fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users_db, null, 2)); ctx.reply("✅ Tayyor."); return ctx.scene.leave(); }
);

const stage = new Scenes.Stage([taskWizard, editWizard, submitWizard, regWizard]);
bot.use(session()); bot.use(stage.middleware());

bot.start(async (ctx) => { 
    const p = ctx.startPayload; if (p?.startsWith('submit_')) return ctx.scene.enter('SUBMIT_WIZARD', { taskId: p.replace('submit_', '') });
    if (p === 'register') return ctx.scene.enter('REG_WIZARD');
    ctx.reply("🤖 Xush kelibsiz!", mainMenu); 
});

bot.hears('🚀 Yangi topshiriq', (ctx) => { if (isAdmin(ctx.from.id)) ctx.scene.enter('TASK_WIZARD'); });
bot.hears('📝 Tahrirlash', (ctx) => { const last = db.tasks.slice(-5).reverse(); const btns = last.map(t => [Markup.button.callback(t.text.substring(0, 20), `edit_t_${t.id}`)]); ctx.reply("📝 Tanlang:", Markup.inlineKeyboard(btns)); });
bot.action(/^edit_t_(\d+)$/, (ctx) => { ctx.scene.enter('EDIT_WIZARD', { taskId: ctx.match[1] }); });
bot.action(/^read_task_(\d+)$/, async (ctx) => {
    const tid = ctx.match[1]; const t = db.tasks.find(x => x.id == tid); if (!t) return;
    const dist = getDistrict(ctx.from.id); if (!dist) return ctx.answerCbQuery("Ro'yxatdan o'ting!");
    if (t.read_regions.includes(dist)) return; t.read_regions.push(dist); saveDb();
    ctx.reply(`👁 <b>${dist}</b> tanishdi.`, { parse_mode: 'HTML' });
});

bot.launch().then(() => console.log("💎 FINAL STABLE 💎"));
process.once('SIGINT', () => bot.stop('SIGINT')); process.once('SIGTERM', () => bot.stop('SIGTERM'));
