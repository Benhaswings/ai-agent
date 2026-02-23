const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Telegram notification setup
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
let bot = null;

if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
  try {
    const TelegramBot = require('node-telegram-bot-api');
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
  } catch (e) {
    // Bot module not available, will use fallback
  }
}

function notifyTelegram(message) {
  if (bot && TELEGRAM_CHAT_ID) {
    bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' })
      .catch(err => console.error('Telegram error:', err.message));
  }
}

// Load job
const JOB_ID = process.argv[2];
if (!JOB_ID) {
  console.error('Usage: node run.js <job_id>');
  process.exit(1);
}

const jobPath = path.join(__dirname, '..', 'jobs', 'processing', `${JOB_ID}.json`);
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));

console.log(`Processing job: ${JOB_ID}`);
console.log(`Type: ${job.type}`);
console.log(`Prompt: ${job.prompt}`);

// Agent capabilities
async function runAgent() {
  const startTime = Date.now();
  
  try {
    let result;
    
    switch (job.type) {
      case 'chat':
        result = await handleChat(job);
        break;
      case 'code':
        result = await handleCode(job);
        break;
      case 'research':
        result = await handleResearch(job);
        break;
      case 'file':
        result = await handleFileOp(job);
        break;
      default:
        result = await handleGeneric(job);
    }
    
    // Save result
    const completedJob = {
      ...job,
      result,
      status: 'completed',
      completedAt: new Date().toISOString(),
      duration: Date.now() - startTime
    };
    
    // Write to completed
    const completedPath = path.join(__dirname, '..', 'jobs', 'completed', `${JOB_ID}.json`);
    fs.writeFileSync(completedPath, JSON.stringify(completedJob, null, 2));
    
    // Move original to completed (delete from processing)
    fs.unlinkSync(jobPath);
    
    // Update memory
    updateMemory(job, result);
    
    console.log(`Job completed: ${JOB_ID}`);
    console.log(`Duration: ${completedJob.duration}ms`);
    
    // Notify completion - clean response
    const resultPreview = typeof result === 'string' ? result : 'Complex result';
    notifyTelegram(resultPreview);
    
  } catch (error) {
    console.error(`Job failed: ${JOB_ID}`, error);
    
    const failedJob = {
      ...job,
      error: error.message,
      status: 'failed',
      failedAt: new Date().toISOString()
    };
    
    const failedPath = path.join(__dirname, '..', 'jobs', 'failed', `${JOB_ID}.json`);
    fs.writeFileSync(failedPath, JSON.stringify(failedJob, null, 2));
    fs.unlinkSync(jobPath);
    
    // Notify failure
    notifyTelegram(`❌ *Job Failed*\n\nType: ${job.type}\nError: ${error.message.substring(0, 100)}\n\nJob ID: \`${JOB_ID}\``);
    
    process.exit(1);
  }
}

async function handleChat(job) {
  // Try Ollama first, fallback to API
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  
  try {
    const response = await fetch(`${ollamaHost}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: job.model || 'llama3.2',
        prompt: job.prompt,
        stream: false
      })
    });
    
    const data = await response.json();
    return data.response;
  } catch (e) {
    // Fallback: return a placeholder if Ollama not available
    return `[Ollama not available at ${ollamaHost}]\n\nPrompt was: ${job.prompt}`;
  }
}

async function handleCode(job) {
  // Code generation task
  const chatResult = await handleChat({
    ...job,
    prompt: `Write code for: ${job.prompt}\n\nRequirements:\n- Include comments\n- Follow best practices\n- Provide usage example`
  });
  
  // Optionally save code to a file
  if (job.saveTo) {
    const codePath = path.join(__dirname, '..', job.saveTo);
    fs.mkdirSync(path.dirname(codePath), { recursive: true });
    fs.writeFileSync(codePath, chatResult);
  }
  
  return chatResult;
}

async function handleResearch(job) {
  // Research task - would integrate with web search
  return `Research task: ${job.prompt}\n\n[Web search integration would go here]`;
}

async function handleFileOp(job) {
  // File operations
  return `File operation: ${job.prompt}`;
}

async function handleGeneric(job) {
  return handleChat(job);
}

function updateMemory(job, result) {
  const memoryPath = path.join(__dirname, '..', 'memory', 'conversations.jsonl');
  const entry = {
    timestamp: new Date().toISOString(),
    jobId: JOB_ID,
    type: job.type,
    prompt: job.prompt.substring(0, 200), // Truncate
    result: typeof result === 'string' ? result.substring(0, 500) : 'Complex result'
  };
  
  fs.appendFileSync(memoryPath, JSON.stringify(entry) + '\n');
}

runAgent();
