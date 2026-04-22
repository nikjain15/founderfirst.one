const API = 'https://penny-api.nikjain1588.workers.dev';
const TOTAL = 50;
const DELAY_MS = 500;
const SLOW_THRESHOLD = 5000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log(`Sequential rate-limit test: ${TOTAL} requests, ${DELAY_MS}ms apart\n`);
  console.log('Req | Status | Time(ms) | Response preview (40 chars)');
  console.log('----|--------|----------|----------------------------');

  const slow = [], errors = [];

  for (let i = 1; i <= TOTAL; i++) {
    const start = Date.now();
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'What is my net income this month?' }] }),
      });
      const time = Date.now() - start;
      const text = await res.text();
      const preview = text.replace(/\n/g, ' ').slice(0, 40);
      console.log(`${String(i).padStart(3)} | ${String(res.status).padEnd(6)} | ${String(time).padStart(8)} | ${preview}`);
      if (time > SLOW_THRESHOLD) slow.push(i);
      if (!res.ok) errors.push({ i, status: res.status });
    } catch (err) {
      const time = Date.now() - start;
      console.log(`${String(i).padStart(3)} | ERR    | ${String(time).padStart(8)} | ${err.message.slice(0, 40)}`);
      errors.push({ i, status: 'ERR', msg: err.message });
    }
    if (i < TOTAL) await sleep(DELAY_MS);
  }

  console.log('\n--- Summary ---');
  console.log(`Slow requests (>${SLOW_THRESHOLD}ms): ${slow.length > 0 ? slow.join(', ') : 'none'}`);
  console.log(`Errors: ${errors.length > 0 ? JSON.stringify(errors) : 'none'}`);
  process.exit(errors.length > 5 ? 1 : 0);
})();
