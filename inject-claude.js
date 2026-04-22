const fs = require('fs');
const zlib = require('zlib');

function fixHtml(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  
  const templateMatch = html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  if (!templateMatch) { console.log('No template found in', filePath); return; }
  
  let template = JSON.parse(templateMatch[1]);
  
  // Check if already injected
  if (template.includes('window.claude')) {
    console.log('Already injected in', filePath);
    return;
  }
  
  // Inject window.claude right after <head> in the template
  const claudeScript = `<script>
  window.claude = {
    complete: async function(opts) {
      const resp = await fetch('https://penny-api.nikjain1588.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: opts.messages })
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message);
      return data.content[0].text;
    }
  };
  </script>`;
  
  // Inject after <head> tag in template
  template = template.replace('<head>', '<head>' + claudeScript);
  
  // Replace the old template JSON in html
  const newTemplateTag = `<script type="__bundler/template">${JSON.stringify(template)}</script>`;
  html = html.replace(/<script type="__bundler\/template">[\s\S]*?<\/script>/, newTemplateTag);
  
  fs.writeFileSync(filePath, html);
  console.log('✓ Injected into template in', filePath);
}

fixHtml('penny-demo/index.html');
fixHtml('penny-demo/cpa/index.html');
