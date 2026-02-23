const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Simple web search using DuckDuckGo
async function webSearch(query, maxResults = 5) {
  try {
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'html.duckduckgo.com',
        path: `/html/?q=${encodeURIComponent(query)}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          // Parse results from HTML
          const results = [];
          const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
          const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;
          
          let match;
          let count = 0;
          
          while ((match = resultRegex.exec(data)) !== null && count < maxResults) {
            const url = match[1];
            const title = match[2].replace(/<[^>]+>/g, ''); // Strip HTML tags
            
            // Get snippet
            const snippetMatch = snippetRegex.exec(data);
            const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '') : '';
            
            if (url && !url.includes('duckduckgo.com')) {
              results.push(`${count + 1}. ${title}\n   ${snippet}\n   URL: ${url}`);
              count++;
            }
          }
          
          if (results.length === 0) {
            resolve(`No web results found for: "${query}"\n\nTry a different search term.`);
          } else {
            resolve(`Web Search Results for: "${query}"\n\n${results.join('\n\n')}`);
          }
        });
      });

      req.on('error', (e) => {
        resolve(`Web search temporarily unavailable.\n\nError: ${e.message}\n\nPlease try again later.`);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        resolve(`Web search timed out.\n\nThe search service may be busy. Try again later.`);
      });

      req.end();
    });
  } catch (error) {
    return `Search error: ${error.message}`;
  }
}

module.exports = { webSearch };
