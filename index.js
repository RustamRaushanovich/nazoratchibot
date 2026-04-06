const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const http = require('http');

console.log("🚀 FAIR ANALYTIC ENGINE 6.1 STARTING...");

const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => res.end('FAIR REPORTING ENGINE LIVE\n'));
server.listen(PORT, '0.0.0.0');

const TOKEN = process.env.BOT_TOKEN;
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
if (fs.existsSync(DB_PATH)) { try { const l = JSON.parse(fs.readFileSync(DB_PATH)); db.tasks = l.tasks || []; } catch(e) {} }

// REPORT GENERATOR (FAIR FILTER)
async function generateWeeklyReport() {
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const now = moment();
    
    // MUDDATI O'TGAN YOKI BAJARIB BO'LINGAN TOPSHIRIQLARNI OLAMIZ
    const filteredTasks = db.tasks.filter(t => {
        const isWeekly = t.id >= weekAgo;
        const isExpired = moment(t.deadline).isBefore(now);
        return isWeekly && isExpired; 
    });

    if (filteredTasks.length === 0) return "⚠️ Muddati o'tgan topshiriqlar hali yo'q (Ijro muddati borlari hisobga olinmadi).";

    let report = `📊 <b>HAFTALIK IJRO HISOBOTI (MUDDATI O'TGAN)</b>\n`;
    report += `📅 Davr: <b>${moment(weekAgo).format("DD.MM")} - ${moment().format("DD.MM.YYYY")}</b>\n`;
    report += `🔢 Tahlilga olingan topshiriqlar: <b>${filteredTasks.length} ta</b>\n`;
    report += `💡 <i>Muddati bor topshiriqlar filtrdan o'tkazildi.</i>\n\n`;
    report += `🏛 <b>TUMANLAR KESMIDA:</b>\n`;
    report += `━━━━━━━━━━━━━━━━━━━━\n`;

    HUDUD_KEYWORDS.forEach(dist => {
        const readCount = filteredTasks.filter(t => t.read_regions.includes(dist)).length;
        const submitCount = filteredTasks.filter(t => t.completed_regions.includes(dist)).length;
        const total = filteredTasks.length;

        report += `📍 <b>${dist}:</b>\n`;
        report += `👁 Tanishuv: <b>${readCount}/${total}</b>\n`;
        report += `✅ Ijro: <b>${submitCount}/${total}</b>\n\n`;
    });

    return report;
}

cron.schedule('0 18 * * 6', async () => {
    const reportText = await generateWeeklyReport();
    await bot.telegram.sendMessage(GROUP_ID, reportText, { parse_mode: 'HTML' });
}, { timezone: "Asia/Tashkent" });

// ... (taskWizard, editWizard, submitWizard logic continues here with current settings) ...

// WIZARDS & BOT START (Same as Engine 6.0 but with report logic update)
const mainMenu = Markup.keyboard([['🚀 Yangi topshiriq', '📝 Tahrirlash'], ['📊 Statistika Hisoboti', 'ℹ️ Info']]).resize();

const taskWizard = new Scenes.WizardScene('TASK_WIZARD', (ctx) => { ctx.replyWithHTML("📂 <b>Bo'lim:</b>", Markup.inlineKeyboard(db.topics.map(t => [Markup.button.callback(t.name, `sel_t_${t.id}`)]))); return ctx.wizard.next(); }, (ctx) => { if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(0); return ctx.wizard.steps[0](ctx); } if (!ctx.callbackQuery) return; ctx.wizard.state.topicId = ctx.callbackQuery.data.replace('sel_t_', ''); ctx.wizard.state.topicName = db.topics.find(t => t.id == ctx.wizard.state.topicId).name; ctx.replyWithHTML(`📍 <b>${ctx.wizard.state.topicName}</b>\n⚙️ <b>Ijro:</b>`, Markup.inlineKeyboard([[Markup.button.callback("✅ Standart", "req_std")], [Markup.button.callback("📊 Excel + PDF", "req_xls_pdf")], [Markup.button.callback("📂 Word + PDF", "req_doc_pdf")], [Markup.button.callback("📦 Elektron + Imzoli", "req_any_pdf")], [Markup.button.callback("🔙 Orqaga", "back")]])); return ctx.wizard.next(); }, (ctx) => { if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(1); return ctx.wizard.steps[1](ctx); } if (!ctx.callbackQuery) return; ctx.wizard.state.reqType = ctx.callbackQuery.data; ctx.replyWithHTML("📝 <b>Matn:</b>", Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "back")]])); return ctx.wizard.next(); }, (ctx) => { if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(2); return ctx.wizard.steps[2](ctx); } ctx.wizard.state.taskText = ctx.message.text; ctx.wizard.state.attachments = []; ctx.replyWithHTML(`📎 <b>Ilova:</b>`, Markup.inlineKeyboard([[Markup.button.callback("🏁 Tugatish", "finish")], [Markup.button.callback("🔙 Orqaga", "back")]])); return ctx.wizard.next(); }, (ctx) => { if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(3); return ctx.wizard.steps[3](ctx); } if (ctx.callbackQuery?.data === 'finish') { ctx.reply("⏱ Muddat? (15.04.2024 18:00)"); return ctx.wizard.next(); } if (ctx.message) ctx.wizard.state.attachments.push(ctx.message.message_id); }, (ctx) => { if (ctx.callbackQuery?.data === 'back') { ctx.wizard.selectStep(4); return ctx.wizard.steps[4](ctx); } const d = moment(ctx.message.text, "DD.MM.YYYY HH:mm", true); if (!d.isValid()) return ctx.reply("Sana: DD.MM.YYYY HH:mm"); ctx.wizard.state.deadline = d; ctx.replyWithHTML(`🏁 <b>TASDIQLASH:</b>\nYuborilmoqdami?`, Markup.inlineKeyboard([[Markup.button.callback("✅ Ha", "send")], [Markup.button.callback("🔙 Orqaga", "back")]])); return ctx.wizard.next(); }, async (ctx) => { if (ctx.callbackQuery?.data === 'send') { const rN = { "req_std": "Ijro!", "req_xls_pdf": "Excel + PDF!", "req_doc_pdf": "Word + PDF!", "req_any_pdf": "Elektron + Imzoli!" }; const cap = `🚨 <b>YANGI TOPSHIRIQ:</b>\n<i>${ctx.wizard.state.taskText}</i>\n🏁 Muddat: <b>${ctx.wizard.state.deadline.format("DD.MM.YYYY HH:mm")}</b>\n📊: <b>${rN[ctx.wizard.state.reqType]}</b>`; let fmsg; for (let i = 0; i < ctx.wizard.state.attachments.length; i++) { const m = await bot.telegram.copyMessage(GROUP_ID, ctx.from.id, ctx.wizard.state.attachments[i], { caption: i === 0 ? cap : null, parse_mode: 'HTML', message_thread_id: ctx.wizard.state.topicId }); if (i === 0) fmsg = m; } if (!fmsg) fmsg = await bot.telegram.sendMessage(GROUP_ID, cap, { parse_mode: 'HTML', message_thread_id: ctx.wizard.state.topicId }); const t = { id: Date.now(), msg_id: fmsg.message_id, topic_id: ctx.wizard.state.topicId, text: ctx.wizard.state.taskText, deadline: ctx.wizard.state.deadline.format("YYYY-MM-DD HH:mm:ss"), reqType: ctx.wizard.state.reqType, completed_regions: [], read_regions: [], pending_files: {} }; db.tasks.push(t); saveDb(); const btns = [[{ text: "✅ Tanishdim", callback_data: `read_task_${t.id}` }], [{ text: "📤 Topshiriq ijrosini yuborish", url: `https://t.me/${BOT_USERNAME}?start=sub_${t.id}` }]]; await bot.telegram.editMessageReplyMarkup(GROUP_ID, fmsg.message_id, null, { inline_keyboard: btns }); ctx.reply("🚀 Yuborildi!", mainMenu); ctx.replyWithHTML(`📝 <b>Tahrirlash:</b>`, Markup.inlineKeyboard([[Markup.button.callback("📝 Tahrirlash", `edit_t_${t.id}`)]])); } return ctx.scene.leave(); });

const submitWizard = new Scenes.WizardScene('SUBMIT_WIZARD', (ctx) => { const taskId = ctx.scene.state.taskId; const task = db.tasks.find(t => t.id == taskId); if (!task) { ctx.reply("🚨 Xato!"); return ctx.scene.leave(); } const dist = DISTRICT_ADMINS[ctx.from.id] || (users_db[ctx.from.id] && users_db[ctx.from.id].district); if (!dist) { ctx.reply("🚨 Ro'yxatdan o'ting!"); return ctx.scene.leave(); } ctx.wizard.state.task = task; ctx.wizard.state.district = dist; ctx.replyWithHTML(`📍 <b>${dist}</b> ijrosi:\n"${task.text.substring(0, 30)}..." tashlang:`); return ctx.wizard.next(); }, async (ctx) => { if (ctx.callbackQuery?.data === 'partial_send') { await postToGroup(ctx, ctx.wizard.state.task, ctx.wizard.state.district, true); ctx.reply("⚠️ Chala yuborildi."); return ctx.scene.leave(); } const task = ctx.wizard.state.task; const dist = ctx.wizard.state.district; if (task.reqType !== 'req_std') { if (!task.pending_files[dist]) task.pending_files[dist] = { electronic: false, confirmed: false, files: [] }; if (ctx.message?.document || ctx.message?.photo) { if (ctx.message?.document) { const n = ctx.message.document.file_name.toLowerCase(); if (n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.docx') || n.endsWith('.doc') || n.endsWith('.zip')) task.pending_files[dist].electronic = true; if (n.endsWith('.pdf')) task.pending_files[dist].confirmed = true; } else if (ctx.message?.photo) task.pending_files[dist].confirmed = true; task.pending_files[dist].files.push(ctx.message.message_id); } if (task.pending_files[dist].electronic && task.pending_files[dist].confirmed) { task.completed_regions.push(dist); saveDb(); await postToGroup(ctx, task, dist, false); ctx.reply("🚀 To'liq yuborildi!"); return ctx.scene.leave(); } else { saveDb(); ctx.replyWithHTML(`✅ Fayl qabul qilindi. Hammasi tayyormi?`, Markup.inlineKeyboard([[Markup.button.callback("⚠️ Chala yuborish", "partial_send")], [Markup.button.callback("➕ Yana bor", "wait")]])); } } else { task.completed_regions.push(dist); saveDb(); await postToGroup(ctx, task, dist, false); ctx.reply("🚀 Yuborildi!"); return ctx.scene.leave(); } });
async function postToGroup(ctx, task, district, isPartial) { const s = isPartial ? "⚠️ CHALA IJRO" : "✅ TO'LIQ IJRO"; const cap = `🔄 <b>${district.toUpperCase()}</b> ijro yubordi:\n📊: <b>${s}</b>\n📝 <i>${task.text.substring(0, 30)}...</i>\n\n#ijro_nazorati`; const f = (task.pending_files[district] && task.pending_files[district].files.length > 0) ? task.pending_files[district].files : [ctx.message.message_id]; for (const mid of f) await bot.telegram.copyMessage(GROUP_ID, ctx.from.id, mid, { message_thread_id: task.topic_id, caption: mid === f[0] ? cap : null, parse_mode: 'HTML' }); }

const stage = new Scenes.Stage([taskWizard, submitWizard]);
bot.use(session()); bot.use(stage.middleware());

bot.start(async (ctx) => { const p = ctx.startPayload; if (p?.startsWith('sub_')) return ctx.scene.enter('SUBMIT_WIZARD', { taskId: p.replace('sub_', '') }); ctx.reply("🤖 Online!", mainMenu); });
bot.hears('🚀 Yangi topshiriq', (ctx) => { if (ADMINS.includes(Number(ctx.from.id))) ctx.scene.enter('TASK_WIZARD'); });
bot.hears('📊 Statistika Hisoboti', async (ctx) => { if (ADMINS.includes(Number(ctx.from.id))) ctx.replyWithHTML(await generateWeeklyReport()); });

bot.action(/^read_task_(\d+)$/, async (ctx) => { const tid = ctx.match[1]; const t = db.tasks.find(x => x.id == tid); if (!t) return ctx.answerCbQuery("Xato!"); const dist = DISTRICT_ADMINS[ctx.from.id] || (users_db[ctx.from.id] && users_db[ctx.from.id].district); if (!dist) return ctx.answerCbQuery("⚠️ Avval /start bosing!", { show_alert: true }); await ctx.answerCbQuery("✅ Tanishuv qayd etildi!"); if (t.read_regions.includes(dist)) return; t.read_regions.push(dist); saveDb(); await bot.telegram.sendMessage(GROUP_ID, `✅ <b>${dist}</b> tanishdi.`, { parse_mode: 'HTML', message_thread_id: t.topic_id }); });

bot.launch().then(() => console.log("💎 FAIR REPORT ENGINE READY 💎"));
process.once('SIGINT', () => bot.stop('SIGINT')); process.once('SIGTERM', () => bot.stop('SIGTERM'));
