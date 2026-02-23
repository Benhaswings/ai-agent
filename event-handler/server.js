const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'YOURNAME/github-agent';

// Telegram notifications
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
let bot = null;

if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
  try {
    const TelegramBot = require('node-telegram-bot-api');
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
    console.log('✅ Telegram notifications enabled');
  } catch (e) {
    console.log('⚠️ Telegram bot not available:', e.message);
  }
}

function notifyTelegram(message) {
  if (bot && TELEGRAM_CHAT_ID) {
    bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' })
      .catch(err => console.error('Telegram error:', err.message));
  }
}

// Create a new job
app.post('/job', async (req, res) => {
  const { type, prompt, model, priority } = req.body;
  
  if (!type || !prompt) {
    return res.status(400).json({ error: 'Missing type or prompt' });
  }
  
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const job = {
    id: jobId,
    type,
    prompt,
    model: model || 'llama3.2',
    priority: priority || 'normal',
    createdAt: new Date().toISOString(),
    status: 'pending'
  };
  
  // Save job file
  const jobPath = path.join(__dirname, '..', 'jobs', 'pending', `${jobId}.json`);
  fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));
  
  // Git commit and push
  try {
    execSync('git add jobs/pending/');
    execSync(`git commit -m "New job: ${jobId}"`);
    execSync('git push');
    
    // Notify Telegram
    notifyTelegram(`🤖 *New Job Submitted*\n\nType: ${type}\nPrompt: ${prompt.substring(0, 100)}...\n\nJob ID: \`${jobId}\``);
    
    res.json({ 
      success: true, 
      jobId, 
      status: 'queued',
      url: `https://github.com/${REPO}/actions`
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to queue job', 
      details: error.message 
    });
  }
});

// Check job status
app.get('/job/:id', (req, res) => {
  const jobId = req.params.id;
  
  // Check all directories
  const dirs = ['pending', 'processing', 'completed', 'failed'];
  for (const dir of dirs) {
    const jobPath = path.join(__dirname, '..', 'jobs', dir, `${jobId}.json`);
    if (fs.existsSync(jobPath)) {
      const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
      return res.json(job);
    }
  }
  
  res.status(404).json({ error: 'Job not found' });
});

// List recent jobs
app.get('/jobs', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const jobs = [];
  
  const dirs = ['completed', 'failed', 'processing', 'pending'];
  for (const dir of dirs) {
    const dirPath = path.join(__dirname, '..', 'jobs', dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const job = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
          return { ...job, location: dir };
        });
      jobs.push(...files);
    }
  }
  
  jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(jobs.slice(0, limit));
});

// Web UI
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>GitHub Agent</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    textarea { width: 100%; height: 100px; margin: 10px 0; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
    button:hover { background: #0055aa; }
    .job { border: 1px solid #ddd; padding: 10px; margin: 10px 0; border-radius: 4px; }
    .pending { border-left: 4px solid #ff9800; }
    .completed { border-left: 4px solid #4caf50; }
    .failed { border-left: 4px solid #f44336; }
  </style>
</head>
<body>
  <h1>🤖 GitHub Agent</h1>
  
  <h2>New Task</h2>
  <select id="type">
    <option value="chat">Chat</option>
    <option value="code">Code</option>
    <option value="research">Research</option>
  </select>
  <textarea id="prompt" placeholder="Enter your request..."></textarea>
  <button onclick="submitJob()">Submit Job</button>
  
  <h2>Recent Jobs</h2>
  <div id="jobs">Loading...</div>
  
  <script>
    async function submitJob() {
      const type = document.getElementById('type').value;
      const prompt = document.getElementById('prompt').value;
      
      const res = await fetch('/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, prompt })
      });
      
      const data = await res.json();
      if (data.success) {
        alert('Job queued! ID: ' + data.jobId);
        loadJobs();
      } else {
        alert('Error: ' + data.error);
      }
    }
    
    async function loadJobs() {
      const res = await fetch('/jobs?limit=10');
      const jobs = await res.json();
      
      const html = jobs.map(j => \`
        <div class="job \${j.location}">
          <strong>\${j.type}</strong> - \${j.location}
          <br><small>\${j.id}</small>
          <br>\${j.prompt.substring(0, 100)}...
          \${j.result ? '<br><pre>' + j.result.substring(0, 200) + '...</pre>' : ''}
        </div>
      \`).join('');
      
      document.getElementById('jobs').innerHTML = html || 'No jobs yet';
    }
    
    loadJobs();
    setInterval(loadJobs, 5000);
  </script>
</body>
</html>
  `);
});

// Telegram message handler (two-way communication)
if (bot && TELEGRAM_CHAT_ID) {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Only respond to configured chat
    if (chatId.toString() !== TELEGRAM_CHAT_ID) {
      bot.sendMessage(chatId, '⛔ Unauthorized');
      return;
    }
    
    // Skip commands for now
    if (text.startsWith('/')) return;
    
    // Create job from message
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const job = {
      id: jobId,
      type: 'chat',
      prompt: text,
      model: 'llama3.2',
      source: 'telegram',
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    
    // Save job
    const jobPath = path.join(__dirname, '..', 'jobs', 'pending', `${jobId}.json`);
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));
    
    // Git commit and push
    try {
      execSync('git add jobs/pending/');
      execSync(`git commit -m "Telegram job: ${jobId}"`);
      execSync('git push');
      
      bot.sendMessage(chatId, `🤖 *Job Queued*\n\nProcessing: "${text.substring(0, 50)}..."\n\nJob ID: \`${jobId}\``, { parse_mode: 'Markdown' });
    } catch (error) {
      bot.sendMessage(chatId, `❌ Failed to queue: ${error.message}`);
    }
  });
  
  console.log('✅ Telegram two-way messaging enabled');
}

// Telegram notification endpoint (for agent to call)
app.post('/notify', (req, res) => {
  const { message, jobId, status } = req.body;
  
  let emoji = '🤖';
  if (status === 'completed') emoji = '✅';
  if (status === 'failed') emoji = '❌';
  
  const fullMessage = `${emoji} *Job ${status || 'Update'}*\n\n${message || ''}\n\nJob ID: \`${jobId || 'unknown'}\``;
  notifyTelegram(fullMessage);
  
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Event handler running on http://localhost:${PORT}`);
  console.log(`GitHub repo: ${REPO}`);
  if (bot) {
    console.log(`Telegram bot: @KiloZuluLoboBot`);
  }
});
