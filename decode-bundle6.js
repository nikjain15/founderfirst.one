const fs = require('fs');
const zlib = require('zlib');

const html = fs.readFileSync('penny-demo/index.html', 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
const manifest = JSON.parse(manifestMatch[1]);
const jsUuids = Object.keys(manifest).filter(k => manifest[k].mime && manifest[k].mime.includes('javascript'));

// Dump the smallest JS files fully - likely the entry/config file
const sorted = jsUuids.map(uuid => {
  const e = manifest[uuid];
  return { uuid, size: e.data.length };
}).sort((a,b) => a.size - b.size);

console.log('Files by size:');
sorted.forEach(({uuid, size}) => console.log(uuid.slice(0,8), size));

// Print the two smallest JS files in full
sorted.slice(0, 3).forEach(({uuid}) => {
  const e = manifest[uuid];
  const bytes = Buffer.from(e.data, 'base64');
  const text = zlib.gunzipSync(bytes).toString('utf8');
  console.log('\n\n====== FULL FILE', uuid.slice(0,8), '======\n');
  console.log(text);
});
