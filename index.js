const { Telegraf, Markup, session, Scenes } = require('telegraf');
const fs = require('fs');
const moment = require('moment-timezone');
const cron = require('node-cron');
const http = require('http');

// V13.5 - EXECUTIVE (FINAL 26 TOPICS STABLE)
const PORT = process.env.PORT || 1001;
const TOKEN = '8629827264:AAHnQ8LwpLO74NbLErGsd5ujk4xiRRRYEHw';
const GROUP_ID = -1002262665652;

const EMOJI_MAP = { '0': '0️⃣', '1': '1️⃣', '2': '2️⃣', '3': '3️⃣', '4': '4️⃣', '5': '5️⃣', '6': '6️⃣', '7': '7️⃣', '8': '8️⃣', '9': '9️⃣', '/': '/', '-': '➖' };
function toEmojiId(id) { 
    return "🆔 " + id.split('').map(char => EMOJI_MAP[char] || char).join('');
}

function transliterate(text) {
    const map = {
        'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'J','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'X','Ц':'Ts','Ч':'Ch','Ш':'Sh','Ъ':'\'','Ь':'','Э':'E','Ю':'Yu','Я':'Ya',
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'x','ц':'ts','ч':'ch','ш':'sh','ъ':'\'','ь':'','э':'e','ю':'yu','я':'ya',
        'Ў':'O‘','ў':'o‘','Қ':'Q','қ':'q','Ғ':'G‘','ғ':'g‘','Ҳ':'H','ҳ':'h'
    };
    return text.split('').map(char => map[char] || char).join('');
}

const DISTRICT_ADMINS = { 5807811746: "Dang‘ara tumani", 922449047: "Beshariq tumani", 5547706955: "Buvayda tumani", 8544693602: "So‘x tumani", 1969769846: "Rishton tumani", 341362677: "Yozyovon tumani", 6229419604: "Oltiariq tumani", 595501640: "Toshloq tumani", 503222829: "Qo‘shtepa tumani", 8145453879: "Bag‘dod tumani", 1894911241: "Furqat tumani", 6822495768: "Marg‘ilon shahri", 271593039: "O‘zbekiston tumani", 583173715: "Quvasoy shahri", 345359050: "Farg‘ona shahri", 1130890451: "Qo‘qon shahri", 309212107: "Quva tumani", 104416763: "Farg‘ona tumani", 7862384262: "Uchko‘prik tumani" };

const HUDUD_KEYWORDS = ["Farg‘ona shahri", "Marg‘ilon shahri", "Beshariq tumani", "Bag‘dod tumani", "Uchko‘prik tumani", "Qo‘shtepa tumani", "Farg‘ona tumani", "O‘zbekiston tumani", "Dang‘ara tumani", "Rishton tumani", "So‘x tumani", "Toshloq tumani", "Oltiariq tumani", "Furqat tumani", "Buvayda tumani", "Quva tumani", "Qo‘qon shahri", "Quvasoy shahri", "Yozyovon tumani"];


let db = { tasks: [], topics: [] }; 
function loadDb() { 
    if (fs.existsSync('./supervisor_db.json')) { 
        try { 
            db = JSON.parse(fs.readFileSync('./supervisor_db.json')); 
        } catch (e) {} 
    } 
    // Ensure initial topics if db is empty or just started
    if (!db.topics || db.topics.length === 0) {
        db.topics = [
            { id: 1, name: "🌍 General" },
            { id: 8803, name: "⚡️ ТЕЗКОР!" }
        ];
    }
}

function saveDb() { fs.writeFileSync('./supervisor_db.json', JSON.stringify(db, null, 2)); }
loadDb();

let waitingReports = {}; // State: { userId: { taskId, region, topicId } }

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
        return res.end(JSON.stringify({ tasks: db.tasks, topics: db.topics, districts: HUDUD_KEYWORDS, stats }));
    }

    if (req.url.startsWith('/api/edit') && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c.toString());
        req.on('end', async () => {
            const data = JSON.parse(body);
            const translatedText = transliterate(data.text);
            const tasksToEdit = db.tasks.filter(t => t.custom_id === data.custom_id);
            for (const task of tasksToEdit) {
                task.text = translatedText;
                task.deadline = `${data.date} ${data.time}:00`;
                task.is_exec_required = data.is_exec_required;
                
                // APPLY MANUAL OVERRIDES IF PROVIDED
                if (data.manual_seen) {
                    task.seen_regions = data.manual_seen.map(r => ({ region: r, time: new Date() }));
                }
                if (data.manual_done) {
                    task.completed_regions = data.manual_done.map(r => ({ region: r, time: new Date() }));
                }

                const txt = `✏️ <b>TAHRIRLANDI (ID: ${task.custom_id})</b>\n🛠 Ijro turi: <b>${data.exec_types?.join(', ') || 'Ma\'lum qilinmagan'}</b>\n📢 <b>YANGI TOPSHIRIQ:</b>\n📝 <i>${task.text}</i>\n📅 Muddat: <b>${data.date} ${data.time}</b>\n\n#topshiriq_nazorati`;
                const buttons = [Markup.button.callback("📥 Tanishdim", `seen_${task.id}`)];
                if (task.is_exec_required) buttons.push(Markup.button.callback("✅ Bajarildi", `done_${task.id}`));
                const keyboard = Markup.inlineKeyboard([buttons]);

                try {
                    await bot.telegram.editMessageText(GROUP_ID, task.msg_id, null, txt, { parse_mode: 'HTML', ...keyboard });
                    updateMonitoring(task); // Refresh the monitoring report live!
                } catch (e) { console.error("EDIT MSG ERROR:", e.message); }
            }
            saveDb(); res.writeHead(200); res.end('OK');
        });
        return;
    }

    if (req.url.startsWith('/api/delete') && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c.toString());
        req.on('end', async () => {
            const data = JSON.parse(body);
            const task = db.tasks.find(t => t.custom_id === data.custom_id || t.id == data.id);
            if (task) {
                try {
                    await bot.telegram.deleteMessage(GROUP_ID, task.msg_id).catch(() => {});
                    await bot.telegram.deleteMessage(GROUP_ID, task.monitoring_msg_id).catch(() => {});
                } catch (e) {}
                db.tasks = db.tasks.filter(t => t.custom_id !== data.custom_id && t.id != data.id);
                saveDb();
            }
            res.writeHead(200); res.end('DELETED');
        });
        return;
    }

    if (req.url.startsWith('/api/create') && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c.toString());
        req.on('end', async () => {
            const data = JSON.parse(body);
            const prefix = data.creator_id || "02";
            const rawId = `${prefix}/${String((db.tasks||[]).length + 1).padStart(5, '0')}`;
            const emojiId = toEmojiId(rawId);
            
            let lastTopicName = "";
            const translatedText = transliterate(data.text);
            
            for (const tid of data.topics) {
                const topic = db.topics.find(tp => tp.id == tid);
                lastTopicName = topic ? topic.name : "Noma'lum";
                const task = { 
                    id: Date.now()+Math.random(), 
                    custom_id: rawId, 
                    emoji_id: emojiId,
                    text: translatedText, 
                    deadline: `${data.date} ${data.time}:00`, 
                    topic_id: tid, 
                    is_exec_required: data.is_exec_required,
                    completed_regions: [], 
                    seen_regions: [] 
                };
                db.tasks.push(task);
                const txt = `${emojiId}\n🛠 Ijro turi: <b>${data.exec_types?.join(', ') || 'Ma\'lum qilinmagan'}</b>\n📢 <b>YANGI TOPSHIRIQ:</b>\n📝 <i>${task.text}</i>\n📅 Muddat: <b>${data.date} ${data.time}</b>\n\n#topshiriq_nazorati`;
                
                try {
                    let firstMsg;
                    const threadId = parseInt(tid) === 1 ? undefined : parseInt(tid);
                    const keyboard = getTaskKeyboard(task);

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
                    const monTxt = `📊 <b>IJRO:</b> ${emojiId}\n\n` + HUDUD_KEYWORDS.map(h => `${h}: 🛑`).join('\n');
                    const mon = await bot.telegram.sendMessage(GROUP_ID, monTxt, { parse_mode: 'HTML', message_thread_id: threadId });
                    task.monitoring_msg_id = mon.message_id;
                    updateMonitoring(task);
                } catch (e) { console.error("BROADCAST ERROR:", e.message); }
            }
            saveDb(); res.writeHead(200, { 'Content-Type': 'application/json' }); 
            res.end(JSON.stringify({ success: true, topic_name: lastTopicName }));
        });
        return;
    }
    if (req.url === '/' || req.url === '/dashboard') { res.writeHead(200); return res.end(fs.readFileSync('./dashboard.html')); }
    if (req.url === '/manifest.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(fs.readFileSync('./manifest.json')); }
    res.writeHead(404); res.end('Not Found');
});

// ADMIN PANEL URL (Replace with your actual public URL when deployed)
const WEB_APP_URL = 'https://' + (process.env.RENDER_EXTERNAL_HOSTNAME || 'your-service.onrender.com');

bot.start((ctx) => {
    const region = DISTRICT_ADMINS[ctx.from.id];
    let txt = `Assalomu alaykum! **Guruh Nazorati Botiga** xush kelibsiz.\n\n`;
    if (region) {
        txt += `Siz **${region}** administratori sifatida ro'yxatga olingansiz.`;
    } else {
        txt += `Siz hozircha tizimda ro'yxatga olinmagansiz.`;
    }
    
    // Only show Dashboard button to main admins or specific users if needed
    // For now, let's allow access via /admin command for simplicity
    ctx.replyWithHTML(txt, Markup.inlineKeyboard([
        [Markup.button.webApp("🚀 Dashboardni ochish", WEB_APP_URL)]
    ]));
});

bot.command('admin', (ctx) => {
    ctx.replyWithHTML("📊 <b>Admin boshqaruv paneli:</b>", Markup.inlineKeyboard([
        [Markup.button.webApp("🖥 Tizimni boshqarish (Mobile App)", WEB_APP_URL)]
    ]));
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    const region = DISTRICT_ADMINS[userId];
    if (!region) return ctx.answerCbQuery("Siz ro'yxatdan o'tmagansiz!");

    if (data.startsWith('seen_')) {
        const tId = parseFloat(data.split('_')[1]);
        const task = db.tasks.find(t => t.id === tId);
        if (!task) return ctx.answerCbQuery("Topshiriq topilmadi!");
        if (task.seen_regions.some(r => r.region === region)) return ctx.answerCbQuery("Siz allaqachon tanishdingiz!");
        
        task.seen_regions.push({ region, time: new Date() });
        saveDb();
        updateMonitoring(task);
        
        // Update the button to green
        try {
            await ctx.editMessageReplyMarkup(getTaskKeyboard(task, userId).reply_markup);
        } catch(e){}
        
        ctx.answerCbQuery("Tanishganingiz qayd etildi! ✅");
    }
    if (data.startsWith('done_')) {
        const tId = parseFloat(data.split('_')[1]);
        const task = db.tasks.find(t => t.id === tId);
        if (!task) return ctx.answerCbQuery("Topshiriq topilmadi!");
        if (task.completed_regions.some(r => r.region === region)) return ctx.answerCbQuery("Siz allaqachon bajargansiz!");
        
        task.completed_regions.push({ region, time: new Date() });
        saveDb();
        updateMonitoring(task);
        
        waitingReports[userId] = { taskId: tId, region, topicId: task.topic_id };
        ctx.replyWithHTML(`📥 <b>${region}</b>, Iltimos topshiriq ижро ҳужжатини (Word, Excel, PDF ёки Rasm) юборинг.`, { reply_to_message_id: ctx.callbackQuery.message.message_id });
        
        ctx.answerCbQuery("Ijro etilganingiz qayd etildi! Endi faylni yuboring.");
    }
});

// LISTEN FOR REPORTS
bot.on(['document', 'photo', 'video'], async (ctx) => {
    const userId = ctx.from.id;
    const report = waitingReports[userId];
    if (!report) return;

    const region = report.region;
    const topicId = report.topicId;
    
    await ctx.replyWithHTML(`✅ <b>${region}</b> ижро ҳужжати қабул қилинди ва файл топикка йўлланди.`, { reply_to_message_id: ctx.message.message_id });
    
    // Forward to the same topic
    const caption = `📥 <b>${region}</b> ijro holati\n🆔 Topshiriq ID: <code>${report.taskId}</code>`;
    
    if (ctx.message.document) {
        await bot.telegram.sendDocument(GROUP_ID, ctx.message.document.file_id, { message_thread_id: topicId, caption, parse_mode: 'HTML' });
    } else if (ctx.message.photo) {
        await bot.telegram.sendPhoto(GROUP_ID, ctx.message.photo[ctx.message.photo.length - 1].file_id, { message_thread_id: topicId, caption, parse_mode: 'HTML' });
    } else if (ctx.message.video) {
        await bot.telegram.sendVideo(GROUP_ID, ctx.message.video.file_id, { message_thread_id: topicId, caption, parse_mode: 'HTML' });
    }
    
    delete waitingReports[userId];
});

// BOT LISTENERS FOR TOPIC SYNC
bot.on('forum_topic_created', (ctx) => {
    const topic = ctx.message.forum_topic_created;
    const topicId = ctx.message.message_thread_id;
    if (!db.topics.find(t => t.id === topicId)) {
        db.topics.push({ id: topicId, name: topic.name });
        saveDb();
    }
});

bot.on('forum_topic_edited', (ctx) => {
    const topic = ctx.message.forum_topic_edited;
    const topicId = ctx.message.message_thread_id;
    const index = db.topics.findIndex(t => t.id === topicId);
    if (index !== -1 && topic.name) {
        db.topics[index].name = topic.name;
        saveDb();
    }
});


function getTaskKeyboard(task, userId) {
    const region = DISTRICT_ADMINS[userId];
    const isSeen = region && task.seen_regions.some(r => r.region === region);
    const seenBtn = Markup.button.callback(`${isSeen ? "🟢" : "🔴"} TANISHDIM`, `seen_${task.id}`);
    const buttons = [seenBtn];
    if (task.is_exec_required) buttons.push(Markup.button.callback("✅ Bajarildi", `done_${task.id}`));
    return Markup.inlineKeyboard([buttons]);
}

async function updateMonitoring(task) {
    const isExec = task.is_exec_required;
    const header = isExec ? "<code> № HUDUD              | T | I </code>\n" : "<code> № HUDUD              | T </code>\n";
    
    let text = `📊 <b>IJRO MONITORINGI:</b>\n${task.emoji_id}\n\n` + header;
    text += HUDUD_KEYWORDS.map((h, i) => {
        const num = String(i + 1).padStart(2, ' ');
        const paddedName = h.padEnd(18, ' ');
        const hasSeen = task.seen_regions.some(r => r.region === h);
        const seenIcon = hasSeen ? "✅" : "❌";
        
        if (isExec) {
            const hasExec = task.completed_regions.some(r => r.region === h);
            const execIcon = hasExec ? "🗂" : "⛔";
            return `<code>${num}. ${paddedName}: ${seenIcon} | ${execIcon}</code>`;
        }
        return `<code>${num}. ${paddedName}: ${seenIcon}</code>`;
    }).join('\n');
    
    text += `\n\n🕒 Live: ${moment().format("HH:mm:ss")}`;
    
    try { 
        await bot.telegram.editMessageText(GROUP_ID, task.monitoring_msg_id, null, text, { parse_mode: 'HTML' }); 
    } catch (e) {}
}

server.listen(PORT, () => console.log(`🚀 EXECUTIVE SERVER ONLINE ON PORT ${PORT}`));

bot.launch().then(() => {
    console.log("🤖 BOT POLLING STARTED");
}).catch(err => {
    console.error("❌ BOT LAUNCH ERROR (Conflict with Render?):", err.message);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
