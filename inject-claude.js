const fs = require('fs');

const PROXY_URL = 'https://penny-api.nikjain1588.workers.dev';

// <\/script> is used so JSON.stringify won't create a literal </script> that breaks the outer script tag
const claudeScriptRaw = `<script>
window.claude = {
  complete: async function(opts) {
    const resp = await fetch('${PROXY_URL}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: opts.messages })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    return data.content[0].text;
  }
};
<\/script>`;

function fixHtml(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');

  const templateMatch = html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  if (!templateMatch) { console.log('No template found in', filePath); return; }

  let template = JSON.parse(templateMatch[1].trim());

  if (template.includes('window.claude')) {
    console.log('Already injected in', filePath);
    return;
  }

  // Inject after <head>
  template = template.replace('<head>', '<head>' + claudeScriptRaw);

  // JSON.stringify doesn't escape </script> — must do it manually to avoid breaking the outer script tag
  const safeJson = JSON.stringify(template).replace(/<\/script>/g, '<\\/script>');
  const newTemplateTag = `<script type="__bundler/template">${safeJson}</script>`;
  html = html.replace(/<script type="__bundler\/template">[\s\S]*?<\/script>/, newTemplateTag);

  fs.writeFileSync(filePath, html);
  console.log('✓ Injected into', filePath);

  // Verify — unescape \/ back to / before parsing
  const verify = html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  try {
    const rawJson = verify[1].replace(/<\\\/script>/g, '</script>');
    const t = JSON.parse(rawJson);
    console.log('  ✓ JSON valid, window.claude present:', t.includes('window.claude'));
  } catch(e) {
    console.log('  ✗ JSON broken:', e.message);
  }
}

fixHtml('penny-demo/index.html');
fixHtml('penny-demo/cpa/index.html');
