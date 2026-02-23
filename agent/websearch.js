const https = require('https');
const { URL } = require('url');

// Brave Search API
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';

async function webSearch(query, maxResults = 5) {
  if (!BRAVE_API_KEY) {
    return `[Web Search for: "${query}"]\n\nNo Brave Search API key configured.\nGet one free at: https://api.search.brave.com/`;
  }

  try {
    const url = new URL(BRAVE_API_URL);
    url.searchParams.append('q', query);
    url.searchParams.append('count', maxResults.toString());
    url.searchParams.append('offset', '0');
    url.searchParams.append('mkt', 'en-US');
    url.searchParams.append('safesearch', 'moderate');
    url.searchParams.append('freshness', 'all');
    url.searchParams.append('text_decorations', 'false');
    url.searchParams.append('text_format', 'Raw');

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': BRAVE_API_KEY
        }
      };

      const req = https.request(options, (res) => {
        let data = [];
        
        res.on('data', (chunk) => data.push(chunk));
        res.on('end', () => {
          try {
            const buffer = Buffer.concat(data);
            const jsonData = JSON.parse(buffer.toString());
            
            if (jsonData.web && jsonData.web.results && jsonData.web.results.length > 0) {
              const results = jsonData.web.results.slice(0, maxResults).map((result, index) => {
                return `${index + 1}. ${result.title}\n   ${result.description}\n   Source: ${result.url}`;
              }).join('\n\n');
              
              resolve(`Web Search Results for: "${query}"\n\n${results}`);
            } else {
              resolve(`No web results found for: "${query}"\n\nTry a different search term.`);
            }
          } catch (error) {
            resolve(`Search error: ${error.message}`);
          }
        });
      });

      req.on('error', (e) => {
        resolve(`Web search error: ${e.message}`);
      });

      req.setTimeout(15000, () => {
        req.destroy();
        resolve(`Web search timed out. Please try again.`);
      });

      req.end();
    });
  } catch (error) {
    return `Search error: ${error.message}`;
  }
}

module.exports = { webSearch };
