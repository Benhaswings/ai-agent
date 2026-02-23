const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { subscribe, unsubscribe, listSubscriptions, checkAllFeeds } = require('./agent/rss');
const { checkDHSRSS, manualCheck, DHS_CHANNEL } = require('./agent/dhs-rss');

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
    
    // Start RSS checker (check every 5 minutes)
    setInterval(() => {
      if (bot) {
        checkAllFeeds(bot, TELEGRAM_CHAT_ID).catch(console.error);
      }
    }, 5 * 60 * 1000);
    console.log('✅ RSS feed checker started (checking every 5 minutes)');
    
    // Start DHS RSS checker (check 8 times a day: every 3 hours)
    const checkDHS = () => {
      if (bot) {
        checkDHSRSS(bot).catch(console.error);
      }
    };
    
    // Check every 3 hours (8 times a day)
    setInterval(checkDHS, 3 * 60 * 60 * 1000);
    console.log('✅ DHS RSS checker started (checking every 3 hours - 8x daily)');
    
    // Initial check after 1 minute
    setTimeout(checkDHS, 60000);
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
    
    // Optional: Notify job queued (comment out to disable)
    // notifyTelegram(`⏳ Processing: ${prompt.substring(0, 80)}...`);
    
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
      <select id="model" style="margin-bottom: 8px;">
        <option value="llama3.2">🦙 Llama 3.2 (Balanced)</option>
        <option value="llama3.2:1b">⚡ Llama 3.2 1B (Fast)</option>
        <option value="phi3:mini">💻 Phi-3 Mini (Coding)</option>
        <option value="qwen2.5:3b">🧠 Qwen 2.5 (Reasoning)</option>
        <option value="tinyllama">🔥 TinyLlama (Lightning)</option>
      </select>
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
      const model = document.getElementById('model').value;
      
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
          body: JSON.stringify({ type, prompt: text, model })
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

// User model preferences (in-memory, per session)
const userModels = {};

// Load available models
const configPath = path.join(__dirname, '..', 'config', 'agent.json');
let availableModels = [];
try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  availableModels = config.models || [];
} catch (e) {
  console.error('Failed to load models config:', e.message);
}

// Telegram message handler (two-way communication)
if (bot && TELEGRAM_CHAT_ID) {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    
    // Only respond to configured chat
    if (chatId.toString() !== TELEGRAM_CHAT_ID) {
      bot.sendMessage(chatId, '⛔ Unauthorized');
      return;
    }
    
    // Handle commands
    if (text.startsWith('/')) {
      const command = text.split(' ')[0].toLowerCase();
      
      switch (command) {
        case '/models':
        case '/model':
          const modelList = availableModels.map(m => 
            `• ${m.name} - ${m.description}\n  Speed: ${m.speed} | Size: ${m.size}`
          ).join('\n\n');
          bot.sendMessage(chatId, `🤖 *Available Models*\n\n${modelList}\n\nUse /model <name> to switch\nExample: /model phi3:mini`, { parse_mode: 'Markdown' });
          return;
          
        case '/fast':
          userModels[chatId] = 'llama3.2:1b';
          bot.sendMessage(chatId, '⚡ Switched to fast mode (llama3.2:1b)');
          return;
          
        case '/code':
          userModels[chatId] = 'phi3:mini';
          bot.sendMessage(chatId, '💻 Switched to coding mode (phi3:mini)');
          return;
          
        case '/smart':
          userModels[chatId] = 'qwen2.5:3b';
          bot.sendMessage(chatId, '🧠 Switched to reasoning mode (qwen2.5:3b)');
          return;
          
        case '/tiny':
          userModels[chatId] = 'tinyllama';
          bot.sendMessage(chatId, '⚡ Switched to lightning mode (tinyllama)');
          return;
          
        case '/default':
          delete userModels[chatId];
          bot.sendMessage(chatId, '✅ Reset to default model (llama3.2)');
          return;
          
        case '/menu':
        case '/start':
          const currentModel = userModels[chatId] || 'llama3.2';
          const modelInfo = availableModels.find(m => m.id === currentModel);
          
          bot.sendMessage(chatId, 
            `🤖 *GitHub Agent Menu*\n\n` +
            `Current Model: ${modelInfo ? modelInfo.name : currentModel}\n\n` +
            `*Quick Actions:*`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '⚡ Fast', callback_data: 'model:llama3.2:1b' },
                    { text: '💻 Code', callback_data: 'model:phi3:mini' },
                    { text: '🧠 Smart', callback_data: 'model:qwen2.5:3b' }
                  ],
                  [
                    { text: '🔥 Tiny', callback_data: 'model:tinyllama' },
                    { text: '🦙 Default', callback_data: 'model:llama3.2' }
                  ],
                  [
                    { text: '🔍 Web Search', callback_data: 'action:search' },
                    { text: '📋 All Models', callback_data: 'action:models' }
                  ],
                  [
                    { text: '📰 RSS Feeds', callback_data: 'action:rss' },
                    { text: '❓ Help', callback_data: 'action:help' }
                  ]
                ]
              }
            }
          );
          return;
          
        case '/help':
          bot.sendMessage(chatId, 
            `🤖 *GitHub Agent Commands*\n\n` +
            `*Quick Commands:*\n` +
            `/menu - Show interactive menu\n` +
            `/models - List all models\n\n` +
            `*Model Selection:*\n` +
            `/fast - Use fast model (1B)\n` +
            `/code - Use coding model (phi3)\n` +
            `/smart - Use reasoning model (qwen)\n` +
            `/tiny - Use lightning fast model\n` +
            `/default - Reset to default\n\n` +
            `*Web Search:*\n` +
            `/search <query> - Search the web\n` +
            `Example: /search latest AI news\n\n` +
            `*RSS Feeds:*\n` +
            `/rss <url> - Subscribe to RSS feed\n` +
            `/rsslist - List your subscriptions\n` +
            `/unrss <number> - Unsubscribe from feed\n` +
            `/dhs - Check DHS press releases manually\n\n` +
            `Just type any message to chat!`,
            { parse_mode: 'Markdown' }
          );
          return;
      }
      
      // Handle /model <name> 
      if (command === '/model' && text.split(' ').length > 1) {
        const requestedModel = text.split(' ')[1].trim();
        const modelExists = availableModels.find(m => m.id === requestedModel);
        if (modelExists) {
          userModels[chatId] = requestedModel;
          bot.sendMessage(chatId, `✅ Switched to ${modelExists.name}`);
        } else {
          bot.sendMessage(chatId, `❌ Model not found: ${requestedModel}\nUse /models to see available models`);
        }
        return;
      }
      
      // Search command
      if ((command === '/search' || command === '/web') && text.split(' ').length > 1) {
        const searchQuery = text.replace(/^\/\w+\s*/, '').trim();
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const job = {
          id: jobId,
          type: 'research',
          prompt: searchQuery,
          model: userModels[chatId] || 'llama3.2',
          source: 'telegram',
          createdAt: new Date().toISOString(),
          status: 'pending'
        };
        
        const jobPath = path.join(__dirname, '..', 'jobs', 'pending', `${jobId}.json`);
        fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));
        
        try {
          execSync('git add jobs/pending/');
          execSync(`git commit -m "Search job: ${jobId}"`);
          execSync('git push');
          bot.sendMessage(chatId, `🔍 Searching: "${searchQuery.substring(0, 50)}${searchQuery.length > 50 ? '...' : ''}"`, { parse_mode: 'Markdown' });
        } catch (error) {
          bot.sendMessage(chatId, `❌ Failed: ${error.message}`);
        }
        return;
      }
      
      // RSS Commands
      if (command === '/rss' && text.split(' ').length > 1) {
        const url = text.replace(/^\/\w+\s*/, '').trim();
        bot.sendMessage(chatId, '📰 Subscribing to RSS feed...');
        
        subscribe(chatId, url).then(result => {
          bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        }).catch(err => {
          bot.sendMessage(chatId, `❌ Error: ${err.message}`);
        });
        return;
      }
      
      if (command === '/rsslist') {
        const result = listSubscriptions(chatId);
        bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        return;
      }
      
      if (command === '/unrss' && text.split(' ').length > 1) {
        const index = parseInt(text.split(' ')[1]) - 1;
        if (isNaN(index)) {
          bot.sendMessage(chatId, '❌ Usage: /unrss <number>\nExample: /unrss 1');
          return;
        }
        
        const result = unsubscribe(chatId, index);
        bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        return;
      }
      
      // DHS RSS command
      if (command === '/dhs') {
        manualCheck(bot, chatId);
        return;
      }
      
      // Unknown command
      if (command !== '/start') {
        bot.sendMessage(chatId, '❓ Unknown command. Use /help for available commands');
        return;
      }
    }
    
    // Get user's preferred model or default
    const selectedModel = userModels[chatId] || 'llama3.2';
    
    // Create job from message
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const job = {
      id: jobId,
      type: 'chat',
      prompt: text,
      model: selectedModel,
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
      
      // No "Job Queued" message - just wait for AI response
    } catch (error) {
      bot.sendMessage(chatId, `❌ Failed to queue: ${error.message}`);
    }
  });
  
  // Handle inline keyboard callbacks
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    // Answer the callback to remove loading state
    bot.answerCallbackQuery(query.id);
    
    if (data.startsWith('model:')) {
      const modelId = data.replace('model:', '');
      const modelInfo = availableModels.find(m => m.id === modelId);
      
      if (modelInfo) {
        userModels[chatId] = modelId;
        bot.sendMessage(chatId, `✅ Switched to *${modelInfo.name}*\n\n${modelInfo.description}`, { parse_mode: 'Markdown' });
      }
    } else if (data === 'action:search') {
      bot.sendMessage(chatId, 
        `🔍 *Web Search*\n\n` +
        `Type your search query:\n` +
        `/search <your question>`,
        { parse_mode: 'Markdown' }
      );
    } else if (data === 'action:models') {
      const modelList = availableModels.map(m => 
        `• *${m.name}*\n  ${m.description}\n  Speed: ${m.speed}`
      ).join('\n\n');
      bot.sendMessage(chatId, `🤖 *Available Models*\n\n${modelList}\n\nUse /model <name> to switch`, { parse_mode: 'Markdown' });
    } else if (data === 'action:help') {
      bot.sendMessage(chatId, 
        `🤖 *Quick Help*\n\n` +
        `*Menu:* /menu\n` +
        `*Models:* /models\n` +
        `*Search:* /search <query>\n\n` +
        `Just type any message to chat with AI!`,
        { parse_mode: 'Markdown' }
      );
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
