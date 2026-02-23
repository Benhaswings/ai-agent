const fs = require('fs');
const path = require('path');
const https = require('https');

const RSS_FILE = path.join(__dirname, '..', 'config', 'dhs_press_releases_state.json');
const DHS_PRESS_URL = 'https://www.dhs.gov/news-releases/press-releases';
const DHS_CHANNEL = '@dhsrss';

// Load state
function loadState() {
  try {
    if (fs.existsSync(RSS_FILE)) {
      return JSON.parse(fs.readFileSync(RSS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading state:', e.message);
  }
  return { lastUrl: null, lastCheck: null };
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

// Fetch press releases page
async function fetchPressReleases() {
  return new Promise((resolve, reject) => {
    const options = new URL(DHS_PRESS_URL);
    const req = https.request(options, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
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

// Parse press releases from HTML
function parsePressReleases(html) {
  const articles = [];
  
  // Find article links and titles
  const linkRegex = /<a[^>]*href="([^"]*\/news\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let match;
  
  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];
    const title = match[2].trim();
    
    // Skip if no title or duplicate
    if (!title || articles.find(a => a.url === url)) {
      continue;
    }
    
    // Ensure full URL
    if (!url.startsWith('http')) {
      url = 'https://www.dhs.gov' + url;
    }
    
    articles.push({
      title,
      url,
      date: extractDate(match[1])
    });
  }
  
  return articles.slice(0, 10); // Get top 10
}

// Extract date from URL
function extractDate(urlPath) {
  const match = urlPath.match(/\/news\/(\d{4})\/(\d{2})\/(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return new Date().toISOString().split('T')[0];
}

// Check for new press releases
async function checkDHSPressReleases(bot) {
  try {
    console.log('📰 Checking DHS press releases...');
    const html = await fetchPressReleases();
    const articles = parsePressReleases(html);
    
    if (articles.length === 0) {
      console.log('No articles found');
      return;
    }
    
    const state = loadState();
    const newArticles = [];
    
    // Find new articles
    for (const article of articles) {
      if (article.url === state.lastUrl) {
        break;
      }
      newArticles.push(article);
    }
    
    if (newArticles.length === 0) {
      console.log('No new DHS press releases');
      return;
    }
    
    console.log(`Found ${newArticles.length} new press releases`);
    
    // Post new articles (oldest first)
    for (let i = newArticles.length - 1; i >= 0; i--) {
      const article = newArticles[i];
      const message = `📰 *DHS Press Release*\n\n*${article.title}*\n\nDate: ${article.date}\n\n[Read full article](${article.url})`;
      
      try {
        await bot.sendMessage(DHS_CHANNEL, message, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: false
        });
        console.log(`✅ Posted: ${article.title.substring(0, 50)}`);
        
        // Wait between posts
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (err) {
        console.error(`❌ Failed to post:`, err.message);
      }
    }
    
    // Update state
    state.lastUrl = articles[0].url;
    state.lastCheck = new Date().toISOString();
    saveState(state);
    
  } catch (error) {
    console.error('❌ Error checking DHS press releases:', error.message);
  }
}

// Manual check
async function manualCheck(bot, chatId) {
  bot.sendMessage(chatId, '🔍 Checking DHS press releases...');
  await checkDHSPressReleases(bot);
  bot.sendMessage(chatId, '✅ Check complete!');
}

module.exports = {
  checkDHSPressReleases,
  manualCheck,
  DHS_CHANNEL
};
