const fs = require('fs');

const PROXY_URL = 'https://penny-api.nikjain1588.workers.dev';

// <\/script> is used so JSON.stringify won't create a literal </script> that breaks the outer script tag
const claudeScriptRaw = `<script>
(function(){
  let __pennyLastReply = '';

  function asText(data) {
    if (!data) return '';
    if (typeof data.completion === 'string') return data.completion;
    if (Array.isArray(data.content)) {
      return data.content
        .filter(p => p && p.type === 'text' && typeof p.text === 'string')
        .map(p => p.text)
        .join('\n')
        .trim();
    }
    return '';
  }

  async function callClaude(messages, extraNudge) {
    const resp = await fetch('${PROXY_URL}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: 0.2,
        system: [
          'You are Penny. Use only facts provided in the prompt/context.',
          'Never invent numbers, dates, clients, balances, or tax details.',
          'If a number is missing, say: "I do not have that in the books yet."',
          'Keep response concise and non-repetitive.'
        ].join(' ')
      })
    });

    const data = await resp.json();
    if (data && data.error) throw new Error(data.error.message || 'Claude request failed');

    let text = asText(data);
    if (!text) throw new Error('Empty Claude response');

    // If model gives generic no-context response, retry once with stronger grounding cue
    const generic = /don't have access to your personal financial information|i don't have access/i.test(text);
    if (generic && !extraNudge) {
      const nudged = messages.map((m, i) => {
        if (i !== messages.length - 1 || m.role !== 'user') return m;
        return {
          role: 'user',
          content: String(m.content || '') + '\n\nIMPORTANT: Context and numbers are already included above. Answer directly using that provided data only.'
        };
      });
      return callClaude(nudged, true);
    }

    return text;
  }

  window.claude = {
    complete: async function(opts) {
      const input = Array.isArray(opts && opts.messages) ? opts.messages : [];
      if (!input.length) throw new Error('Missing messages');

      let text = await callClaude(input, false);

      // If same reply repeats, retry once with anti-repeat nudge
      if (__pennyLastReply && text.trim() === __pennyLastReply.trim()) {
        const nudged = input.map((m, i) => {
          if (i !== input.length - 1 || m.role !== 'user') return m;
          return {
            role: 'user',
            content: String(m.content || '') + '\n\nIMPORTANT: Do not repeat your previous wording. Give a fresh, specific answer grounded in the provided numbers.'
          };
        });
        text = await callClaude(nudged, true);
      }

      __pennyLastReply = text;
      return text;
    }
  };
})();
<\/script>`;

function fixHtml(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');

  const templateMatch = html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  if (!templateMatch) { console.log('No template found in', filePath); return; }

  let template = JSON.parse(templateMatch[1].trim());

  if (template.includes('window.claude')) {
    // Refresh existing injection by removing prior block first, then reinserting.
    template = template.replace(/<script>[\s\S]*?window\.claude[\s\S]*?<\/script>/, '');
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
