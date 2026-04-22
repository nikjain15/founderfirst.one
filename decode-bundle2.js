const fs = require('fs');
const zlib = require('zlib');

const html = fs.readFileSync('penny-demo/index.html', 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);

const manifest = JSON.parse(manifestMatch[1]);

// Find the main app JS - b93fea6e has the claude.complete call for chat
['b93fea6e', 'aa000a44', '2c0d39b4'].forEach(prefix => {
  const uuid = Object.keys(manifest).find(k => k.startsWith(prefix));
  if (!uuid) return;
  const e = manifest[uuid];
  const bytes = Buffer.from(e.data, 'base64');
  const text = zlib.gunzipSync(bytes).toString('utf8');
  
  // Find window.claude definition
  if (text.includes('window.claude') || text.includes('claude=') || text.includes('anthropic')) {
    console.log('\n=== FILE', prefix, '(', text.length, 'chars) ===');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('window.claude') || line.includes('anthropic') || 
          line.includes('api.anthropic') || line.includes('ANTHROPIC') ||
          line.includes('claude=') || line.includes('proxyUrl') || 
          line.includes('proxy') || line.toLowerCase().includes('cors') ||
          line.includes('baseUrl') || line.includes('base_url')) {
        console.log(`  L${i+1}: ${line.trim().slice(0, 300)}`);
      }
    });
  }
});

// Also check the big JS file for claude init
const bigUuid = Object.keys(manifest).find(k => k.startsWith('4a4bdee1'));
if (bigUuid) {
  const e = manifest[bigUuid];
  const bytes = Buffer.from(e.data, 'base64');
  const text = zlib.gunzipSync(bytes).toString('utf8');
  if (text.includes('window.claude') || text.includes('anthropic') || text.includes('proxyUrl')) {
    console.log('\n=== BIG FILE (', text.length, 'chars) ===');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('window.claude') || line.includes('anthropic') || 
          line.includes('proxyUrl') || line.includes('proxy') ||
          line.includes('baseUrl') || line.includes('api_key')) {
        console.log(`  L${i+1}: ${line.trim().slice(0, 300)}`);
      }
    });
  }
}
