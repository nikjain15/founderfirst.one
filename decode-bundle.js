const fs = require('fs');
const zlib = require('zlib');

const html = fs.readFileSync('penny-demo/index.html', 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
const templateMatch = html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);

console.log('manifest found:', !!manifestMatch);
console.log('template found:', !!templateMatch);

if (manifestMatch) {
  const manifest = JSON.parse(manifestMatch[1]);
  const uuids = Object.keys(manifest);
  console.log('assets count:', uuids.length);
  uuids.forEach(uuid => {
    const e = manifest[uuid];
    console.log(uuid.slice(0,8), e.mime, 'compressed:', e.compressed, 'data size:', e.data.length);
  });

  // Decode JS files and search for API calls
  uuids.forEach(uuid => {
    const e = manifest[uuid];
    if (e.mime && e.mime.includes('javascript')) {
      try {
        const bytes = Buffer.from(e.data, 'base64');
        let text;
        if (e.compressed) {
          text = zlib.gunzipSync(bytes).toString('utf8');
        } else {
          text = bytes.toString('utf8');
        }
        if (text.includes('anthropic') || text.includes('claude') || text.includes('api.') || text.includes('fetch(')) {
          console.log('\n=== JS file', uuid.slice(0,8), '===');
          // Find relevant lines
          const lines = text.split('\n');
          lines.forEach((line, i) => {
            if (line.toLowerCase().includes('anthropic') || line.toLowerCase().includes('claude') || 
                line.includes('sk-ant') || line.toLowerCase().includes('api_key') || 
                line.toLowerCase().includes('apikey') || line.includes('fetch(')) {
              console.log(`  L${i+1}: ${line.trim().slice(0, 200)}`);
            }
          });
        }
      } catch(e2) {
        console.log('failed to decode', uuid.slice(0,8), e2.message);
      }
    }
  });
}
