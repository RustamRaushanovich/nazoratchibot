const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const http = require('http');

console.log("🚀 ADVANCED ENGINE STARTING...");

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

let db = { tasks: [], topics: INITIAL_TOPICS };
if (fs.existsSync(DB_PATH)) { try { const l = JSON.parse(fs.readFileSync(DB_PATH)); db.tasks = l.tasks || []; db.topics = (l.topics && l.topics.length > 0) ? l.topics : INITIAL_TOPICS; } catch(e) {} }

const saveDb = () => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
const isAdmin = (uid) => ADMINS.includes(Number(uid));

const mainMenu = Markup.keyboard([
    ['🚀 Yangi topshiriq', '📝 Tahrirlash'],
    ['📊 Statistika', 'ℹ️ Ma\'lumot']
]).resize();

const cancelBtn = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback("🔙 Orqaga", "back"), Markup.button.callback("🏠 Asosiy menyu", "home")]
]);

// --- TASK WIZARD ---
const taskWizard = new Scenes.WizardScene('TASK_WIZARD',
    (ctx) => {
        const btns = db.topics.map(t => [Markup.button.callback(t.name, `sel_t_${t.id}`)]);
        ctx.replyWithHTML("📂 <b>Bo'limni tanlang:</b>", Markup.inlineKeyboard(btns));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'back') { ctx.wizard.back(); return ctx.wizard.steps[ctx.wizard.cursor](ctx); }
        if (ctx.callbackQuery?.data === 'home') return ctx.scene.leave();
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.topicId = ctx.callbackQuery.data.replace('sel_t_', '');
        ctx.wizard.state.topicName = db.topics.find(t => t.id == ctx.wizard.state.topicId).name;
        ctx.replyWithHTML(`📍 <b>${ctx.wizard.state.topicName}</b>\n\n⚙️ <b>Ijro turi:</b>`, Markup.inlineKeyboard([
            [Markup.button.callback("✅ Standart", "req_std")], [Markup.button.callback("📊 Excel + PDF", "req_xls_pdf")],
            [Markup.button.callback("🔙 Orqaga", "back"), Markup.button.callback("🏠 Menyu", "home")]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'back') { ctx.wizard.back(); return ctx.wizard.steps[ctx.wizard.cursor](ctx); }
        if (ctx.callbackQuery?.data === 'home') return ctx.scene.leave();
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.reqType = ctx.callbackQuery.data;
        ctx.replyWithHTML("📝 <b>Matnni yozing:</b>", cancelBtn());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'back') { ctx.wizard.back(); return ctx.wizard.steps[ctx.wizard.cursor](ctx); }
        if (ctx.message) {
            ctx.wizard.state.taskText = ctx.message.text;
            ctx.wizard.state.attachments = [];
            ctx.replyWithHTML(`📎 <b>Ilovani tashlang:</b>`, Markup.inlineKeyboard([[Markup.button.callback("🏁 Tugatish", "finish")], [Markup.button.callback("🔙 Orqaga", "back")]]));
            return ctx.wizard.next();
        }
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'back') { ctx.wizard.back(); return ctx.wizard.steps[ctx.wizard.cursor](ctx); }
        if (ctx.callbackQuery?.data === 'finish') { ctx.reply("Muddat? (15.04.2024 18:00)", cancelBtn()); return ctx.wizard.next(); }
        if (ctx.message) ctx.wizard.state.attachments.push(ctx.message.message_id);
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'back') { ctx.wizard.back(); return ctx.wizard.steps[ctx.wizard.cursor](ctx); }
        const d = moment(ctx.message.text, "DD.MM.YYYY HH:mm", true);
        if (!d.isValid()) return ctx.reply("Sana: DD.MM.YYYY HH:mm");
        ctx.wizard.state.deadline = d;
        ctx.replyWithHTML(`🏁 <b>TASDIQLASH:</b>\nYuborilsinmi?`, Markup.inlineKeyboard([[Markup.button.callback("✅ Ha", "send"), Markup.button.callback("🔙 Orqaga", "back")]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send') {
            const reqN = { "req_std": "Fayl yuboring.", "req_xls_pdf": "Excel + PDF!" };
            const cap = `🚨 <b>YANGI TOPSHIRIQ:</b>\n<i>${ctx.wizard.state.taskText}</i>\n🏁 Muddat: <b>${ctx.wizard.state.deadline.format("DD.MM.YYYY HH:mm")}</b>\n📊: <b>${reqN[ctx.wizard.state.reqType]}</b>`;
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
            ctx.replyWithHTML(`📝 <b>Ushbu topshiriqni tahrirlash:</b>`, Markup.inlineKeyboard([[Markup.button.callback("📝 Matnni tahrirlash", `edit_t_${t.id}`)]]));
        }
        return ctx.scene.leave();
    }
);

// --- EDIT WIZARD ---
const editWizard = new Scenes.WizardScene('EDIT_WIZARD',
    (ctx) => { ctx.replyWithHTML("✍️ <b>Yangi matnni yozing:</b>\n(Guruhdagi xabar avtomatik o'zgaradi)"); return ctx.wizard.next(); },
    async (ctx) => {
        const tid = ctx.wizard.state.taskId;
        const task = db.tasks.find(x => x.id == tid);
        const newText = ctx.message.text;
        task.text = newText; saveDb();
        const cap = `🚨 <b>TAHRIRLANGAN TOPSHIRIQ:</b>\n<i>${newText}</i>\n🏁 Muddat: <b>${moment(task.deadline).format("DD.MM.YYYY HH:mm")}</b>`;
        try {
            await bot.telegram.editMessageCaption(GROUP_ID, task.msg_id, null, cap, { parse_mode: 'HTML' });
        } catch (e) {
            await bot.telegram.editMessageText(GROUP_ID, task.msg_id, null, cap, { parse_mode: 'HTML' });
        }
        ctx.reply("✅ Guruhdagi xabar tahrirlandi!", mainMenu);
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([taskWizard, editWizard]);
bot.use(session()); bot.use(stage.middleware());

bot.start((ctx) => ctx.reply("🤖 Xush kelibsiz!", mainMenu));
bot.hears('🚀 Yangi topshiriq', (ctx) => { if (isAdmin(ctx.from.id)) ctx.scene.enter('TASK_WIZARD'); });
bot.hears('📝 Tahrirlash', (ctx) => {
    const last = db.tasks.slice(-5).reverse();
    const btns = last.map(t => [Markup.button.callback(t.text.substring(0, 20), `edit_t_${t.id}`)]);
    ctx.reply("📝 Qaysi topshiriqni tahrirlaymiz?", Markup.inlineKeyboard(btns));
});

bot.action(/^edit_t_(\d+)$/, (ctx) => { ctx.scene.enter('EDIT_WIZARD', { taskId: ctx.match[1] }); });
bot.action('home', (ctx) => ctx.scene.leave());

bot.on('message', (ctx) => {
    if (ctx.chat.type === 'private' && isAdmin(ctx.from.id) && (ctx.message.forward_from || ctx.message.forward_origin)) {
        const text = ctx.message.text || ctx.message.caption || "";
        const aid = (ctx.message.document || ctx.message.photo || ctx.message.video) ? ctx.message.message_id : null;
        ctx.replyWithHTML(`📡 <b>Vazirlik xabari!</b>`, Markup.inlineKeyboard([[Markup.button.callback("✅ Topshiriq qilish", "fwd_create")]]));
        ctx.session.fwd_data = { text, aid };
    }
});
bot.action('fwd_create', (ctx) => { const data = ctx.session.fwd_data; ctx.scene.enter('TASK_WIZARD', { fwd_text: data.text, fwd_attachmentId: data.aid }); });

bot.launch().then(() => console.log("💎 ADVANCED BOT ONLINE 💎"));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
