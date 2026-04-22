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
];

function check1(text) { return /\$[\d,]+|[\d,]+%|\d+\s*(invoices?|months?|days?|years?|clients?)/i.test(text); }
function check2(text) { return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length <= 3; }
function check3(text) { return !/I don't have access|I'm not able to|I cannot access|I do not have/i.test(text); }

(async () => {
  console.log('Quality Audit — 15 questions (sequential)\n');
  let totalScore = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    process.stdout.write(`[${i + 1}/15] ${q.slice(0, 50)}... `);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: q }] }),
      });
      const text = await res.text();
      const c1 = check1(text), c2 = check2(text), c3 = check3(text);
      const score = [c1, c2, c3].filter(Boolean).length;
      totalScore += score;
      console.log(`[${score}/3]`);
      console.log(`  C1(has number): ${c1 ? 'PASS' : 'FAIL'} | C2(≤3 sentences): ${c2 ? 'PASS' : 'FAIL'} | C3(no deflection): ${c3 ? 'PASS' : 'FAIL'}`);
      console.log(`  Response: ${text.replace(/\n/g, ' ').slice(0, 120)}`);
    } catch (err) {
      console.log('ERROR:', err.message);
    }
    console.log();
  }

  console.log(`\nFinal score: ${totalScore}/45`);
  process.exit(totalScore >= 30 ? 0 : 1);
})();
