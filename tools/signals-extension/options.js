// DEFAULT_ENDPOINT comes from config.js (loaded first in options.html) —
// shared with background.js, see config.js.

const $ = (id) => document.getElementById(id);

async function load() {
  const { endpoint, secret } = await chrome.storage.local.get(["endpoint", "secret"]);
  $("endpoint").value = endpoint || DEFAULT_ENDPOINT;
  $("secret").value = secret || "";
}

async function save() {
  const endpoint = $("endpoint").value.trim() || DEFAULT_ENDPOINT;
  const secret = $("secret").value.trim();
  const status = $("status");
  if (!secret) {
    status.textContent = "Enter the intake secret.";
    status.className = "status err";
    return;
  }
  await chrome.storage.local.set({ endpoint, secret });
  status.textContent = "Saved. Capture buttons are now live in Facebook groups.";
  status.className = "status ok";
}

document.addEventListener("DOMContentLoaded", load);
$("save").addEventListener("click", save);
