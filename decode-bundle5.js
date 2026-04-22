const fs = require('fs');
const zlib = require('zlib');

const html = fs.readFileSync('penny-demo/index.html', 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
const manifest = JSON.parse(manifestMatch[1]);
const jsUuids = Object.keys(manifest).filter(k => manifest[k].mime && manifest[k].mime.includes('javascript'));

// Find where window.claude is ASSIGNED (not called)
jsUuids.forEach(uuid => {
  const e = manifest[uuid];
  const bytes = Buffer.from(e.data, 'base64');
  const text = zlib.gunzipSync(bytes).toString('utf8');
  
  // Look for window.claude assignment or PENNY object with claude
  if (text.includes('window.claude=') || text.includes('window.claude =') || 
      text.includes('PENNY.claude') || text.includes('"complete"') ||
      (text.includes('claude') && text.includes('apiKey'))) {
    console.log('\n=== FOUND IN', uuid.slice(0,8), '===');
    const matches = [];
    const lines = text.split('\n');
    lines.forEach((line,i) => {
      if (line.includes('window.claude') || line.includes('apiKey') || 
          line.includes('api_key') || line.includes('proxyUrl') ||
          line.includes('https://') && line.includes('anthropic')) {
        matches.push(`L${i+1}: ${line.trim().slice(0,300)}`);
      }
    });
    if (matches.length) console.log(matches.join('\n'));
  }
});

// Also check template for window.claude setup
const templateMatch = html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
if (templateMatch) {
  const template = JSON.parse(templateMatch[1]);
  if (template.includes('window.claude') || template.includes('apiKey')) {
    console.log('\n=== IN TEMPLATE ===');
    const lines = template.split('\n');
    lines.forEach((line,i) => {
      if (line.includes('window.claude') || line.includes('apiKey') || line.includes('anthropic')) {
        console.log(`L${i+1}: ${line.trim().slice(0,300)}`);
      }
    });
  }
}
