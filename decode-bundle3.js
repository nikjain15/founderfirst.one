const fs = require('fs');
const zlib = require('zlib');

const html = fs.readFileSync('penny-demo/index.html', 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
const manifest = JSON.parse(manifestMatch[1]);

// Search ALL JS files for window.claude definition and anthropic URL
const jsUuids = Object.keys(manifest).filter(k => manifest[k].mime && manifest[k].mime.includes('javascript'));

jsUuids.forEach(uuid => {
  const e = manifest[uuid];
  const bytes = Buffer.from(e.data, 'base64');
  const text = zlib.gunzipSync(bytes).toString('utf8');
  
  if (text.includes('claude') && (text.includes('complete') || text.includes('proxyUrl') || text.includes('anthropic') || text.includes('fetch'))) {
    console.log('\n=== FILE', uuid.slice(0,8), '(', text.length, 'chars) ===');
    // Print 10 lines around 'window.claude' definition
    const idx = text.indexOf('window.claude');
    if (idx > -1) {
      const snippet = text.slice(Math.max(0, idx-200), idx+500);
      console.log('WINDOW.CLAUDE CONTEXT:\n', snippet);
    }
    const idx2 = text.indexOf('proxyUrl');
    if (idx2 > -1) {
      console.log('\nPROXY CONTEXT:\n', text.slice(Math.max(0,idx2-100), idx2+300));
    }
    const idx3 = text.indexOf('fetch(');
    if (idx3 > -1 && text.slice(idx3, idx3+100).includes('anthropic')) {
      console.log('\nFETCH CONTEXT:\n', text.slice(Math.max(0,idx3-100), idx3+300));
    }
  }
});
