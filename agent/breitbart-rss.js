const fs = require('fs');
const path = require('path');
const https = require('https');
const { XMLParser } = require('fast-xml-parser');

const RSS_FILE = path.join(__dirname, '..', 'config', 'breitbart_rss_state.json');
const BREITBART_RSS_URL = 'https://feeds.feedburner.com/breitbart';
const BREITBART_CHANNEL = '@breitbartrss';

// Keywords to filter for (case insensitive)
const KEYWORDS = [
  'dhs', 'department of homeland security',
  'cbp', 'customs and border protection', 'border patrol',
  'fbi', 'federal bureau of investigation',
  'homeland security', 'border', 'immigration', 'ice',
  'deportation', 'migrant', 'illegal alien', 'cartel',
  'trafficking', 'smuggling'
];

// Load state
function loadState() {
  try {
    if (fs.existsSync(RSS_FILE)) {
      const state = JSON.parse(fs.readFileSync(RSS_FILE, 'utf8'));
      // Normalize postedGuids to strings (in case old data has objects)
      if (state.postedGuids && Array.isArray(state.postedGuids)) {
        state.postedGuids = state.postedGuids.map(guid => {
          if (typeof guid === 'object') {
            return guid['#text'] || guid.toString();
          }
          return guid;
        });
      }
      return state;
    }
  } catch (e) {
    console.error('Error loading state:', e.message);
  }
  return { lastGuid: null, postedGuids: [], lastCheck: null };
}

// Save state
function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(RSS_FILE), { recursive: true });
    fs.writeFileSync(RSS_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Error saving state:', e.message);
  }
}

// Check if article matches keywords
function matchesKeywords(title, description = '') {
  const text = (title + ' ' + description).toLowerCase();
  return KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()));
}

// Fetch RSS feed
async function fetchRSS(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const req = https.request(options, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
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
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    const result = parser.parse(xmlData);
    
    // Handle RSS 2.0
    if (result.rss && result.rss.channel) {
      const channel = result.rss.channel;
      const items = Array.isArray(channel.item) ? channel.item : [channel.item];
      return items.filter(item => item).map(item => {
        // Extract GUID as string (handle both object and string formats)
        let guid = item.guid || item.link || '';
        if (typeof guid === 'object') {
          guid = guid['#text'] || guid.toString();
        }
        
        return {
          title: item.title || 'No title',
          link: item.link || '',
          description: item.description || '',
          guid: guid,
          pubDate: item.pubDate || new Date().toISOString()
        };
      });
    }
    
    return [];
  } catch (e) {
    console.error('Parse error:', e.message);
    return [];
  }
}

// Check Breitbart RSS and post filtered articles
async function checkBreitbartRSS(bot) {
  try {
    console.log('📰 Checking Breitbart RSS...');
    const xmlData = await fetchRSS(BREITBART_RSS_URL);
    const items = parseRSS(xmlData);
    
    if (items.length === 0) {
      console.log('No items found in RSS feed');
      return;
    }
    
    const state = loadState();
    const matchingArticles = [];
    
    // Find new matching articles
    for (const item of items) {
      // Skip if already posted
      if (state.postedGuids.includes(item.guid)) {
        continue;
      }
      
      // Check if matches keywords
      if (matchesKeywords(item.title, item.description)) {
        matchingArticles.push(item);
      }
    }
    
    if (matchingArticles.length === 0) {
      console.log('No new DHS/CBP/FBI/Homeland Security articles found');
      return;
    }
    
    console.log(`Found ${matchingArticles.length} matching articles`);
    
    // Post matching articles (oldest first)
    for (let i = matchingArticles.length - 1; i >= 0; i--) {
      const item = matchingArticles[i];
      const cleanDesc = item.description
        .replace(/<[^>]+>/g, '') // Remove HTML tags
        .substring(0, 150) + '...';
      
      const message = `📰 *Breitbart*\n\n*${item.title}*\n\n${cleanDesc}\n\n[Read full article](${item.link})`;
      
      try {
        await bot.sendMessage(BREITBART_CHANNEL, message, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: false
        });
        console.log(`✅ Posted: ${item.title.substring(0, 50)}`);
        
        // Track posted
        state.postedGuids.push(item.guid);
        
        // Wait between posts
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (err) {
        console.error(`❌ Failed to post:`, err.message);
      }
    }
    
    // Update state
    state.lastGuid = items[0]?.guid || null;
    state.lastCheck = new Date().toISOString();
    
    // Keep only last 1000 guids to prevent file bloat
    if (state.postedGuids.length > 1000) {
      state.postedGuids = state.postedGuids.slice(-1000);
    }
    
    saveState(state);
    
  } catch (error) {
    console.error('❌ Error checking Breitbart RSS:', error.message);
  }
}

// Manual check
async function manualCheckBreitbart(bot, chatId) {
  bot.sendMessage(chatId, '🔍 Checking Breitbart RSS for DHS/CBP/FBI articles...');
  await checkBreitbartRSS(bot);
  bot.sendMessage(chatId, '✅ Check complete!');
}

module.exports = {
  checkBreitbartRSS,
  manualCheckBreitbart,
  BREITBART_CHANNEL
};
