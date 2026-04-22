const fs = require('fs');
const zlib = require('zlib');

const html = fs.readFileSync('penny-demo/index.html', 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
const manifest = JSON.parse(manifestMatch[1]);

const jsUuids = Object.keys(manifest).filter(k => manifest[k].mime && manifest[k].mime.includes('javascript'));

// Find where window.claude is DEFINED (the .complete method)
jsUuids.forEach(uuid => {
  const e = manifest[uuid];
  const bytes = Buffer.from(e.data, 'base64');
  const text = zlib.gunzipSync(bytes).toString('utf8');
  
  if (text.includes('.complete=') || text.includes('complete:') || (text.includes('window.claude') && text.includes('async'))) {
    const idx = text.indexOf('complete');
    if (text.indexOf('window.claude') < text.indexOf('complete') || text.includes('claude={') || text.includes('claude = {')) {
      console.log('\n=== DEFINITION FILE', uuid.slice(0,8), '===');
      console.log(text.slice(0, 2000));
    }
  }
});

// Also look in the PENNY global definition
jsUuids.forEach(uuid => {
  const e = manifest[uuid];
  const bytes = Buffer.from(e.data, 'base64');
  const text = zlib.gunzipSync(bytes).toString('utf8');
  
  if (text.includes('PENNY') && text.includes('claude')) {
    console.log('\n=== PENNY+CLAUDE FILE', uuid.slice(0,8), '===');
    // find claude setup
    const idx = text.indexOf('claude');
    console.log(text.slice(Math.max(0,idx-100), idx+800));
  }
});
