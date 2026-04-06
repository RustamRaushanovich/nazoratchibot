const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const http = require('http');

console.log("🚀 BURST TRACKER ENGINE 11.0 STARTING...");

const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => res.end('BURST ENGINE ONLINE\n'));
server.listen(PORT, '0.0.0.0');

const TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(TOKEN);
const ADMINS = [65002404, 786314811, 5310405293, 121730039];
const GROUP_ID = '-1002262665652';
const BOT_USERNAME = 'fmmtbnazoratchi_bot';

const DB_PATH = './supervisor_db.json';
const HUDUD_KEYWORDS = ["Farg‘ona shahri", "Marg‘ilon shahri", "Beshariq tumani", "Bag‘dod tumani", "Uchko‘prik tumani", "Qo‘shtepa tumani", "Farg‘ona tumani", "O‘zbekiston tumani", "Dang‘ara tumani", "Rishton tumani", "So‘x tumani", "Toshloq tumani", "Oltiariq tumani", "Furqat tumani", "Buvayda tumani", "Quva tumani", "Qo‘qon shahri", "Quvasoy shahri", "Yozyovon tumani"];
const INITIAL_TOPICS = [{ id: 20758, name: "Tezkor topshiriqlar" }, { id: 20759, name: "Oila va xotin-qizlar" }, { id: 20760, name: "Ijtimoiy soha" }, { id: 20761, name: "Yoshlar masalalari" }, { id: 20762, name: "Xotin-qizlar" }, { id: 20763, name: "Ma'naviyat va ma'rifat" }, { id: 20764, name: "Ta'lim" }, { id: 20765, name: "Sport" }, { id: 20766, name: "Sog'liqni saqlash" }, { id: 20767, name: "Madaniyat" }, { id: 20768, name: "Mahalla va nuroniylar" }, { id: 20769, name: "Tadbirkorlik" }, { id: 20770, name: "Investitsiya" }, { id: 20771, name: "Qishloq xo'jaligi" }, { id: 20772, name: "Qurilish" }, { id: 20773, name: "Obodonlashtirish" }, { id: 20774, name: "Kommunal soha" }, { id: 20775, name: "Soliq va moliya" }, { id: 20776, name: "Davlat xizmatlari" }, { id: 20777, name: "Adliya" }, { id: 20778, name: "Ichki ishlar" }, { id: 20779, name: "Favqulodda vaziyatlar" }, { id: 20780, name: "Mudofaa ishlari" }, { id: 20781, name: "Arxiv" }, { id: 20782, name: "Statistika" }, { id: 20783, name: "Kadastr" }];

const DISTRICT_ADMINS = { 5807811746: "Dang‘ara tumani", 922449047: "Beshariq tumani", 5547706955: "Buvayda tumani", 8544693602: "So‘x tumani", 1969769846: "Rishton tumani", 341362677: "Yozyovon tumani", 6229419604: "Oltiariq tumani", 595501640: "Toshloq tumani", 503222829: "Qo‘shtepa tumani", 8145453879: "Bag‘dod tumani", 1894911241: "Furqat tumani", 6822495768: "Marg‘ilon shahri", 271593039: "O‘zbekiston tumani", 583173715: "Quvasoy shahri", 345359050: "Farg‘ona shahri", 1130890451: "Qo‘qon shahri", 309212107: "Quva tumani", 104416763: "Farg‘ona tumani", 7862384262: "Uchko‘prik tumani" };

let db = { tasks: [], topics: INITIAL_TOPICS };
if (fs.existsSync(DB_PATH)) { try { db.tasks = JSON.parse(fs.readFileSync(DB_PATH)).tasks || []; } catch(e) {} }
const saveDb = () => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

function getTaskCaption(t) {
    let cap = `🚨 <b>TOPSHIRIQ:</b>\n<i>${t.text.substring(0, 300)}</i>\n\n🏁 Muddat: <b>${moment(t.deadline).format("DD.MM.YYYY HH:mm")}</b>\n#ID_${t.id}`;
    return cap;
}

function getStatusText(t) {
    const unread = HUDUD_KEYWORDS.filter(h => !t.read_regions.includes(h));
    const total = HUDUD_KEYWORDS.length;
    let text = `📊 <b>#ID_${t.id} TOPSHIRIQ HOLATI (Munobat)</b>\n`;
    text += `⏱ Yangilandi: <b>${moment().format("HH:mm")}</b>\n\n`;
    text += `👁 Ko'rganlar: <b>${t.read_regions.length}/${total}</b>\n`;
    text += `✅ Ijro: <b>${t.completed_regions.length}/${total}</b>\n\n`;
    
    if (unread.length > 0) {
        text += `🔴 <b>Hali tanishmaganlar:</b>\n${unread.join("\n")}`;
    } else {
        text += `🟢 <b>Barcha tumanlar tanishib bo'ldi.</b>`;
    }
    return text;
}

// CRON FOR BURST STATUS (Every 1 minute check)
cron.schedule('* * * * *', async () => {
    const now = Date.now();
    for (const t of db.tasks) {
        if (!t.status_msg_id && (now - t.id) > (15 * 60 * 1000) && (now - t.id) < (12 * 60 * 60 * 1000)) {
            // First 15 min report
            const msg = await bot.telegram.sendMessage(GROUP_ID, getStatusText(t), { parse_mode: 'HTML', message_thread_id: t.topic_id });
            t.status_msg_id = msg.message_id; t.last_status_update = now;
            saveDb();
        } else if (t.status_msg_id && (now - (t.last_status_update || 0)) > (5 * 60 * 1000)) {
            // Every 5 min update
            try { await bot.telegram.editMessageText(GROUP_ID, t.status_msg_id, null, getStatusText(t), { parse_mode: 'HTML' }); } catch (e) {}
            t.last_status_update = now;
            saveDb();
        }
    }
});

const taskWizard = new Scenes.WizardScene('TASK_WIZARD', (ctx) => { ctx.replyWithHTML("📂 <b>Bo'lim:</b>", Markup.inlineKeyboard(INITIAL_TOPICS.map(t => [Markup.button.callback(t.name, `sel_t_${t.id}`)]))); return ctx.wizard.next(); }, (ctx) => { if (!ctx.callbackQuery) return; ctx.wizard.state.topicId = ctx.callbackQuery.data.replace('sel_t_', ''); ctx.wizard.state.topicName = INITIAL_TOPICS.find(t => t.id == ctx.wizard.state.topicId).name; ctx.replyWithHTML(`📍 <b>${ctx.wizard.state.topicName}</b>\n⚙️ <b>Ijro:</b>`, Markup.inlineKeyboard([[Markup.button.callback("✅ Standart", "req_std")], [Markup.button.callback("📊 Excel + PDF", "req_xls_pdf")], [Markup.button.callback("🔙 Orqaga", "back")]])); return ctx.wizard.next(); }, (ctx) => { if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(0); return ctx.wizard.steps[0](ctx); } ctx.wizard.state.reqType = ctx.callbackQuery.data; ctx.replyWithHTML("📝 <b>Matn:</b>"); return ctx.wizard.next(); }, (ctx) => { ctx.wizard.state.taskText = ctx.message.text; ctx.wizard.state.attachments = []; ctx.replyWithHTML(`📎 <b>Ilova (yoki 'Tugatish'):</b>`, Markup.inlineKeyboard([[Markup.button.callback("🏁 Tugatish", "finish")]])); return ctx.wizard.next(); }, (ctx) => { if (ctx.callbackQuery?.data === 'finish') { ctx.reply("⏱ Muddat? (15.04.2024 18:00)"); return ctx.wizard.next(); } if (ctx.message) ctx.wizard.state.attachments.push(ctx.message.message_id); }, (ctx) => { const d = moment(ctx.message.text, "DD.MM.YYYY HH:mm", true); if (!d.isValid()) return ctx.reply("Format: DD.MM.YYYY HH:mm"); ctx.wizard.state.deadline = d; ctx.replyWithHTML(`🏁 <b>TASDIQLASH:</b>`, Markup.inlineKeyboard([[Markup.button.callback("✅ Ha", "send")]])); return ctx.wizard.next(); }, async (ctx) => { if (ctx.callbackQuery?.data === 'send') { const t = { id: Date.now(), topic_id: ctx.wizard.state.topicId, text: ctx.wizard.state.taskText, deadline: ctx.wizard.state.deadline.format("YYYY-MM-DD HH:mm:ss"), read_regions: [], completed_regions: [], status_msg_id: null }; const cap = getTaskCaption(t); let fmsg; for (let i = 0; i < ctx.wizard.state.attachments.length; i++) { const m = await bot.telegram.copyMessage(GROUP_ID, ctx.from.id, ctx.wizard.state.attachments[i], { caption: i === 0 ? cap : null, parse_mode: 'HTML', message_thread_id: ctx.wizard.state.topicId }); if (i === 0) fmsg = m; } if (!fmsg) fmsg = await bot.telegram.sendMessage(GROUP_ID, cap, { parse_mode: 'HTML', message_thread_id: ctx.wizard.state.topicId }); t.msg_id = fmsg.message_id; db.tasks.push(t); saveDb(); const btns = [[{ text: "✅ Tanishdim", callback_data: `read_task_${t.id}` }], [{ text: "📤 Topshiriq ijrosini yuborish", url: `https://t.me/${BOT_USERNAME}?start=sub_${t.id}` }]]; await bot.telegram.editMessageReplyMarkup(GROUP_ID, fmsg.message_id, null, { inline_keyboard: btns }); ctx.reply(`🚀 Yuborildi! ID: #ID_${t.id}`); } return ctx.scene.leave(); });

const stage = new Scenes.Stage([taskWizard]);
bot.use(session()); bot.use(stage.middleware());

bot.start((ctx) => ctx.reply("🤖 Online!", Markup.keyboard([['🚀 Yangi topshiriq']]).resize()));
bot.hears('🚀 Yangi topshiriq', (ctx) => { if (ADMINS.includes(Number(ctx.from.id))) ctx.scene.enter('TASK_WIZARD'); });

bot.action(/^read_task_(\d+)$/, async (ctx) => {
    const t = db.tasks.find(x => x.id == ctx.match[1]); if (!t) return ctx.answerCbQuery("Xato!");
    const dist = DISTRICT_ADMINS[ctx.from.id]; if (!dist) return ctx.answerCbQuery("⚠️ Avval botda /start bosing!", { show_alert: true });
    ctx.answerCbQuery("✅ Tanishildi!");
    if (!t.read_regions.includes(dist)) { t.read_regions.push(dist); saveDb(); }
});

bot.on(['document', 'photo'], async (ctx) => {
    if (ctx.chat.id.toString() !== GROUP_ID) return;
    const dist = DISTRICT_ADMINS[ctx.from.id]; if (!dist) return;
    const t = db.tasks.filter(x => x.topic_id == ctx.message.message_thread_id).pop();
    if (t && !t.completed_regions.includes(dist)) { t.completed_regions.push(dist); if (!t.read_regions.includes(dist)) t.read_regions.push(dist); saveDb(); }
});

bot.launch();
