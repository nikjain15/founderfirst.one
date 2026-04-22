const API = 'https://penny-api.nikjain1588.workers.dev';

const questions = [
  "What did I spend last month?",
  "Am I profitable this month?",
  "Who owes me money right now?",
  "When is my next tax payment due?",
  "How much should I set aside for taxes?",
  "What's my biggest expense category?",
  "Can I afford to hire someone?",
  "How's my cash flow looking?",
  "What was my best revenue month this year?",
  "Do I have any overdue invoices?",
  "How much did I make from TripAdvisor this month?",
  "Is Stonyfield still past due?",
  "What's my runway if revenue drops 30%?",
  "Should I take a distribution this month?",
  "What does Sarah need from me for taxes?",
  "What are my total receivables?",
  "What's my net income year to date?",
  "How much did payroll cost last month?",
  "Are there any unusual transactions I should know about?",
  "What's my effective tax rate this year?",
];

async function sendRequest(index, question) {
  const start = Date.now();
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
    });
    const time = Date.now() - start;
    const text = await res.text();
    return { index, question, status: res.status, time, response: text, ok: res.ok };
  } catch (err) {
    return { index, question, status: 'ERR', time: Date.now() - start, response: err.message, ok: false };
  }
}

(async () => {
  console.log(`Sending 20 concurrent requests to ${API}...\n`);
  const start = Date.now();
  const results = await Promise.allSettled(questions.map((q, i) => sendRequest(i + 1, q)));
  const total = Date.now() - start;

  let passed = 0, failed = 0;
  console.log('Index | Status | Time(ms) | Question (truncated)                  | Response (60 chars)');
  console.log('------|--------|----------|---------------------------------------|--------------------');
  for (const r of results) {
    const d = r.value;
    const q = d.question.slice(0, 37).padEnd(37);
    const resp = (d.response || '').replace(/\n/g, ' ').slice(0, 60);
    console.log(`  ${String(d.index).padStart(2)}  | ${String(d.status).padEnd(6)} | ${String(d.time).padStart(8)} | ${q} | ${resp}`);
    d.ok ? passed++ : failed++;
  }

  console.log(`\nTotal wall time: ${total}ms | Passed: ${passed} | Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
