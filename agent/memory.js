const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', 'memory', 'conversations');
const MAX_CONTEXT_MESSAGES = 10; // Last 10 messages
const MAX_MEMORY_PER_CHAT = 1000; // Max messages to store per chat

// Ensure memory directory exists
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

// Get memory file path for a chat
function getMemoryPath(chatId) {
  return path.join(MEMORY_DIR, `${chatId}.jsonl`);
}

// Add a message to memory
function addToMemory(chatId, role, content, model = null) {
  const memoryPath = getMemoryPath(chatId);
  const entry = {
    timestamp: new Date().toISOString(),
    role: role, // 'user' or 'assistant'
    content: content,
    model: model || 'unknown'
  };
  
  // Append to file
  fs.appendFileSync(memoryPath, JSON.stringify(entry) + '\n');
  
  // Trim old messages if too many
  trimOldMessages(chatId);
}

// Get recent conversation context
function getContext(chatId, limit = MAX_CONTEXT_MESSAGES) {
  const memoryPath = getMemoryPath(chatId);
  
  if (!fs.existsSync(memoryPath)) {
    return [];
  }
  
  // Read all lines
  const lines = fs.readFileSync(memoryPath, 'utf8')
    .trim()
    .split('\n')
    .filter(line => line.length > 0);
  
  // Parse and get last N messages
  const messages = lines
    .slice(-limit)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(msg => msg !== null);
  
  return messages;
}

// Format context for AI prompt
function formatContext(messages) {
  if (messages.length === 0) {
    return '';
  }
  
  let context = '\n\n--- Previous Conversation ---\n';
  messages.forEach(msg => {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    context += `${role}: ${msg.content}\n`;
  });
  context += '--- End of Context ---\n\n';
  
  return context;
}

// Get context as messages array for Claude/API
function getContextMessages(chatId, limit = MAX_CONTEXT_MESSAGES) {
  const messages = getContext(chatId, limit);
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

// Trim old messages to prevent file bloat
function trimOldMessages(chatId) {
  const memoryPath = getMemoryPath(chatId);
  
  if (!fs.existsSync(memoryPath)) {
    return;
  }
  
  const lines = fs.readFileSync(memoryPath, 'utf8')
    .trim()
    .split('\n')
    .filter(line => line.length > 0);
  
  if (lines.length > MAX_MEMORY_PER_CHAT) {
    // Keep only the last MAX_MEMORY_PER_CHAT messages
    const recentLines = lines.slice(-MAX_MEMORY_PER_CHAT);
    fs.writeFileSync(memoryPath, recentLines.join('\n') + '\n');
  }
}

// Clear memory for a chat
function clearMemory(chatId) {
  const memoryPath = getMemoryPath(chatId);
  if (fs.existsSync(memoryPath)) {
    fs.unlinkSync(memoryPath);
    return true;
  }
  return false;
}

// Get memory stats
function getMemoryStats(chatId) {
  const memoryPath = getMemoryPath(chatId);
  
  if (!fs.existsSync(memoryPath)) {
    return { messageCount: 0, fileSize: 0 };
  }
  
  const stats = fs.statSync(memoryPath);
  const lines = fs.readFileSync(memoryPath, 'utf8')
    .trim()
    .split('\n')
    .filter(line => line.length > 0);
  
  return {
    messageCount: lines.length,
    fileSize: stats.size
  };
}

module.exports = {
  addToMemory,
  getContext,
  formatContext,
  getContextMessages,
  clearMemory,
  getMemoryStats,
  MAX_CONTEXT_MESSAGES
};
