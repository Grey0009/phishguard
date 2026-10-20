"use strict";
importScripts("client_detector.js");
/*
 * PhishGuard service worker (Manifest V3)
 *
 * Two-stage pipeline (keeps the common case fast and private):
 *   Stage 1  webNavigation.onBeforeNavigate -> POST /v1/analyze/url          (URL + lexical graph + homoglyph; no page data)
 *   Stage 2  tab 'complete'                  -> POST /v1/analyze  {url, dom} (DOM structure summary)
 *   Stage 3  only if the server asks         -> POST /v1/analyze  {url, dom, screenshot_b64}  (downscaled screenshot)
 * Trusted domains stop after stage 1; conclusive verdicts skip stage 3.
 */

const DEFAULTS = {
  enabled: true,
  liquidGlass: true,
  linkHoverHud: true,
  driveByDefuser: true,
  stealthAdblock: true,
  phishingShield: true,
  autoBlock: true,
  banner: true,
  allowlist: [],
  apiBase: "http://127.0.0.1:8000",
  apiKey: "",
  mode: "auto",            // "url" = URL only | "auto" = URL + DOM (+ screenshot when asked) | "always" = always send a screenshot
  blockThreshold: 0.85,
};
const CACHE_TTL_MS = 10 * 60 * 1000;
const BYPASS_MS = 30 * 60 * 1000;
const SHOT_WIDTH = 480;

const urlCache = new Map();       // url -> { ts, result }
const tabSeq = new Map();         // tabId -> sequence (drops stale async results after navigation)
const tabUrl = new Map();         // tabId -> last URL seen
const pendingShot = new Set();    // tabIds waiting to become active for a screenshot
const inflight = new Set();       // "tabId|url" currently being deep-scanned

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isHttp = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
const stripHash = (u) => String(u || "").split("#")[0];

/* ---------------------------------------------------------- stats */
const _counted = new Set();      // "tabId|url" already counted in this session
async function trackStats(tabId, url, verdict) {
  const key = tabId + "|" + url;
  if (_counted.has(key)) return;  // only count each page once per navigation
  _counted.add(key);
  const { pgStats = { scanned: 0, threats: 0 } } = await chrome.storage.local.get("pgStats");
  pgStats.scanned++;
  if (verdict === "phishing" || verdict === "suspicious") pgStats.threats++;
  await chrome.storage.local.set({ pgStats });
}
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch (_) { return ""; } };
const originOf = (u) => { try { return new URL(u).origin; } catch (_) { return ""; } };

async function getSettings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  s.blockThreshold = Number(s.blockThreshold) || DEFAULTS.blockThreshold;
  s.allowlist = Array.isArray(s.allowlist) ? s.allowlist : [];
  return s;
}

function isAllowlisted(host, list) {
  return list.some((d) => host === d || host.endsWith("." + d));
}

/* ------------------------------------------------------------------ API */
async function api(settings, path, body, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { "Content-Type": "application/json" };
    if (settings.apiKey) headers["X-API-Key"] = settings.apiKey;
    const res = await fetch(settings.apiBase.replace(/\/+$/, "") + path, {
      method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { msg += ": " + (await res.json()).error; } catch (_) { /* ignore */ }
      throw new Error(msg);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------ cross-browser session store */
// Uses chrome.storage.session when available (Chromium/Firefox), transparently falls back to chrome.storage.local + memory for Safari
const _memSession = new Map();
const sessionStore = {
  async get(key) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
      try {
        return await chrome.storage.session.get(key);
      } catch (_) {}
    }
    const prefix = "_pg_sess_";
    if (typeof key === "string") {
      if (_memSession.has(key)) return { [key]: _memSession.get(key) };
      try {
        const res = await chrome.storage.local.get(prefix + key);
        const val = res[prefix + key];
        if (val !== undefined) _memSession.set(key, val);
        return { [key]: val };
      } catch (_) {
        return { [key]: _memSession.get(key) };
      }
    }
    if (Array.isArray(key)) {
      const out = {};
      const missing = [];
      for (const k of key) {
        if (_memSession.has(k)) out[k] = _memSession.get(k);
        else missing.push(prefix + k);
      }
      if (missing.length > 0) {
        try {
          const res = await chrome.storage.local.get(missing);
          for (const k of key) {
            if (out[k] === undefined && res[prefix + k] !== undefined) {
              out[k] = res[prefix + k];
              _memSession.set(k, res[prefix + k]);
            }
          }
        } catch (_) {}
      }
      return out;
    }
    return {};
  },
  async set(obj) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
      try {
        await chrome.storage.session.set(obj);
        return;
      } catch (_) {}
    }
    const localObj = {};
    for (const [k, v] of Object.entries(obj || {})) {
      _memSession.set(k, v);
      localObj["_pg_sess_" + k] = v;
    }
    try {
      await chrome.storage.local.set(localObj);
    } catch (_) {}
  },
  async remove(keys) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
      try {
        await chrome.storage.session.remove(keys);
        return;
      } catch (_) {}
    }
    const arr = Array.isArray(keys) ? keys : [keys];
    const localKeys = [];
    arr.forEach((k) => {
      _memSession.delete(k);
      localKeys.push("_pg_sess_" + k);
    });
    try {
      await chrome.storage.local.remove(localKeys);
    } catch (_) {}
  }
};

/* ------------------------------------------------------------ state/badge */
async function saveState(tabId, state) { await sessionStore.set({ ["tab:" + tabId]: state }); }
async function loadState(tabId) { return (await sessionStore.get("tab:" + tabId))["tab:" + tabId] || null; }

const BADGE = {
  safe: { text: "\u2713", color: "#16a34a" },
  suspicious: { text: "!", color: "#d97706" },
  phishing: { text: "\u2716", color: "#dc2626" },
  error: { text: "?", color: "#64748b" },
  off: { text: "", color: "#64748b" },
};
function paint(tabId, kind, title) {
  const b = BADGE[kind] || BADGE.off;
  chrome.action.setBadgeText({ tabId, text: b.text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: b.color }).catch(() => {});
  chrome.action.setTitle({ tabId, title }).catch(() => {});
}

function bump(tabId) {
  const n = (tabSeq.get(tabId) || 0) + 1;
  tabSeq.set(tabId, n);
  return n;
}

async function isBypassed(url) {
  const { bypass = {} } = await sessionStore.get("bypass");
  const exp = bypass[originOf(url)];
  return !!exp && exp > Date.now();
}
async function addBypass(url) {
  const { bypass = {} } = await sessionStore.get("bypass");
  bypass[originOf(url)] = Date.now() + BYPASS_MS;
  await sessionStore.set({ bypass });
}

function cached(url) {
  const hit = urlCache.get(url);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.result;
  urlCache.delete(url);
  return null;
}

/* Banner + blocking page (kept separate from commit so a pending screenshot never gets our own banner in it). */
async function showUi(tabId, url, result, settings) {
  if (result.verdict !== "safe" && settings.banner) {
    chrome.tabs.sendMessage(tabId, {
      type: "PG_BANNER",
      result: { verdict: result.verdict, risk: result.risk, brand: result.brand, reasons: result.reasons.slice(0, 3) },
    }).catch(() => {});
  }
  await maybeBlock(tabId, url, result, settings);
}

/* Record a result (unless stale), update badge; show UI unless deferUi (a screenshot is about to be taken). */
async function commit(tabId, url, result, seq, settings, deferUi = false) {
  if (tabSeq.get(tabId) !== seq) return false;                    // user navigated meanwhile
  await saveState(tabId, { url, result, ts: Date.now(), error: null });
  const v = (result && result.verdict) || "safe";
  const rVal = typeof (result && result.risk) === "number" ? result.risk : 0;
  const label = `${v.toUpperCase()} (${Math.round(rVal * 100)}%)` +
    (result && result.brand ? ` \u2013 ${result.brand}` : "");
  paint(tabId, v, "PhishGuard: " + label);
  trackStats(tabId, url, v);                        // ← persistent stats
  chrome.tabs.sendMessage(tabId, { type: "PG_VERDICT_UPDATE", result }).catch(() => {});
  if (!deferUi) await showUi(tabId, url, result, settings);
  return true;
}

async function commitError(tabId, url, err, seq) {
  if (tabSeq.get(tabId) !== seq) return;
  await saveState(tabId, { url, result: null, ts: Date.now(), error: String(err && err.message || err) });
  paint(tabId, "error", "PhishGuard: backend unreachable \u2013 page not analysed");
}

async function maybeBlock(tabId, url, result, settings) {
  if (!settings.autoBlock || result.verdict !== "phishing" || result.risk < settings.blockThreshold) return false;
  if (await isBypassed(url)) return false;
  const t = await chrome.tabs.get(tabId).catch(() => null);
  if (!t) return false;
  if ((t.url || "").startsWith(chrome.runtime.getURL(""))) return false;     // already showing our warning page
  // (stale results are already dropped by the per-tab sequence check in commit(); pendingUrl is not
  //  reliably set yet for brand-new tabs, so it must not be used here)
  await chrome.tabs.update(tabId, { url: chrome.runtime.getURL("warning.html") + "?u=" + encodeURIComponent(url) });
  return true;
}

/* ----------------------------------------------------------- stage 1: URL */
async function urlStage(settings, url) {
  const hit = cached(url);
  if (hit) return hit;
  let result = null;
  try {
    // Check local or remote backend with fast timeout so navigation is never blocked
    result = await api(settings, "/v1/analyze/url", { url, include_graph: true }, 600);
  } catch (_) {
    // 100% In-browser fallback: zero latency, zero backend requirement
    if (typeof PhishGuardDetector !== "undefined") {
      result = PhishGuardDetector.analyzeUrl(url, settings.allowlist || []);
    }
  }
  if (!result && typeof PhishGuardDetector !== "undefined") {
    result = PhishGuardDetector.analyzeUrl(url, settings.allowlist || []);
  }
  if (result) {
    urlCache.set(url, { ts: Date.now(), result });
    if (urlCache.size > 500) urlCache.delete(urlCache.keys().next().value);
  }
  return result;
}

async function urlFlow(tabId, url, seq) {
  const settings = await getSettings();
  if (settings.enabled === false) { paint(tabId, "off", "PhishGuard: protection paused"); return; }
  if (settings.phishingShield === false) { paint(tabId, "off", "PhishGuard: phishing shield disabled"); return; }
  if (isAllowlisted(hostOf(url), settings.allowlist)) {
    const h = hostOf(url);
    const safeResult = {
      verdict: "safe",
      risk: 0.0,
      brand: null,
      stage: "allowlist",
      host: h,
      registrable_domain: h,
      reasons: [{ code: "allowlisted", message: "Domain is in your trusted allowlist" }]
    };
    await commit(tabId, url, safeResult, seq, settings);
    paint(tabId, "safe", "PhishGuard: site is on your allow-list");
    return;
  }
  if (await isBypassed(url)) { paint(tabId, "suspicious", "PhishGuard: you chose to proceed on this site"); return; }
  try {
    const result = await urlStage(settings, url);
    if (result) {
      await commit(tabId, url, result, seq, settings);
    }
  } catch (err) {
    if (typeof PhishGuardDetector !== "undefined") {
      const fallback = PhishGuardDetector.analyzeUrl(url, settings.allowlist || []);
      await commit(tabId, url, fallback, seq, settings);
    } else {
      await commitError(tabId, url, err, seq);
    }
  }
}

/* ----------------------------------------------- stage 2/3: DOM + screenshot */
async function collectDom(tabId) {
  const ask = () => chrome.tabs.sendMessage(tabId, { type: "PG_COLLECT" });
  try { const r = await ask(); if (r && r.ok) return r.dom; } catch (_) { /* content script not there yet */ }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    const r = await ask();
    if (r && r.ok) return r.dom;
  } catch (_) { /* restricted page */ }
  return null;
}

let captureChain = Promise.resolve();
let lastCapture = 0;
function captureQueue(fn) {            // captureVisibleTab is quota-limited (~2/s) -> serialise + space out
  const run = captureChain.then(async () => {
    const wait = Math.max(0, lastCapture + 700 - Date.now());
    if (wait) await sleep(wait);
    try { return await fn(); } finally { lastCapture = Date.now(); }
  });
  captureChain = run.catch(() => {});
  return run;
}

async function shrinkToB64(dataUrl, maxW) {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxW / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
  const bytes = new Uint8Array(await out.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* Screenshot of tab `tab` ONLY if it is the visible tab (captureVisibleTab captures whatever is active). */
async function grabScreenshot(tab) {
  const activeNow = async () => (await chrome.tabs.query({ active: true, windowId: tab.windowId }))[0];
  const a = await activeNow();
  if (!a || a.id !== tab.id) return null;
  return captureQueue(async () => {
    const again = await activeNow();
    if (!again || again.id !== tab.id || stripHash(again.url) !== stripHash(tab.url)) return null;
    await setBanner(tab.id, false);                          // our own banner must not appear in the screenshot
    try {
      await sleep(120);                                      // let the compositor drop the banner
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 60 });
      return await shrinkToB64(dataUrl, SHOT_WIDTH);
    } finally {
      await setBanner(tab.id, true);
    }
  });
}

function setBanner(tabId, visible) {
  return chrome.tabs.sendMessage(tabId, { type: "PG_BANNER_VISIBLE", visible }).catch(() => {});
}

async function deepScan(tabId, force = false) {
  const settings = await getSettings();
  if (settings.enabled === false || settings.phishingShield === false) return;
  if (settings.mode === "url" && !force) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !isHttp(tab.url)) return;
  const url = tab.url;
  const key = tabId + "|" + url;
  if (inflight.has(key)) return;
  if (isAllowlisted(hostOf(url), settings.allowlist) || (await isBypassed(url))) return;
  inflight.add(key);
  const seq = tabSeq.get(tabId) || bump(tabId);
  try {
    const first = cached(url) || (await urlStage(settings, url));
    if (first.trusted) { await commit(tabId, url, first, seq, settings); return; }   // never read pages of trusted domains
    const dom = await collectDom(tabId);
    if (!dom) return;
    let result = null;
    try {
      result = await api(settings, "/v1/analyze", { url, dom, include_graph: true }, 800);
    } catch (_) {
      // In-browser structural DOM auditor fallback
      if (typeof PhishGuardDetector !== "undefined") {
        result = PhishGuardDetector.analyzeFull(url, dom, settings.allowlist || []);
      }
    }
    if (!result && typeof PhishGuardDetector !== "undefined") {
      result = PhishGuardDetector.analyzeFull(url, dom, settings.allowlist || []);
    }
    if (!result) return;

    const wantShot = (result.request_screenshot || settings.mode === "always") && !result.trusted;
    if (!(await commit(tabId, url, result, seq, settings, wantShot))) return;
    if (wantShot) {
      let shot = null;
      try { shot = await grabScreenshot(tab); } catch (_) { shot = null; }
      if (!shot) {                                           // tab not visible: show what we know, retry when it is
        pendingShot.add(tabId);
        await showUi(tabId, url, result, settings);
        return;
      }
      try {
        result = await api(settings, "/v1/analyze", { url, dom, screenshot_b64: shot, include_graph: true }, 1500);
        await commit(tabId, url, result, seq, settings);
      } catch (_) {}
    }
  } catch (err) {
    if (typeof PhishGuardDetector !== "undefined") {
      const fallback = PhishGuardDetector.analyzeUrl(url, settings.allowlist || []);
      await commit(tabId, url, fallback, seq, settings);
    } else {
      await commitError(tabId, url, err, seq);
    }
  } finally {
    inflight.delete(key);
  }
}

/* ------------------------------------------------------------ brand learning */
async function registerBrand(brand, domains) {
  const settings = await getSettings();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !isHttp(tab.url)) throw new Error("Open the REAL login page in the active tab first");
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 80 });
  const shot = await shrinkToB64(dataUrl, SHOT_WIDTH);
  urlCache.clear();                                    // brand DB changed -> cached verdicts are stale
  return api(settings, "/v1/brands/templates", { brand, domains, screenshot_b64: shot });
}

/* ---------------------------------------------------------------- listeners */
chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (d.frameId !== 0 || !isHttp(d.url)) return;
  tabUrl.set(d.tabId, d.url);
  urlFlow(d.tabId, d.url, bump(d.tabId));
});

chrome.webNavigation.onHistoryStateUpdated.addListener(async (d) => {   // SPA route changes
  if (d.frameId !== 0 || !isHttp(d.url)) return;
  if (stripHash(tabUrl.get(d.tabId)) === stripHash(d.url)) return;
  tabUrl.set(d.tabId, d.url);
  const seq = bump(d.tabId);
  await urlFlow(d.tabId, d.url, seq);
  await sleep(800);
  deepScan(d.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const currentUrl = info.url || (tab && tab.url);
  if (currentUrl && isHttp(currentUrl) && stripHash(tabUrl.get(tabId)) !== stripHash(currentUrl)) {
    tabUrl.set(tabId, currentUrl);
    urlFlow(tabId, currentUrl, bump(tabId));
  }
  if (info.status === "complete" && isHttp(tab.url)) deepScan(tabId);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (pendingShot.has(tabId)) { pendingShot.delete(tabId); deepScan(tabId, true); }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabSeq.delete(tabId); tabUrl.delete(tabId); pendingShot.delete(tabId);
  sessionStore.remove("tab:" + tabId).catch(() => {});
});

/* Pages that were already open when the extension was installed / the browser started. */
async function scanOpenTabs() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (!isHttp(t.url)) continue;
    tabUrl.set(t.id, t.url);
    await urlFlow(t.id, t.url, bump(t.id));
    deepScan(t.id);
  }
}
chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === "install") chrome.runtime.openOptionsPage();
  scanOpenTabs();
});
chrome.runtime.onStartup.addListener(scanOpenTabs);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled !== undefined) {
    if (changes.enabled.newValue === false) {
      chrome.tabs.query({}).then((tabs) => {
        tabs.forEach((t) => paint(t.id, "off", "PhishGuard: protection paused"));
      });
    } else if (changes.enabled.newValue === true) {
      scanOpenTabs();
    }
  }
});

/* ---------------------------------------------------------- drive-by download defuser */
if (chrome.downloads && chrome.downloads.onCreated) {
  chrome.downloads.onCreated.addListener(async (item) => {
    try {
      const settings = await getSettings();
      if (!settings.enabled || !settings.driveByDefuser) return;

      const filename = (item.filename || "").toLowerCase();
      const url = (item.url || "").toLowerCase();
      const dangerousExts = [".dmg", ".pkg", ".exe", ".iso", ".crx", ".vbs", ".bat", ".scr", ".msi", ".zip", ".rar", ".7z"];
      const isDangerous = dangerousExts.some((ext) => filename.endsWith(ext) || url.includes(ext));

      if (!isDangerous) return;

      const referrerHost = hostOf(item.referrer || item.url);
      if (referrerHost && isAllowlisted(referrerHost, settings.allowlist)) return;

      // Pause download to prevent silent drive-by payload drops
      await chrome.downloads.pause(item.id);

      // Increment trap count in stats
      const { pgAdStats = { ads: 0, popups: 0, traps: 0 } } = await chrome.storage.local.get("pgAdStats");
      pgAdStats.traps = (pgAdStats.traps || 0) + 1;
      await chrome.storage.local.set({ pgAdStats });

      // Notify initiating tab
      if (item.tabId && item.tabId > 0) {
        chrome.tabs.sendMessage(item.tabId, {
          type: "PG_DRIVEBY_BLOCKED",
          downloadId: item.id,
          filename: item.filename || "Suspicious Download Payload",
          url: item.url,
        }).catch(() => {});
      }
    } catch (_) {}
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // only our own pages (popup / options / warning) or tabs may talk to the worker
  const isSelf = Boolean(sender.id && chrome.runtime.id && sender.id === chrome.runtime.id);
  const isExtensionPage = isSelf || Boolean(sender.url && (
    sender.url.startsWith(chrome.runtime.getURL("")) ||
    sender.url.includes("-extension://") ||
    sender.url.startsWith("safari-web-extension://") ||
    sender.url.startsWith("moz-extension://")
  ));
  const isTabContent = Boolean(sender.tab && sender.tab.id);
  if (!isExtensionPage && !isTabContent) {
    sendResponse({ ok: false, error: "forbidden" });
    return false;
  }
  (async () => {
    switch (msg && msg.type) {
      case "PG_GET_STATE": {
        let tabId = msg.tabId;
        if (!tabId) {
          try {
            const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (activeTab && activeTab.id) tabId = activeTab.id;
          } catch (_) {}
        }
        if (!tabId) return null;
        let st = await loadState(tabId);
        const t = await chrome.tabs.get(tabId).catch(() => null);
        const tUrl = t && (t.url || t.pendingUrl);
        const isStale = !st || !st.result || (tUrl && st.url && stripHash(st.url) !== stripHash(tUrl));
        if (isStale) {
          if (t && isHttp(tUrl)) {
            const seq = bump(tabId);
            tabUrl.set(tabId, tUrl);
            await urlFlow(tabId, tUrl, seq);
            st = await loadState(tabId);
            deepScan(tabId);
          }
        }
        return st;
      }
      case "PG_RESCAN": {
        let tabId = msg.tabId;
        if (!tabId) {
          try {
            const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (activeTab && activeTab.id) tabId = activeTab.id;
          } catch (_) {}
        }
        if (!tabId) return null;
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        const tUrl = tab && (tab.url || tab.pendingUrl);
        if (!tab || !tUrl) return null;
        urlCache.delete(tUrl);
        const seq = bump(tabId);
        paint(tabId, "off", "PhishGuard: scanning\u2026");
        await urlFlow(tabId, tUrl, seq);
        await deepScan(tabId, true);
        return loadState(tabId);
      }
      case "PG_TRUST": {
        const s = await getSettings();
        const h = hostOf(msg.url);
        if (h && !s.allowlist.includes(h)) await chrome.storage.local.set({ allowlist: [...s.allowlist, h] });
        return true;
      }
      case "PG_UNTRUST": {
        const s = await getSettings();
        const h = hostOf(msg.url);
        if (h) await chrome.storage.local.set({ allowlist: s.allowlist.filter((x) => x !== h) });
        return true;
      }
      case "PG_RESUME_DOWNLOAD": {
        if (msg.downloadId && chrome.downloads) {
          await chrome.downloads.resume(msg.downloadId);
          return true;
        }
        return false;
      }
      case "PG_CANCEL_DOWNLOAD": {
        if (msg.downloadId && chrome.downloads) {
          await chrome.downloads.cancel(msg.downloadId);
          return true;
        }
        return false;
      }
      case "PG_BYPASS": await addBypass(msg.url); return true;
      case "PG_FEEDBACK": {
        const s = await getSettings();
        return api(s, "/v1/feedback", { url: msg.url, label: msg.label });
      }
      case "PG_REGISTER_BRAND": return registerBrand(msg.brand, msg.domains || []);
      default: throw new Error("unknown message");
    }
  })().then((data) => sendResponse({ ok: true, data }), (e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

/* -------------------------------------------------- storage changes sync */
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.enabled !== undefined) {
    const isEn = changes.enabled.newValue !== false;
    if (!isEn) {
      const tabs = await chrome.tabs.query({});
      tabs.forEach((t) => {
        if (t.id) paint(t.id, "off", "PhishGuard: protection paused");
      });
    } else {
      urlCache.clear();
      let [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
      if (!activeTab) [activeTab] = await chrome.tabs.query({ active: true }).catch(() => []);
      if (activeTab && activeTab.id && isHttp(activeTab.url)) {
        const seq = bump(activeTab.id);
        await urlFlow(activeTab.id, activeTab.url, seq);
        await deepScan(activeTab.id, true);
      }
    }
  }
  if (changes.allowlist !== undefined || changes.mode !== undefined) {
    urlCache.clear();
  }
});
