const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const http = require('http');

console.log("🚀 SCRIPT STARTING...");

// SERVER FOR RENDER
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => res.end('ALIVE\n'));
server.listen(PORT, '0.0.0.0');

// TOKEN CHECK
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
    console.error("🚨 CRITICAL ERROR: BOT_TOKEN topilmadi! Render-da Environment Variable qo'shing.");
    process.exit(1);
}

const bot = new Telegraf(TOKEN);
console.log("✅ Telegraf obyekti yaratildi.");

const ADMINS = [65002404, 786314811, 5310405293, 121730039];
const GROUP_ID = '-1002262665652';

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
if (fs.existsSync(DB_PATH)) { try { db = JSON.parse(fs.readFileSync(DB_PATH)); } catch(e) {} }
if (!db.topics || db.topics.length === 0) db.topics = INITIAL_TOPICS;

const saveDb = () => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
const isAdmin = (uid) => ADMINS.includes(Number(uid));

// TEST COMMAND
bot.command('ping', (ctx) => ctx.reply('PONG! ✅ Bot Render-da baralla ishlayapti!'));

// WIZARDS
const taskWizard = new Scenes.WizardScene('TASK_WIZARD',
    (ctx) => {
        const btns = db.topics.map(t => [Markup.button.callback(t.name, `sel_t_${t.id}`)]);
        ctx.replyWithHTML("📂 <b>Bo'limni tanlang:</b>", Markup.inlineKeyboard(btns));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.topicId = ctx.callbackQuery.data.replace('sel_t_', '');
        ctx.wizard.state.topicName = db.topics.find(t => t.id == ctx.wizard.state.topicId).name;
        ctx.replyWithHTML(`📍 <b>${ctx.wizard.state.topicName}</b>\n\n⚙️ <b>Ijro turi:</b>`, Markup.inlineKeyboard([
            [Markup.button.callback("✅ Standart", "req_std")], [Markup.button.callback("📊 Excel + PDF", "req_xls_pdf")]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.reqType = ctx.callbackQuery.data;
        ctx.replyWithHTML("📝 <b>Matnni yozing:</b>");
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.taskText = ctx.message.text;
        ctx.wizard.state.attachments = [];
        ctx.replyWithHTML(`📎 <b>Hujjatlarni tashlang:</b>`, Markup.inlineKeyboard([[Markup.button.callback("🏁 Tugatish", "finish")]]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'finish') { ctx.reply("Muddat? (15.04.2026 12:00)"); return ctx.wizard.next(); }
        if (ctx.message) ctx.wizard.state.attachments.push(ctx.message.message_id);
        return;
    },
    (ctx) => {
        const d = moment(ctx.message.text, "DD.MM.YYYY HH:mm", true);
        if (!d.isValid()) return ctx.reply("Format: DD.MM.YYYY HH:mm");
        ctx.wizard.state.deadline = d;
        ctx.replyWithHTML(`🏁 <b>TASDIQLASH:</b>\nYuborilsinmi?`, Markup.inlineKeyboard([[Markup.button.callback("✅ Ha", "confirm_send")]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'confirm_send') {
            const cap = `🚨 <b>YANGI TOPSHIRIQ:</b>\n<i>${ctx.wizard.state.taskText}</i>\n🏁 Muddat: <b>${ctx.wizard.state.deadline.format("DD.MM.YYYY HH:mm")}</b>`;
            let fmsg;
            for (let i = 0; i < ctx.wizard.state.attachments.length; i++) {
                const m = await bot.telegram.copyMessage(GROUP_ID, ctx.from.id, ctx.wizard.state.attachments[i], { caption: i === 0 ? cap : null, parse_mode: 'HTML', message_thread_id: ctx.wizard.state.topicId });
                if (i === 0) fmsg = m;
            }
            if (!fmsg) fmsg = await bot.telegram.sendMessage(GROUP_ID, cap, { parse_mode: 'HTML', message_thread_id: ctx.wizard.state.topicId });
            db.tasks.push({ id: Date.now(), msg_id: fmsg.message_id, topic_id: ctx.wizard.state.topicId, text: ctx.wizard.state.taskText, deadline: ctx.wizard.state.deadline.format("YYYY-MM-DD HH:mm:ss"), read_regions: [] });
            saveDb();
            ctx.reply("🚀 Yuborildi!");
        }
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([taskWizard]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => ctx.reply("🤖 Bot Tayyor! /vazifa_yangi"));
bot.command('vazifa_yangi', (ctx) => { if (isAdmin(ctx.from.id)) ctx.scene.enter('TASK_WIZARD'); });

bot.catch((err) => {
    console.error("🚨 BOT ERROR:", err);
});

bot.launch().then(() => {
    console.log("💎 PRODUCTION BOT IS ONLINE ON RENDER! 💎");
}).catch(err => console.error("🚨 LAUNCH FAILED:", err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
