const fs = require('fs');

['penny-demo/index.html', 'penny-demo/cpa/index.html'].forEach(filePath => {
  console.log('\n===', filePath, '===');
  const html = fs.readFileSync(filePath, 'utf8');

  const tmplStart = html.indexOf('<script type="__bundler/template">') + '<script type="__bundler/template">'.length;
  const tmplEnd = html.lastIndexOf('</script>');
  const tmplRaw = html.slice(tmplStart, tmplEnd);

  // Unescape <\/script> -> </script> for JSON.parse
  const unescaped = tmplRaw.split('<\\/script>').join('</script>');

  let parsed;
  try {
    parsed = JSON.parse(unescaped);
    console.log('JSON parse: OK');
  } catch(e) {
    console.log('JSON parse FAILED:', e.message);
    return;
  }

  const claudeIdx = parsed.indexOf('window.claude');
  const headIdx = parsed.indexOf('<head>');
  console.log('window.claude at char:', claudeIdx);
  console.log('<head> at char:', headIdx);
  console.log('claude injected right after <head>:', claudeIdx > headIdx && claudeIdx - headIdx < 300);
  console.log('\nInjected snippet:');
  console.log(parsed.slice(headIdx, headIdx + 500));
});
