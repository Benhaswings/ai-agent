const fs = require('fs');
const path = require('path');
const https = require('https');
const { XMLParser } = require('fast-xml-parser');

const RSS_FILE = path.join(__dirname, '..', 'config', 'rss_subscriptions.json');

// Load RSS subscriptions
function loadSubscriptions() {
  try {
    if (fs.existsSync(RSS_FILE)) {
      return JSON.parse(fs.readFileSync(RSS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading RSS subscriptions:', e.message);
  }
  return {};
}

// Save RSS subscriptions
function saveSubscriptions(subs) {
  try {
    fs.mkdirSync(path.dirname(RSS_FILE), { recursive: true });
    fs.writeFileSync(RSS_FILE, JSON.stringify(subs, null, 2));
  } catch (e) {
    console.error('Error saving RSS subscriptions:', e.message);
  }
}

// Fetch RSS feed
async function fetchRSS(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => reject(new Error('Timeout')));
    req.end();
  });
}

// Parse RSS feed
function parseRSS(xmlData) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    const result = parser.parse(xmlData);
    
    // Handle RSS 2.0
    if (result.rss && result.rss.channel) {
      const channel = result.rss.channel;
      const items = Array.isArray(channel.item) ? channel.item : [channel.item];
      return {
        title: channel.title || 'Unknown Feed',
        description: channel.description || '',
        items: items.filter(item => item).map(item => ({
          title: item.title || 'No title',
          link: item.link || '',
          description: item.description || '',
          pubDate: item.pubDate || item.pubdate || new Date().toISOString()
        })).slice(0, 5)
      };
    }
    
    // Handle Atom
    if (result.feed) {
      const feed = result.feed;
      const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
      return {
        title: feed.title || 'Unknown Feed',
        description: feed.subtitle || '',
        items: entries.filter(entry => entry).map(entry => ({
          title: entry.title || 'No title',
          link: entry.link?.['@_href'] || entry.link || '',
          description: entry.summary || entry.content || '',
          pubDate: entry.updated || entry.published || new Date().toISOString()
        })).slice(0, 5)
      };
    }
    
    return null;
  } catch (e) {
    console.error('Parse error:', e.message);
    return null;
  }
}

// Subscribe to RSS feed
async function subscribe(chatId, url, name = null) {
  const subs = loadSubscriptions();
  
  if (!subs[chatId]) {
    subs[chatId] = [];
  }
  
  // Check if already subscribed
  if (subs[chatId].find(s => s.url === url)) {
    return { success: false, message: 'Already subscribed to this feed' };
  }
  
  // Try to fetch and validate feed
  try {
    const xmlData = await fetchRSS(url);
    const feed = parseRSS(xmlData);
    
    if (!feed) {
      return { success: false, message: 'Invalid RSS feed URL' };
    }
    
    const feedName = name || feed.title;
    subs[chatId].push({
      url,
      name: feedName,
      addedAt: new Date().toISOString(),
      lastCheck: new Date().toISOString(),
      lastItem: feed.items[0]?.link || null
    });
    
    saveSubscriptions(subs);
    return { 
      success: true, 
      message: `✅ Subscribed to "${feedName}"\n\nLatest posts:\n${feed.items.map((item, i) => `${i + 1}. ${item.title}`).join('\n')}`
    };
  } catch (e) {
    return { success: false, message: `Error: ${e.message}` };
  }
}

// Unsubscribe from RSS feed
function unsubscribe(chatId, feedIndex) {
  const subs = loadSubscriptions();
  
  if (!subs[chatId] || !subs[chatId][feedIndex]) {
    return { success: false, message: 'Invalid subscription number' };
  }
  
  const removed = subs[chatId].splice(feedIndex, 1)[0];
  saveSubscriptions(subs);
  
  return { success: true, message: `✅ Unsubscribed from "${removed.name}"` };
}

// List subscriptions
function listSubscriptions(chatId) {
  const subs = loadSubscriptions();
  
  if (!subs[chatId] || subs[chatId].length === 0) {
    return { success: true, message: '📭 No RSS subscriptions yet.\n\nUse /rss <url> to subscribe!' };
  }
  
  const list = subs[chatId].map((sub, i) => 
    `${i + 1}. ${sub.name}\n   ${sub.url}`
  ).join('\n\n');
  
  return { success: true, message: `📰 Your RSS Subscriptions:\n\n${list}\n\nUse /unrss <number> to unsubscribe` };
}

// Check all feeds for updates
async function checkAllFeeds(bot, TELEGRAM_CHAT_ID) {
  const subs = loadSubscriptions();
  
  for (const [chatId, feeds] of Object.entries(subs)) {
    for (let i = 0; i < feeds.length; i++) {
      const feed = feeds[i];
      
      try {
        const xmlData = await fetchRSS(feed.url);
        const parsed = parseRSS(xmlData);
        
        if (parsed && parsed.items.length > 0) {
          const latestItem = parsed.items[0];
          
          // Check if this is a new item
          if (latestItem.link !== feed.lastItem) {
            // Send notification
            const message = `📰 *New post from ${parsed.title}*\n\n*${latestItem.title}*\n\n${latestItem.description.substring(0, 200)}...\n\n[Read more](${latestItem.link})`;
            
            bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
              .catch(err => console.error('Failed to send RSS update:', err.message));
            
            // Update last item
            feed.lastItem = latestItem.link;
            feed.lastCheck = new Date().toISOString();
            saveSubscriptions(subs);
          }
        }
      } catch (e) {
        console.error(`Error checking feed ${feed.url}:`, e.message);
      }
    }
  }
}

module.exports = {
  subscribe,
  unsubscribe,
  listSubscriptions,
  checkAllFeeds
};
