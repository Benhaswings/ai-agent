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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🤖 GitHub Agent Chat</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: #f5f5f5; 
      height: 100vh; 
      display: flex; 
      flex-direction: column;
    }
    .header { 
      background: #0066cc; 
      color: white; 
      padding: 15px 20px; 
      display: flex; 
      align-items: center; 
      gap: 10px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .header h1 { font-size: 1.2rem; font-weight: 600; }
    .status { 
      margin-left: auto; 
      font-size: 0.8rem; 
      padding: 4px 10px; 
      background: rgba(255,255,255,0.2); 
      border-radius: 12px;
    }
    .chat-container { 
      flex: 1; 
      overflow-y: auto; 
      padding: 20px; 
      display: flex; 
      flex-direction: column; 
      gap: 15px;
    }
    .message { 
      max-width: 85%; 
      padding: 12px 16px; 
      border-radius: 18px; 
      word-wrap: break-word;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .message.user { 
      align-self: flex-end; 
      background: #0066cc; 
      color: white; 
      border-bottom-right-radius: 4px;
    }
    .message.ai { 
      align-self: flex-start; 
      background: white; 
      color: #333; 
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .message.system {
      align-self: center;
      background: #ff9800;
      color: white;
      font-size: 0.85rem;
      padding: 8px 16px;
    }
    .message.error {
      align-self: center;
      background: #f44336;
      color: white;
    }
    .message-header {
      font-size: 0.75rem;
      opacity: 0.7;
      margin-bottom: 4px;
    }
    .message-content {
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .message-content code {
      background: rgba(0,0,0,0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    .message-content pre {
      background: rgba(0,0,0,0.05);
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      margin-top: 8px;
      font-family: 'Courier New', monospace;
      font-size: 0.85rem;
    }
    .input-container { 
      background: white; 
      padding: 15px 20px; 
      border-top: 1px solid #e0e0e0;
      display: flex; 
      gap: 10px;
      align-items: flex-end;
    }
    .input-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    select {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 0.9rem;
      background: white;
    }
    textarea { 
      flex: 1; 
      padding: 12px 16px; 
      border: 1px solid #ddd; 
      border-radius: 20px; 
      resize: none;
      font-size: 1rem;
      font-family: inherit;
      min-height: 44px;
      max-height: 150px;
    }
    textarea:focus {
      outline: none;
      border-color: #0066cc;
    }
    button { 
      padding: 12px 24px; 
      background: #0066cc; 
      color: white; 
      border: none; 
      border-radius: 20px; 
      cursor: pointer; 
      font-size: 1rem;
      font-weight: 500;
      transition: background 0.2s;
    }
    button:hover { background: #0055aa; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .typing {
      display: flex;
      gap: 4px;
      padding: 12px 16px;
      align-self: flex-start;
    }
    .typing span {
      width: 8px;
      height: 8px;
      background: #999;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out;
    }
    .typing span:nth-child(1) { animation-delay: 0s; }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0.6); }
      40% { transform: scale(1); }
    }
    @media (max-width: 600px) {
      .message { max-width: 90%; }
      .header h1 { font-size: 1rem; }
    }
  </style>
</head>
<body>
  <div class="header">
    <span>🤖</span>
    <h1>GitHub Agent</h1>
    <span class="status" id="status">Online</span>
  </div>
  
  <div class="chat-container" id="chat"></div>
  
  <div class="input-container">
    <div class="input-wrapper">
      <select id="type">
        <option value="chat">💬 Chat</option>
        <option value="code">💻 Code</option>
        <option value="research">🔍 Research</option>
      </select>
      <textarea id="prompt" placeholder="Type your message..." rows="1"></textarea>
    </div>
    <button onclick="submitJob()" id="sendBtn">Send</button>
  </div>
  
  <script>
    const chat = document.getElementById('chat');
    const prompt = document.getElementById('prompt');
    const sendBtn = document.getElementById('sendBtn');
    
    // Auto-resize textarea
    prompt.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    });
    
    // Send on Enter (Shift+Enter for new line)
    prompt.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitJob();
      }
    });
    
    function addMessage(content, type, header = '') {
      const div = document.createElement('div');
      div.className = 'message ' + type;
      if (header) {
        div.innerHTML = '<div class="message-header">' + header + '</div>';
      }
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.textContent = content;
      div.appendChild(contentDiv);
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }
    
    function showTyping() {
      const div = document.createElement('div');
      div.className = 'typing';
      div.id = 'typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }
    
    function hideTyping() {
      const typing = document.getElementById('typing');
      if (typing) typing.remove();
    }
    
    async function submitJob() {
      const text = prompt.value.trim();
      if (!text) return;
      
      const type = document.getElementById('type').value;
      
      // Add user message
      addMessage(text, 'user');
      prompt.value = '';
      prompt.style.height = 'auto';
      sendBtn.disabled = true;
      
      // Show typing indicator
      showTyping();
      
      try {
        const res = await fetch('/job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, prompt: text })
        });
        
        const data = await res.json();
        
        if (data.success) {
          // Poll for result
          pollForResult(data.jobId);
        } else {
          hideTyping();
          addMessage('Error: ' + data.error, 'error');
          sendBtn.disabled = false;
        }
      } catch (err) {
        hideTyping();
        addMessage('Error: ' + err.message, 'error');
        sendBtn.disabled = false;
      }
    }
    
    async function pollForResult(jobId) {
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes max
      
      const check = async () => {
        attempts++;
        
        try {
          const res = await fetch('/job/' + jobId);
          const job = await res.json();
          
          if (job.status === 'completed') {
            hideTyping();
            addMessage(job.result, 'ai');
            sendBtn.disabled = false;
            return;
          } else if (job.status === 'failed') {
            hideTyping();
            addMessage('Failed: ' + (job.error || 'Unknown error'), 'error');
            sendBtn.disabled = false;
            return;
          }
          
          if (attempts < maxAttempts) {
            setTimeout(check, 2000);
          } else {
            hideTyping();
            addMessage('Request timed out. Check back later.', 'error');
            sendBtn.disabled = false;
          }
        } catch (err) {
          if (attempts < maxAttempts) {
            setTimeout(check, 2000);
          }
        }
      };
      
      check();
    }
    
    // Load chat history
    async function loadHistory() {
      try {
        const res = await fetch('/jobs?limit=20');
        const jobs = await res.json();
        
        // Reverse to show oldest first
        jobs.reverse().forEach(j => {
          addMessage(j.prompt, 'user', new Date(j.createdAt).toLocaleString());
          if (j.result) {
            addMessage(j.result, 'ai');
          } else if (j.status === 'failed') {
            addMessage('Error: ' + (j.error || 'Failed'), 'error');
          }
        });
      } catch (e) {
        console.error('Failed to load history:', e);
      }
    }
    
    loadHistory();
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
