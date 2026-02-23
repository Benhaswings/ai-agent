const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

console.log('Bot started! Send any message to get your chat ID...');

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  
  console.log(`\n=== Message received ===`);
  console.log(`From: ${username}`);
  console.log(`Chat ID: ${chatId}`);
  console.log(`Text: ${msg.text}`);
  console.log('=======================\n');
  
  bot.sendMessage(chatId, `Your Chat ID is: ${chatId}\n\nAdd this to your .env file:\nexport TELEGRAM_CHAT_ID=${chatId}`);
  
  console.log('Got chat ID! You can stop this script now (Ctrl+C)');
});

// Also log when bot starts
bot.getMe().then((botInfo) => {
  console.log(`Bot connected: @${botInfo.username}`);
}).catch((err) => {
  console.error('Failed to connect bot:', err.message);
  process.exit(1);
});
