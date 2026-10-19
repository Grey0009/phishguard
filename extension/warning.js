"use strict";
const $ = (id) => document.getElementById(id);
const target = new URLSearchParams(location.search).get("u") || "";
const safeTarget = /^https?:\/\//i.test(target) ? target : "";
$("url").textContent = safeTarget || "(invalid address)";

/* ─── populate verdict details ──────────────────────────────── */
(async () => {
  const tab = await chrome.tabs.getCurrent();
  const tabId = tab && tab.id;
  let st = null;
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
    try {
      const key = "tab:" + tabId;
      st = (await chrome.storage.session.get(key))[key];
    } catch (_) {}
  }
  if (!st && tabId) {
    try {
      const res = await chrome.runtime.sendMessage({ type: "PG_GET_STATE", tabId });
      if (res && res.ok && res.data) st = res.data;
    } catch (_) {}
  }
  if (!st && tabId) {
    try {
      const res = await chrome.storage.local.get("_pg_sess_tab:" + tabId);
      st = res["_pg_sess_tab:" + tabId];
    } catch (_) {}
  }
  if (st && st.result) {
    $("risk").textContent = Math.round(st.result.risk * 100) + "%";
    if (st.result.brand) $("brand").textContent = " by impersonating " + st.result.brand;
    st.result.reasons.slice(0, 5).forEach((r) => {
      const li = document.createElement("li");
      li.textContent = r.message;
      $("reasons").appendChild(li);
    });
  }
})();

/* ─── 5-second countdown (anti-click-jacking) ───────────────── */
let remaining = 5;
const countdownEl = $("countdown");
const goBtn = $("go");

const timer = setInterval(() => {
  remaining--;
  countdownEl.textContent = remaining;
  if (remaining <= 0) {
    clearInterval(timer);
    goBtn.disabled = false;
    goBtn.textContent = "I understand the risk – continue anyway";
  }
}, 1000);

/* ─── navigation ────────────────────────────────────────────── */
$("back").addEventListener("click", () => {
  if (history.length > 1) history.back(); else window.close();
});

$("go").addEventListener("click", async () => {
  if (!safeTarget || goBtn.disabled) return;
  await chrome.runtime.sendMessage({ type: "PG_BYPASS", url: safeTarget });
  location.href = safeTarget;
});
