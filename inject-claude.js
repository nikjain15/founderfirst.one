const fs = require('fs');

const PROXY_URL = 'https://penny-api.nikjain1588.workers.dev';

// <\/script> is used so JSON.stringify won't create a literal </script> that breaks the outer script tag
const claudeScriptRaw = `<script>
(function(){
  let __pennyLastReply = '';

  const FALLBACK_FACTS = {
    aprilExpenses: '$2,287',
    aprilRevenue: '$15,800',
    aprilNet: '$8,013',
    q2Estimate: '$4,800',
    q2Due: 'June 15',
    chaseBalance: '$42,680',
    auditReadiness: '82/100',
    cashCushion: '7.2 months',
    stonyOverdue: '$4,200',
    w9Missing: 'Mike Reed ($2,400 YTD)'
  };

  function extractQuestion(messages) {
    const last = messages && messages.length ? messages[messages.length - 1] : null;
    const raw = String((last && last.content) || '').trim();
    const m = raw.match(/asks?:\\s*"([\\s\\S]*?)"/i);
    return (m ? m[1] : raw).toLowerCase();
  }

  function localAnswer(messages) {
    const q = extractQuestion(messages);
    if (!q) return '';

    if (q.includes('expense')) {
      return 'April expenses so far are ' + FALLBACK_FACTS.aprilExpenses + '. If you want, I can break that into payroll vs operating spend.';
    }
    if (q.includes('revenue') || q.includes('income this month')) {
      return 'April revenue so far is ' + FALLBACK_FACTS.aprilRevenue + '. Net so far is ' + FALLBACK_FACTS.aprilNet + '.';
    }
    if (q.includes('net')) {
      return 'April net so far is ' + FALLBACK_FACTS.aprilNet + '. That is based on ' + FALLBACK_FACTS.aprilRevenue + ' in and ' + FALLBACK_FACTS.aprilExpenses + ' in operating expenses before owner pay/distributions.';
    }
    if ((q.includes('q2') && q.includes('estimate')) || q.includes('tax deadline')) {
      return 'Q2 federal estimate is ' + FALLBACK_FACTS.q2Estimate + ', due ' + FALLBACK_FACTS.q2Due + '. Cash coverage looks fine with ' + FALLBACK_FACTS.chaseBalance + ' in Chase.';
    }
    if (q.includes('audit')) {
      return 'Audit-readiness is ' + FALLBACK_FACTS.auditReadiness + '. Biggest open items are ' + FALLBACK_FACTS.w9Missing + ' and one overdue receivable (' + FALLBACK_FACTS.stonyOverdue + ').';
    }
    if (q.includes('cash') || q.includes('runway') || q.includes('cushion')) {
      return 'Current cash cushion is ' + FALLBACK_FACTS.cashCushion + '. I can model best/base/worst case for the next 90 days if you want.';
    }
    return '';
  }

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

      // Deterministic local handling for common CPA/demo questions.
      // This prevents blank/failure moments during live demo and reduces hallucination.
      const local = localAnswer(input);
      if (local) {
        __pennyLastReply = local;
        return local;
      }

      let text;
      try {
        text = await callClaude(input, false);
      } catch (e) {
        // Last-resort safe fallback: never leave the user with a failure bubble.
        text = 'I can answer from the current books, but I need one specific metric. Ask me for expenses, revenue, net, taxes, or audit readiness.';
      }

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
