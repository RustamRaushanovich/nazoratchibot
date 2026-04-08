const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const http = require('http');

// V13.5 - EXECUTIVE (FINAL 26 TOPICS STABLE)
const PORT = process.env.PORT || 10000;
const TOKEN = '8629827264:AAHnQ8LwpLO74NbLErGsd5ujk4xiRRRYEHw';
const GROUP_ID = -1002262665652;

const HUDUD_KEYWORDS = ["Farg‘ona shahri", "Marg‘ilon shahri", "Beshariq tumani", "Bag‘dod tumani", "Uchko‘prik tumani", "Qo‘shtepa tumani", "Farg‘ona tumani", "O‘zbekiston tumani", "Dang‘ara tumani", "Rishton tumani", "So‘x tumani", "Toshloq tumani", "Oltiariq tumani", "Furqat tumani", "Buvayda tumani", "Quva tumani", "Qo‘qon shahri", "Quvasoy shahri", "Yozyovon tumani"];

const TELEGRAM_TOPICS = [
    { id: 9001, name: "📜 ПҚ-1 бўйича алоҳида" },
    { id: 1, name: "🌍 General" },
    { id: 8785, name: "📄 ПҚ ва ПФ топшириқлари" },
    { id: 8779, name: "📝 Topshiriqlar uchun alohida" },
    { id: 35153, name: "👤 Ёшлар куни (пайшанба)" },
    { id: 8795, name: "✈️ Xorij (ketgan/kelgan)" },
    { id: 8777, name: "🚫 Гиёҳвандликka қарши" },
    { id: 34015, name: "🗓 Чора-тадбирлар" },
    { id: 16708, name: "🎖 ЧҚБТ (Жасорат м.)" },
    { id: 34752, name: "🎗 Ёшlar kuni (munosabat)" },
    { id: 8803, name: "⚡️ ТЕЗКОР!" },
    { id: 36194, name: "♻️ Xorijdan qaytarilganlar" },
    { id: 13201, name: "🏆 Спорт тадбирлари" },
    { id: 22873, name: "⏳ Келажак соатлари" },
    { id: 13081, name: "👩‍💼 Хотин-qizlar va gender" },
    { id: 8800, name: "⚖️ Жиноятchilik назорати" },
    { id: 19963, name: "📊 КУНЛИК ДАВОМАТ" },
    { id: 13787, name: "🌟 Iqtidorli o‘quvchilar" },
    { id: 13775, name: "📺 OAV yoritilishi" },
    { id: 13006, name: "🤝 Камбағал оилаларга к." },
    { id: 20509, name: "📖 Сиёсий-маърифат соати" },
    { id: 9878, name: "☀️ Ёзги соғломлаштириш" },
    { id: 10766, name: "🔔 Сўнгги қўнғироқ" },
    { id: 20758, name: "🌱 Ekologiya" },
    { id: 8790, name: "📑 15 талик жадвал" },
    { id: 10778, name: "🎭 ТАНЛОВ ВА ТАДБИРЛАР" }
];

let db = { tasks: [] }; 
function loadDb() { if (fs.existsSync('./supervisor_db.json')) { try { db = JSON.parse(fs.readFileSync('./supervisor_db.json')); } catch (e) {} } db.topics = TELEGRAM_TOPICS; }
function saveDb() { fs.writeFileSync('./supervisor_db.json', JSON.stringify(db, null, 2)); }
loadDb();

const bot = new Telegraf(TOKEN);

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

    if (req.url.startsWith('/api/data')) {
        const stats = {};
        HUDUD_KEYWORDS.forEach(h => { stats[h] = { total: 0, seen: 0, onTime: 0, late: 0 }; });
        db.tasks.forEach(t => {
            const deadline = moment(t.deadline, "YYYY-MM-DD HH:mm:ss");
            HUDUD_KEYWORDS.forEach(h => {
                stats[h].total++;
                if (t.seen_regions?.some(r => r.region === h)) stats[h].seen++;
                if (t.is_exec_required) {
                    const comp = t.completed_regions?.find(r => r.region === h);
                    if (comp) {
                        if (moment(comp.time).isBefore(deadline)) stats[h].onTime++;
                        else stats[h].late++;
                    }
                } else {
                    // For informational tasks, 'seen' counts as 'onTime'
                    if (t.seen_regions?.some(r => r.region === h)) stats[h].onTime++;
                }
            });
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ tasks: db.tasks, topics: TELEGRAM_TOPICS, districts: HUDUD_KEYWORDS, stats }));
    }

    if (req.url.startsWith('/api/edit') && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c.toString());
        req.on('end', async () => {
            const data = JSON.parse(body);
            const tasksToEdit = db.tasks.filter(t => t.custom_id === data.custom_id);
            for (const task of tasksToEdit) {
                task.text = data.text;
                task.deadline = `${data.date} ${data.time}:00`;
                task.is_exec_required = data.is_exec_required;
                const txt = `✏️ <b>TAHRIRLANDI (ID: ${task.custom_id})</b>\n🛠 Ijro turi: <b>${data.exec_types?.join(', ') || 'Ma\'lum qilinmagan'}</b>\n📢 <b>YANGI TOPSHIRIQ:</b>\n📝 <i>${task.text}</i>\n📅 Muddat: <b>${data.date} ${data.time}</b>\n\n#topshiriq_nazorati`;
                const threadId = parseInt(task.topic_id) === 1 ? undefined : parseInt(task.topic_id);
                
                const buttons = [Markup.button.callback("📥 Tanishdim", `seen_${task.id}`)];
                if (task.is_exec_required) buttons.push(Markup.button.callback("✅ Bajarildi", `done_${task.id}`));
                const keyboard = Markup.inlineKeyboard([buttons]);

                try {
                    await bot.telegram.editMessageText(GROUP_ID, task.msg_id, null, txt, { parse_mode: 'HTML', ...keyboard });
                } catch (e) { console.error("EDIT MSG ERROR:", e.message); }
            }
            saveDb(); res.writeHead(200); res.end('OK');
        });
        return;
    }

    if (req.url.startsWith('/api/create') && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c.toString());
        req.on('end', async () => {
            const data = JSON.parse(body);
            const prefix = data.creator_id || "02";
            const cId = `${prefix}/${String((db.tasks||[]).length + 1).padStart(5, '0')}`;
            
            for (const tid of data.topics) {
                const task = { 
                    id: Date.now()+Math.random(), 
                    custom_id: cId, 
                    text: data.text, 
                    deadline: `${data.date} ${data.time}:00`, 
                    topic_id: tid, 
                    is_exec_required: data.is_exec_required,
                    completed_regions: [], 
                    seen_regions: [] 
                };
                db.tasks.push(task);
                const txt = `📌 <b>ID: ${cId}</b>\n🛠 Ijro turi: <b>${data.exec_types?.join(', ') || 'Ma\'lum qilinmagan'}</b>\n📢 <b>YANGI TOPSHIRIQ:</b>\n📝 <i>${task.text}</i>\n📅 Muddat: <b>${data.date} ${data.time}</b>\n\n#topshiriq_nazorati`;
                
                try {
                    let firstMsg;
                    const threadId = parseInt(tid) === 1 ? undefined : parseInt(tid);
                    const buttons = [Markup.button.callback("📥 Tanishdim", `seen_${task.id}`)];
                    if (task.is_exec_required) buttons.push(Markup.button.callback("✅ Bajarildi", `done_${task.id}`));
                    const keyboard = Markup.inlineKeyboard([buttons]);

                    if (data.files && data.files.length > 0) {
                        for (let i = 0; i < data.files.length; i++) {
                            const f = data.files[i];
                            const buf = Buffer.from(f.data.split(',')[1], 'base64');
                            const m = await bot.telegram.sendDocument(GROUP_ID, { source: buf, filename: f.name }, { caption: i === 0 ? txt : `📝 Ilova #${i+1}`, parse_mode: 'HTML', message_thread_id: threadId, ...keyboard });
                            if (i === 0) firstMsg = m;
                        }
                    } else {
                        firstMsg = await bot.telegram.sendMessage(GROUP_ID, txt, { parse_mode: 'HTML', message_thread_id: threadId, ...keyboard });
                    }
                    task.msg_id = firstMsg.message_id;
                    const monTxt = `📊 <b>IJRO:</b> ${cId}\n\n` + HUDUD_KEYWORDS.map(h => `${h}: 🛑`).join('\n') + `\n🕒 Live: ${moment().format("HH:mm:ss")}`;
                    const mon = await bot.telegram.sendMessage(GROUP_ID, monTxt, { parse_mode: 'HTML', message_thread_id: threadId });
                    task.monitoring_msg_id = mon.message_id;
                } catch (e) {
                    console.error("BROADCAST ERROR:", e.message);
                }
            }
            saveDb(); res.writeHead(200); res.end('OK');
        });
        return;
    }
    if (req.url === '/' || req.url === '/dashboard') { res.writeHead(200); return res.end(fs.readFileSync('./dashboard.html')); }
    res.writeHead(404); res.end('Not Found');
}).listen(PORT, () => console.log(`🚀 EXECUTIVE SERVER ONLINE ON PORT ${PORT}`));

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('seen_')) {
        const tId = parseFloat(data.split('_')[1]);
        const task = db.tasks.find(t => t.id === tId);
        if (!task) return ctx.answerCbQuery("Topshiriq topilmadi!");
        const region = DISTRICT_ADMINS[ctx.from.id];
        if (!region) return ctx.answerCbQuery("Siz ro'yxatdan o'tmagansiz!");
        if (task.seen_regions.some(r => r.region === region)) return ctx.answerCbQuery("Siz allaqachon tanishdingiz!");
        task.seen_regions.push({ region, time: new Date() });
        saveDb();
        updateMonitoring(task);
        ctx.answerCbQuery("Tanishganingiz qayd etildi!");
    }
    if (data.startsWith('done_')) {
        const tId = parseFloat(data.split('_')[1]);
        const task = db.tasks.find(t => t.id === tId);
        if (!task) return ctx.answerCbQuery("Topshiriq topilmadi!");
        const region = DISTRICT_ADMINS[ctx.from.id];
        if (!region) return ctx.answerCbQuery("Siz ro'yxatdan o'tmagansiz!");
        if (task.completed_regions.some(r => r.region === region)) return ctx.answerCbQuery("Siz allaqachon bajargansiz!");
        task.completed_regions.push({ region, time: new Date() });
        saveDb();
        updateMonitoring(task);
        ctx.answerCbQuery("Ijro etilganingiz qayd etildi! Barakalla!");
    }
});

const DISTRICT_ADMINS = { 5807811746: "Dang‘ara tumani", 922449047: "Beshariq tumani", 5547706955: "Buvayda tumani", 8544693602: "So‘x tumani", 1969769846: "Rishton tumani", 341362677: "Yozyovon tumani", 6229419604: "Oltiariq tumani", 595501640: "Toshloq tumani", 503222829: "Qo‘shtepa tumani", 8145453879: "Bag‘dod tumani", 1894911241: "Furqat tumani", 6822495768: "Marg‘ilon shahri", 271593039: "O‘zbekiston tumani", 583173715: "Quvasoy shahri", 345359050: "Farg‘ona shahri", 1130890451: "Qo‘qon shahri", 309212107: "Quva tumani", 104416763: "Farg‘ona tumani", 7862384262: "Uchko‘prik tumani" };

async function updateMonitoring(task) {
    const isExec = task.is_exec_required;
    const header = isExec ? "<code> № HUDUD              | TANISHDI | IJRO </code>\n" : "<code> № HUDUD              | TANISHDI </code>\n";
    
    const text = `📊 <b>IJRO MONITORINGI:</b>\n📌 ID: <b>${task.custom_id}</b>\n\n` + header + HUDUD_KEYWORDS.map((h, i) => {
        const num = String(i + 1).padStart(2, ' ');
        const paddedName = h.padEnd(18, ' '); // Padding to 18 chars for alignment
        let seen = task.seen_regions.some(r => r.region === h) ? "📥" : "🛑";
        if (isExec) {
            let comp = task.completed_regions.some(r => r.region === h) ? "✅" : "🛑";
            return `<code>${num}. ${paddedName}: ${seen} | ${comp}</code>`;
        } else {
            return `<code>${num}. ${paddedName}: ${seen}</code>`;
        }
    }).join('\n') + `\n\n🕒 Live Update: ${moment().format("HH:mm:ss")}`;
    const threadId = parseInt(task.topic_id) === 1 ? undefined : parseInt(task.topic_id);
    try { await bot.telegram.editMessageText(GROUP_ID, task.monitoring_msg_id, null, text, { parse_mode: 'HTML' }); } catch (e) {}
}

bot.launch().then(() => console.log("✅ BOT EXECUTIVE ONLINE"));
