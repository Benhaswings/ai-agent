const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { webSearch } = require('./websearch');

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
    
    // Notify failure - just the error
    notifyTelegram(`Error: ${error.message}`);
    
    process.exit(1);
  }
}

async function handleChat(job) {
  // LOCAL ONLY - No paid APIs
  // If someone tries to use paid models, default to local llama3.2
  if (job.model === 'claude' || job.model === 'nvidia') {
    console.log(`Model ${job.model} requested but using local llama3.2 instead (no paid APIs)`);
    job.model = 'llama3.2';
  }
  
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

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return 'Error: Claude API key not configured. Please set ANTHROPIC_API_KEY in .env';
  }
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }
    
    const data = await response.json();
    return data.content[0].text;
  } catch (e) {
    console.error('Claude API error:', e.message);
    return `Error calling Claude: ${e.message}`;
  }
}

async function callNVIDIA(prompt) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return 'Error: NVIDIA API key not configured. Please set NVIDIA_API_KEY in .env';
  }
  
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'meta/llama-3.1-405b-instruct',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 4096
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NVIDIA API error: ${error}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e) {
    console.error('NVIDIA API error:', e.message);
    return `Error calling NVIDIA: ${e.message}`;
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
  // Web search + AI summary
  console.log(`Searching web for: ${job.prompt}`);
  const searchResults = await webSearch(job.prompt, 5);
  
  console.log('Search complete, summarizing with AI...');
  
  // Have AI summarize the search results
  const summaryPrompt = `You are a helpful research assistant. Based on the following web search results, provide a comprehensive answer to the user's question.

User's Question: "${job.prompt}"

Web Search Results:
${searchResults}

Instructions:
- Synthesize the information from the search results
- Provide a clear, accurate answer
- Cite sources when possible (mention which result number)
- If results are insufficient, say so honestly
- Keep your response concise but informative

Your Answer:`;

  return handleChat({ ...job, prompt: summaryPrompt });
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
