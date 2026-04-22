const fs = require('fs');

['penny-demo/index.html', 'penny-demo/cpa/index.html'].forEach(f => {
  const html = fs.readFileSync(f, 'utf8');

  const total = (html.match(/window\.claude/g)||[]).length;
  console.log('\n' + f);
  console.log('  total window.claude occurrences:', total);

  // Check outer pre-bundler script tag
  const outerScript = html.match(/<script>\s*\n\s*window\.claude/);
  console.log('  in outer <script> tag:', !!outerScript);

  // Check __bundler/template content
  // The template tag ends at the LAST </script> so we need a smarter match
  const tmplStart = html.indexOf('<script type="__bundler/template">');
  const tmplEnd = html.lastIndexOf('</script>');
  if (tmplStart > -1) {
    const tmplContent = html.slice(tmplStart, tmplEnd);
    const inTemplate = tmplContent.includes('window.claude') || tmplContent.includes('window\\.claude');
    console.log('  in __bundler/template:', inTemplate);
    console.log('  template content length:', tmplContent.length);
  } else {
    console.log('  __bundler/template: NOT FOUND');
  }
});
