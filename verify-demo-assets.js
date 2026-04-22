const fs = require('fs');
const zlib = require('zlib');

function inspect(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const mm = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
  if (!mm) {
    console.log(filePath, 'manifest missing');
    return;
  }
  const manifest = JSON.parse(mm[1]);
  const js = Object.entries(manifest).filter(([,v]) => (v.mime||'').includes('javascript'));

  let hasAskBar = false;
  let hasBrainError = false;
  let hasClaudeCall = false;
  let hasSystemPrompt = false;

  for (const [uuid,entry] of js) {
    const bytes = Buffer.from(entry.data, 'base64');
    const out = entry.compressed ? zlib.gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
    if (out.includes('AskBar')) hasAskBar = true;
    if (out.includes("Couldn't reach my brain")) hasBrainError = true;
    if (out.includes('window.claude.complete')) hasClaudeCall = true;
    if (out.includes('You are Penny') || out.includes('PENNY_SYSTEM')) hasSystemPrompt = true;
  }

  console.log('\n' + filePath);
  console.log('  js assets:', js.length);
  console.log('  has AskBar:', hasAskBar);
  console.log('  has brain-error fallback:', hasBrainError);
  console.log('  has window.claude.complete call:', hasClaudeCall);
  console.log('  has Penny system prompt:', hasSystemPrompt);
}

inspect('penny-demo/index.html');
inspect('penny-demo/cpa/index.html');
