/**
 * Self-contained HTML page served at /connect-discord?token=...
 *
 * Flow:
 *   1. User clicks the magic link from their Discord DM.
 *   2. This page asks for the email Penny already knows about.
 *   3. On submit, POSTs { token, email } to /discord/confirm on this same
 *      Worker. The Worker calls confirm_discord_link in Supabase.
 *   4. On success, shows "you're connected — go back to Discord."
 *
 * No JS framework. No external assets. Inline CSS uses the FounderFirst
 * design-token names so it matches the rest of the surfaces visually
 * (falls back to readable defaults if tokens aren't on the page — they
 * aren't here, since this is standalone, but the variable names document
 * intent for whoever edits this next).
 */

export const CONNECT_DISCORD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Connect your Discord — FounderFirst</title>
<style>
  :root {
    --bg: #fbfaf7;
    --ink: #1a1814;
    --muted: #6b6657;
    --line: #e7e2d6;
    --accent: #d6582a;
    --ok: #2f7a4a;
    --err: #b3361d;
    --radius: 14px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "SF Pro Text", sans-serif;
    -webkit-font-smoothing: antialiased; }
  .wrap {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px 16px;
  }
  .card {
    width: 100%;
    max-width: 460px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: clamp(20px, 4vw, 32px);
    box-shadow: 0 1px 2px rgba(0,0,0,.03);
  }
  .mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px; height: 36px;
    background: var(--ink); color: #fff;
    border-radius: 8px;
    font-weight: 700; font-size: 14px;
    letter-spacing: .02em;
  }
  h1 { font-size: clamp(20px, 3.5vw, 24px); margin: 16px 0 6px; line-height: 1.2; }
  p.sub { color: var(--muted); margin: 0 0 20px; line-height: 1.5; font-size: 15px; }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--ink); }
  input[type=email] {
    width: 100%;
    font: inherit;
    font-size: 16px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #fff;
    color: var(--ink);
    min-height: 44px;
  }
  input[type=email]:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
  button {
    width: 100%;
    font: inherit;
    font-weight: 600;
    font-size: 15px;
    padding: 12px 16px;
    background: var(--ink);
    color: #fff;
    border: 0;
    border-radius: 10px;
    cursor: pointer;
    min-height: 44px;
    margin-top: 16px;
  }
  button:disabled { opacity: .5; cursor: progress; }
  .msg { margin-top: 14px; padding: 10px 12px; border-radius: 8px; font-size: 14px; line-height: 1.45; }
  .msg.ok  { background: #ecf6ef; color: var(--ok);  border: 1px solid #c9e6d3; }
  .msg.err { background: #fbece8; color: var(--err); border: 1px solid #f0c8bd; }
  .foot { margin-top: 18px; font-size: 12px; color: var(--muted); line-height: 1.5; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .done .form { display: none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card" id="card">
    <div class="mark">FF</div>
    <h1>Connect your Discord to FounderFirst</h1>
    <p class="sub">
      Enter the email Penny already knows about. We'll confirm the link so the bot can pick up
      where you left off — no repeating yourself.
    </p>
    <form class="form" id="form" novalidate>
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com" />
      <button type="submit" id="submit">Connect</button>
    </form>
    <div id="msg" class="msg" style="display:none"></div>
    <p class="foot">
      Link expires in 15 minutes and works once. You can disconnect anytime from Discord by sending
      <code>/disconnect</code> to the bot.
    </p>
  </div>
</div>
<script>
(function(){
  var params = new URLSearchParams(location.search);
  var token = params.get("token");
  var form = document.getElementById("form");
  var btn  = document.getElementById("submit");
  var msg  = document.getElementById("msg");
  var card = document.getElementById("card");

  function show(kind, text) {
    msg.style.display = "block";
    msg.className = "msg " + kind;
    msg.textContent = text;
  }

  if (!token) {
    form.style.display = "none";
    show("err", "This link is missing its token. Re-open the link from your Discord DM.");
    return;
  }

  form.addEventListener("submit", function(e){
    e.preventDefault();
    var email = document.getElementById("email").value.trim();
    if (!email || email.indexOf("@") < 0) {
      show("err", "Please enter a valid email.");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Connecting…";
    msg.style.display = "none";

    fetch("/discord/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, email: email })
    }).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, body: j }; }); })
      .then(function(res){
        if (!res.ok || !res.body.ok) {
          var detail = (res.body && (res.body.detail || res.body.error)) || "Something went wrong.";
          show("err", detail);
          btn.disabled = false;
          btn.textContent = "Try again";
          return;
        }
        card.classList.add("done");
        show("ok", "You're connected. Head back to Discord — Penny has your context now.");
      })
      .catch(function(){
        show("err", "Network error. Try again in a moment.");
        btn.disabled = false;
        btn.textContent = "Try again";
      });
  });
})();
</script>
</body>
</html>`;
