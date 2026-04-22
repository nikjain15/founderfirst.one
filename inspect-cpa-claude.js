const fs = require('fs');
const zlib = require('zlib');

const html = fs.readFileSync('penny-demo/cpa/index.html', 'utf8');
const mm = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
const manifest = JSON.parse(mm[1]);

for (const [uuid,entry] of Object.entries(manifest)) {
  if (!(entry.mime||'').includes('javascript')) continue;
  const bytes = Buffer.from(entry.data, 'base64');
  const out = entry.compressed ? zlib.gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  if (out.includes('window.claude.complete')) {
    console.log('\n===', uuid.slice(0,8), '===');
    const idx = out.indexOf('window.claude.complete');
    console.log(out.slice(Math.max(0, idx - 350), idx + 450));
  }
}
