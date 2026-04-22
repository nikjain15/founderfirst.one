// inject-claude.js - SAFE VERSION
// No regex literals, no template literals — only split/join string ops.
const fs = require('fs');
const path = require('path');

const PROXY_URL = 'https://penny-api.nikjain1588.workers.dev';

// Build the script as a joined array of plain strings — no backticks, no regex literals.
// Last line uses <\/ so JSON.stringify keeps it safe inside the JSON string.
const CLAUDE_SCRIPT = [
  '<script>',
  '(function(){',
  '  var PROXY = "' + PROXY_URL + '";',
  '  function getText(data) {',
  '    if (!data) return "";',
  '    if (Array.isArray(data.content)) {',
  '      var out = "";',
  '      for (var i = 0; i < data.content.length; i++) {',
  '        var p = data.content[i];',
  '        if (p && p.type === "text" && typeof p.text === "string") {',
  '          out += (out ? "\\n" : "") + p.text;',
  '        }',
  '      }',
  '      return out.trim();',
  '    }',
  '    return "";',
  '  }',
  '  window.claude = {',
  '    complete: function(opts) {',
  '      var msgs = (opts && Array.isArray(opts.messages)) ? opts.messages : [];',
  '      return fetch(PROXY, {',
  '        method: "POST",',
  '        headers: { "Content-Type": "application/json" },',
  '        body: JSON.stringify({ messages: msgs })',
  '      })',
  '      .then(function(r) { return r.json(); })',
  '      .then(function(data) {',
  '        if (data && data.error) throw new Error(data.error.message || "API error");',
  '        var text = getText(data);',
  '        if (!text) throw new Error("Empty response");',
  '        return text;',
  '      });',
  '    }',
  '  };',
  '})();',
  '</script>',
].join('\n');
// NOTE: CLAUDE_SCRIPT ends with a plain </script>.
// The split/join below will turn it into <\/script> (one backslash) inside the JSON,
// which the HTML parser won't see as a closing tag, but JSON.parse will unescape to </script>
// so DOMParser closes the injected script correctly. DO NOT use <\\/script> here.

function injectFile(relPath) {
  var filePath = path.join(__dirname, relPath);
  var html = fs.readFileSync(filePath, 'utf8');

  var TAG_OPEN = '<script type="__bundler/template">';
  var TAG_CLOSE = '</script>';

  var si = html.indexOf(TAG_OPEN);
  if (si === -1) { console.log('No __bundler/template in', relPath); return; }

  var contentStart = si + TAG_OPEN.length;
  var ei = html.indexOf(TAG_CLOSE, contentStart);
  if (ei === -1) { console.log('No closing tag in', relPath); return; }

  var jsonStr = html.slice(contentStart, ei).trim();
  var template;
  try {
    template = JSON.parse(jsonStr);
  } catch(e) {
    console.log('JSON.parse failed for', relPath, ':', e.message);
    return;
  }

  if (template.indexOf('window.claude') !== -1) {
    console.log('window.claude already present in', relPath, '— skipping');
    return;
  }

  var headIdx = template.indexOf('<head>');
  if (headIdx === -1) { console.log('No <head> in template of', relPath); return; }

  template = template.slice(0, headIdx + 6) + CLAUDE_SCRIPT + template.slice(headIdx + 6);

  // JSON.stringify the modified template, then replace any </script> that slipped through
  var newJson = JSON.stringify(template);
  // split+join instead of regex to avoid escaping issues
  newJson = newJson.split('</' + 'script>').join('<\\/script>');

  var newHtml = html.slice(0, contentStart) + newJson + html.slice(ei);
  fs.writeFileSync(filePath, newHtml);
  console.log('Wrote', relPath);

  // Verify round-trip
  try {
    var forParse = newJson.split('\\/').join('/');
    var t = JSON.parse(forParse);
    console.log('  JSON valid: true');
    console.log('  window.claude present:', t.indexOf('window.claude') !== -1);
    console.log('  Proxy URL present:', t.indexOf(PROXY_URL) !== -1);
  } catch(e) {
    console.log('  VERIFY FAILED:', e.message);
  }
}

injectFile('penny/demo/index.html');
injectFile('penny/cpademo/index.html');
