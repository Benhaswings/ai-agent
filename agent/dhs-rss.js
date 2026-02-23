const fs = require('fs');
const path = require('path');
const https = require('https');

const RSS_FILE = path.join(__dirname, '..', 'config', 'dhs_rss_state.json');
const DHS_RSS_URL = 'https://www.dhs.gov/rss.xml';
const DHS_CHANNEL = '@dhsrss'; // Telegram channel to post to

// Load RSS state (tracks last posted item)
function loadRSSState() {
  try {
    if (fs.existsSync(RSS_FILE)) {
      return JSON.parse(fs.readFileSync(RSS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading RSS state:', e.message);
  }
  return { lastGuid: null, lastCheck: null };
}

// Save RSS state
function saveRSSState(state) {
  try {
    fs.mkdirSync(path.dirname(RSS_FILE), { recursive: true });
    fs.writeFileSync(RSS_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Error saving RSS state:', e.message);
  }
}

// Fetch RSS feed
async function fetchRSS(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const req = https.request(options, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => reject(new Error('Timeout')));
    req.end();
  });
}

// Parse RSS feed
function parseRSS(xmlData) {
  try {
    // Simple regex-based parsing for RSS 2.0
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xmlData)) !== null) {
      const itemContent = match[1];
      
      const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
      const descMatch = itemContent.match(/<description>([\s\S]*?)<\/description>/);
      const guidMatch = itemContent.match(/<guid>([\s\S]*?)<\/guid>/);
      const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      
      if (titleMatch && linkMatch) {
        items.push({
          title: titleMatch[1].trim().replace(/<![CDATA[|]]>/g, ''),
          link: linkMatch[1].trim(),
          description: descMatch ? descMatch[1].trim().replace(/<![CDATA[|]]>/g, '').replace(/<[^>]+>/g, '').substring(0, 200) : '',
          guid: guidMatch ? guidMatch[1].trim() : linkMatch[1].trim(),
          pubDate: pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString()
        });
      }
    }
    
    return items;
  } catch (e) {
    console.error('Parse error:', e.message);
    return [];
  }
}

// Check DHS RSS and post new items to channel
async function checkDHSRSS(bot) {
  try {
    console.log('Checking DHS RSS feed...');
    const xmlData = await fetchRSS(DHS_RSS_URL);
    const items = parseRSS(xmlData);
    
    if (items.length === 0) {
      console.log('No items found in RSS feed');
      return;
    }
    
    const state = loadRSSState();
    const newItems = [];
    
    // Find new items (not seen before)
    for (const item of items) {
      if (item.guid === state.lastGuid) {
        break; // Stop at first seen item
      }
      newItems.push(item);
    }
    
    if (newItems.length === 0) {
      console.log('No new DHS articles');
      return;
    }
    
    console.log(`Found ${newItems.length} new DHS articles`);
    
    // Post new items to channel (oldest first)
    for (let i = newItems.length - 1; i >= 0; i--) {
      const item = newItems[i];
      const message = `📰 *DHS Press Release*\n\n*${item.title}*\n\n${item.description}${item.description.length >= 200 ? '...' : ''}\n\n[Read full article](${item.link})`;
      
      try {
        await bot.sendMessage(DHS_CHANNEL, message, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: false
        });
        console.log(`Posted: ${item.title}`);
        
        // Wait 2 seconds between posts to avoid rate limits
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (err) {
        console.error(`Failed to post to ${DHS_CHANNEL}:`, err.message);
      }
    }
    
    // Update state with the newest item
    state.lastGuid = items[0].guid;
    state.lastCheck = new Date().toISOString();
    saveRSSState(state);
    
  } catch (error) {
    console.error('Error checking DHS RSS:', error.message);
  }
}

// Manual check command handler
async function manualCheck(bot, chatId) {
  bot.sendMessage(chatId, '🔍 Checking DHS RSS feed...');
  await checkDHSRSS(bot);
  bot.sendMessage(chatId, '✅ Check complete!');
}

module.exports = {
  checkDHSRSS,
  manualCheck,
  DHS_CHANNEL
};
