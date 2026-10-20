"use strict";
/*
 * PhishGuard content script.
 *  - PG_COLLECT : returns a STRUCTURAL summary of the page (counts, form targets, title, short visible text).
 *                 It never reads values typed into inputs.
 *  - PG_BANNER  : shows a warning banner inside a closed shadow root (page scripts cannot restyle/read it).
 */
(() => {
  if (window.__pgLoaded) return;
  window.__pgLoaded = true;

  const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "nic", "res"]);

  function regDomain(host) {
    host = (host || "").toLowerCase();
    if (/^[\d.]+$/.test(host) || host.includes(":")) return host;            // IPv4 / IPv6
    const p = host.split(".");
    if (p.length <= 2) return host;
    const n = p[p.length - 1].length === 2 && SECOND_LEVEL.has(p[p.length - 2]) ? 3 : 2;
    return p.slice(-n).join(".");
  }
  const here = regDomain(location.hostname);

  function absHref(u) {
    try { return new URL(u, location.href).href; } catch (_) { return ""; }
  }

  const COMMON_CDNS = new Set([
    "cloudflare.com", "cloudfront.net", "akamaihd.net", "akamaized.net", "fastly.net",
    "jsdelivr.net", "googleapis.com", "gstatic.com", "googleusercontent.com",
    "unpkg.com", "azureedge.net", "fbcdn.net", "twimg.com", "ytimg.com", "wp.com"
  ]);

  function isExternal(u) {
    try {
      const x = new URL(u, location.href);
      if (!/^https?:$/.test(x.protocol)) return false;
      const reg = regDomain(x.hostname);
      if (reg === here) return false;
      const hereSld = here.split(".")[0];
      if (hereSld && hereSld.length >= 4 && reg.includes(hereSld)) return false;
      if (COMMON_CDNS.has(reg)) return false;
      return true;
    } catch (_) { return false; }
  }

  const SENSITIVE = /(cvv|cvc|card.?n(um|o)|otp|aadhaar|aadhar|\bpan\b|upi.?pin|\bssn\b|mpin|atm.?pin)/i;
  const SENSITIVE_AC = /(cc-number|cc-csc|cc-exp|one-time-code)/i;

  function isHidden(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) return true;
    const cs = getComputedStyle(el);
    return cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0";
  }

  function collect() {
    const forms = Array.from(document.forms).slice(0, 20).map((f) => {
      const raw = f.getAttribute("action");               // (f.action can be clobbered by <input name=action>)
      return {
        action: raw ? absHref(raw) : "",
        method: (f.getAttribute("method") || "get").toLowerCase(),
        hasPassword: !!f.querySelector('input[type="password"]'),
        inputs: f.querySelectorAll("input,select,textarea").length,
      };
    });

    const anchors = Array.from(document.querySelectorAll("a[href]")).slice(0, 1500);
    let ext = 0, nullish = 0;
    for (const a of anchors) {
      const h = (a.getAttribute("href") || "").trim().toLowerCase();
      if (h === "" || h === "#" || h.startsWith("javascript:")) nullish++;
      else if (isExternal(h)) ext++;
    }

    const resEls = Array.from(document.querySelectorAll(
      'script[src], img[src], link[rel~="stylesheet"][href]')).slice(0, 1500);
    let resExt = 0;
    for (const el of resEls) if (isExternal(el.getAttribute("src") || el.getAttribute("href"))) resExt++;

    const iframes = Array.from(document.querySelectorAll("iframe")).slice(0, 100);
    let hidden = 0, ifExt = 0;
    for (const f of iframes) {
      if (isHidden(f)) hidden++;
      const s = f.getAttribute("src");
      if (s && isExternal(s)) ifExt++;
    }

    let sensitive = 0;
    for (const i of Array.from(document.querySelectorAll("input")).slice(0, 500)) {
      const probe = [i.name, i.id, i.placeholder, i.getAttribute("aria-label")].join(" ");
      if (SENSITIVE.test(probe) || SENSITIVE_AC.test(i.getAttribute("autocomplete") || "")) sensitive++;
    }

    const icon = document.querySelector('link[rel~="icon"][href]');
    const bodyText = (document.body && document.body.innerText) || "";
    return {
      title: (document.title || "").slice(0, 300),
      text: bodyText.slice(0, 3000).toLowerCase(),
      textLength: bodyText.length,
      forms,
      passwordInputs: document.querySelectorAll('input[type="password"]').length,
      inputCount: document.querySelectorAll('input:not([type="hidden"])').length,
      sensitiveFields: sensitive,
      links: { total: anchors.length, external: ext, nullish },
      resources: { total: resEls.length, external: resExt },
      iframes: { total: iframes.length, hidden, external: ifExt },
      favicon: icon ? absHref(icon.getAttribute("href")) : "",
      metaRefresh: !!document.querySelector('meta[http-equiv="refresh" i]'),
      rightClickBlocked: !!(document.oncontextmenu || (document.body && document.body.oncontextmenu) ||
        document.querySelector("[oncontextmenu]")),
      scriptCount: document.scripts.length,
    };
  }

  const COLORS = {
    phishing: { bg: "#7f1d1d", fg: "#fff", accent: "#fecaca" },
    suspicious: { bg: "#78350f", fg: "#fff", accent: "#fde68a" },
  };

  function showBanner(res) {
    const id = "__phishguard_banner__";
    const old = document.getElementById(id);
    if (old) old.remove();
    const c = COLORS[res.verdict] || COLORS.suspicious;
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = "all:initial;position:fixed;top:0;left:0;right:0;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      .bar{font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif;background:${c.bg};color:${c.fg};padding:10px 16px;
           display:flex;gap:14px;align-items:flex-start;box-shadow:0 2px 12px rgba(0,0,0,.4)}
      .t{font-weight:700} .why{margin:4px 0 0;padding-left:18px;color:${c.accent};font-size:13px}
      .x{margin-left:auto;background:transparent;border:1px solid ${c.accent};color:${c.fg};border-radius:6px;
         padding:4px 10px;cursor:pointer;font:inherit} .x:hover{background:rgba(255,255,255,.15)}`;
    const bar = document.createElement("div");
    bar.className = "bar";
    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "t";
    title.textContent = (res.verdict === "phishing" ? "\u26A0 Likely phishing page" : "\u26A0 Suspicious page") +
      (res.brand ? " \u2013 pretending to be " + res.brand : "") + "  (risk " + Math.round(res.risk * 100) + "%)";
    const ul = document.createElement("ul");
    ul.className = "why";
    (res.reasons || []).forEach((r) => { const li = document.createElement("li"); li.textContent = r.message; ul.appendChild(li); });
    body.append(title, ul);
    const close = document.createElement("button");
    close.className = "x";
    close.textContent = "Dismiss";
    close.addEventListener("click", () => host.remove());
    bar.append(body, close);
    root.append(style, bar);
    document.documentElement.appendChild(host);
  }

  let currentVerdict = null;

  /* ─── Active Credential Guard ───────────────────────────── */
  function showCredentialAlert(inputEl, reasonText) {
    const id = "__phishguard_credential_guard__";
    if (document.getElementById(id)) return; // already showing

    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = "all:initial;position:fixed;bottom:24px;right:24px;z-index:2147483647;pointer-events:auto;";
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideInUp {
        from { opacity: 0; transform: translateY(20px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes pulseGlow {
        0%, 100% { box-shadow: 0 10px 30px -5px rgba(239, 68, 68, 0.4), inset 0 1px 1px 0 rgba(255, 255, 255, 0.25); }
        50% { box-shadow: 0 15px 40px -2px rgba(239, 68, 68, 0.65), inset 0 1px 1px 0 rgba(255, 255, 255, 0.4); }
      }
      .card {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(24px) saturate(190%);
        -webkit-backdrop-filter: blur(24px) saturate(190%);
        border: 1px solid rgba(239, 68, 68, 0.35);
        border-radius: 16px;
        color: #f8fafc;
        padding: 16px 18px;
        width: 320px;
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6), inset 0 1px 1px 0 rgba(255, 255, 255, 0.25);
        animation: slideInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1), pulseGlow 3s infinite ease-in-out;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .header {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .icon-shield {
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
      }
      .title-wrap {
        flex: 1;
      }
      .title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: #fecaca;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .badge {
        font-size: 10px;
        font-weight: 800;
        background: rgba(239, 68, 68, 0.25);
        color: #f87171;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .subtitle {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 1px;
      }
      .msg {
        font-size: 12px;
        line-height: 1.45;
        color: #e2e8f0;
      }
      .actions {
        display: flex;
        gap: 8px;
        margin-top: 2px;
      }
      .btn {
        flex: 1;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 8px;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
        text-align: center;
      }
      .btn-dismiss {
        background: rgba(255, 255, 255, 0.08);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      .btn-dismiss:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #ffffff;
      }
    `;

    const card = document.createElement("div");
    card.className = "card";

    const header = document.createElement("div");
    header.className = "header";

    const icon = document.createElement("div");
    icon.className = "icon-shield";
    icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

    const titleWrap = document.createElement("div");
    titleWrap.className = "title-wrap";
    titleWrap.innerHTML = `
      <div class="title">Credential Guard <span class="badge">Caution</span></div>
      <div class="subtitle">${location.hostname}</div>
    `;

    header.append(icon, titleWrap);

    const msg = document.createElement("div");
    msg.className = "msg";
    msg.textContent = reasonText || "You are entering credentials on an unverified or potentially deceptive page. PhishGuard advises against typing passwords here.";

    const actions = document.createElement("div");
    actions.className = "actions";
    const dismissBtn = document.createElement("button");
    dismissBtn.className = "btn btn-dismiss";
    dismissBtn.textContent = "I Understand";
    dismissBtn.addEventListener("click", () => host.remove());

    actions.appendChild(dismissBtn);
    card.append(header, msg, actions);
    root.append(style, card);

    document.documentElement.appendChild(host);

    // Auto-dismiss after 15 seconds if not interacted with
    setTimeout(() => { if (document.getElementById(id)) host.remove(); }, 15000);
  }

  // Active listener for credential fields
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!el || !el.tagName || el.tagName.toLowerCase() !== "input") return;
    const isPassword = el.type === "password";
    const probe = [el.name, el.id, el.placeholder, el.getAttribute("autocomplete")].join(" ").toLowerCase();
    const isSensitive = isPassword || SENSITIVE.test(probe) || SENSITIVE_AC.test(probe);

    if (!isSensitive) return;

    // Check if form posts credentials externally
    const form = el.form;
    const formAction = form ? (form.getAttribute("action") ? absHref(form.getAttribute("action")) : location.href) : "";
    const isExtPost = formAction && isExternal(formAction);

    if (currentVerdict && (currentVerdict.verdict === "phishing" || currentVerdict.verdict === "suspicious" || currentVerdict.risk >= 0.40)) {
      const vStr = (currentVerdict.verdict || "suspicious").toUpperCase();
      const rRisk = typeof currentVerdict.risk === "number" ? Math.round(currentVerdict.risk * 100) : 50;
      showCredentialAlert(el, `PhishGuard flagged this domain as ${vStr} (${rRisk}% risk). Do not submit credentials here.`);
    } else if (isExtPost) {
      showCredentialAlert(el, `Security Warning: This form submits your sensitive credentials to an external third-party destination (${new URL(formAction).hostname}).`);
    }
  }, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return false;
    if (msg.type === "PG_COLLECT") {
      try { sendResponse({ ok: true, dom: collect() }); }
      catch (e) { sendResponse({ ok: false, error: String(e) }); }
    } else if (msg.type === "PG_BANNER_VISIBLE") {
      const b = document.getElementById("__phishguard_banner__");
      if (b) b.style.display = msg.visible ? "" : "none";
      sendResponse({ ok: true });
    } else if (msg.type === "PG_BANNER") {
      try {
        currentVerdict = msg.result || {};
        showBanner(currentVerdict);
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false, error: String(e) }); }
    } else if (msg.type === "PG_VERDICT_UPDATE") {
      currentVerdict = msg.result || {};
      sendResponse({ ok: true });
    } else if (msg.type === "PG_DRIVEBY_BLOCKED") {
      showDriveByAlert(msg.downloadId, msg.filename, msg.url);
      sendResponse({ ok: true });
    }
    return false;
  });

  // ─── Drive-by Download Alert Banner ────────────────────────────
  function showDriveByAlert(downloadId, filename) {
    let wrap = document.getElementById("__phishguard_driveby_toast__");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "__phishguard_driveby_toast__";
      wrap.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        max-width: 360px;
        background: rgba(18, 22, 36, 0.94);
        backdrop-filter: blur(30px) saturate(200%);
        -webkit-backdrop-filter: blur(30px) saturate(200%);
        border: 1px solid rgba(255, 69, 58, 0.45);
        border-radius: 16px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 20px rgba(255, 69, 58, 0.2);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', sans-serif;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
      document.documentElement.appendChild(wrap);
    }

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff453a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div style="line-height:1.25">
          <div style="font-weight:700;font-size:13px;color:#ff453a">Drive-by Download Paused</div>
          <div style="font-size:11px;color:rgba(235,235,245,0.7);margin-top:2px">Unprompted payload intercepted: <b style="color:#fff">${filename}</b></div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:2px">
        <button id="__pg_discard_dl__" style="background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:12px;font-weight:600;padding:6px 14px;border-radius:8px;cursor:pointer">Discard</button>
        <button id="__pg_allow_dl__" style="background:#ff453a;border:none;color:#fff;font-size:12px;font-weight:600;padding:6px 14px;border-radius:8px;cursor:pointer">Allow File</button>
      </div>
    `;

    wrap.querySelector("#__pg_discard_dl__").onclick = () => {
      chrome.runtime.sendMessage({ type: "PG_CANCEL_DOWNLOAD", downloadId }).catch(() => {});
      wrap.remove();
    };

    wrap.querySelector("#__pg_allow_dl__").onclick = () => {
      chrome.runtime.sendMessage({ type: "PG_RESUME_DOWNLOAD", downloadId }).catch(() => {});
      wrap.remove();
    };
  }

  // ─── Proactive Link Hover HUD ("Apple Peek") ───────────────────
  let hoverHudEl = null;
  let hoverHudTimeout = null;
  let isHoverHudEnabled = true;

  chrome.storage.local.get({ enabled: true, linkHoverHud: true }, (s) => {
    isHoverHudEnabled = s.enabled !== false && s.linkHoverHud !== false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.linkHoverHud !== undefined || changes.enabled !== undefined)) {
      chrome.storage.local.get({ enabled: true, linkHoverHud: true }, (s) => {
        isHoverHudEnabled = s.enabled !== false && s.linkHoverHud !== false;
        if (!isHoverHudEnabled && hoverHudEl) {
          hoverHudEl.style.display = "none";
        }
      });
    }
  });

  function getHoverHud() {
    if (!hoverHudEl) {
      hoverHudEl = document.createElement("div");
      hoverHudEl.id = "__phishguard_hover_hud__";
      hoverHudEl.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        pointer-events: none;
        display: none;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: rgba(15, 20, 32, 0.90);
        backdrop-filter: blur(24px) saturate(200%);
        -webkit-backdrop-filter: blur(24px) saturate(200%);
        border: 0.5px solid rgba(255, 255, 255, 0.22);
        border-radius: 9999px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.3);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', sans-serif;
        font-size: 11.5px;
        font-weight: 500;
        line-height: 1.2;
        letter-spacing: -0.01em;
        transition: opacity 0.15s ease, transform 0.15s ease;
        opacity: 0;
        transform: translateY(4px) scale(0.96);
      `;
      document.documentElement.appendChild(hoverHudEl);
    }
    return hoverHudEl;
  }

  const REDIRECT_HOSTS = new Set([
    "bit.ly", "tinyurl.com", "t.co", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "adf.ly"
  ]);

  const HIGH_PROFILE_BRANDS = ["apple", "google", "microsoft", "paypal", "netflix", "amazon", "facebook", "instagram", "chase", "bankofamerica", "binance", "coinbase"];

  function analyzeLink(urlStr, aEl) {
    try {
      const u = new URL(urlStr);
      const host = u.hostname.toLowerCase();
      const isShortener = REDIRECT_HOSTS.has(host) || host.endsWith(".bit.ly");
      const isExt = isExternal(urlStr);

      // 1. Deceptive Anchor Text Mismatch Detection
      let isMismatch = false;
      let mismatchClaim = "";
      if (aEl) {
        const txt = (aEl.innerText || aEl.textContent || "").trim().toLowerCase();
        const m = txt.match(/([a-z0-9-]+\.(?:com|org|net|co|in|edu|gov|io|ai|app|xyz|me))/i);
        if (m) {
          const claimed = m[1].toLowerCase();
          if (regDomain(claimed) !== regDomain(host)) {
            isMismatch = true;
            mismatchClaim = claimed;
          }
        }
      }

      // 2. Client Security Engine Evaluation
      let verdict = "safe";
      let risk = 0.0;
      let reason = "";
      let matchedBrand = null;

      if (typeof PhishGuardDetector !== "undefined") {
        const det = PhishGuardDetector.analyzeUrl(urlStr);
        verdict = det.verdict;
        risk = det.risk;
        matchedBrand = det.brand;
        if (det.reasons && det.reasons.length > 0) {
          reason = det.reasons[0].message;
        }
      } else {
        if (host.includes("xn--")) {
          verdict = "phishing";
          risk = 0.85;
          reason = "Punycode / Homoglyph attack";
        } else if (/^[\d.]+$/.test(host)) {
          verdict = "phishing";
          risk = 0.80;
          reason = "Direct IP host target";
        } else {
          for (const b of HIGH_PROFILE_BRANDS) {
            if (host.includes(b) && !host.endsWith("." + b + ".com") && host !== b + ".com") {
              verdict = "phishing";
              risk = 0.75;
              reason = "Brand Spoof Risk";
              break;
            }
          }
        }
      }

      if (isMismatch) {
        verdict = "phishing";
        risk = Math.max(risk, 0.92);
        reason = `Deceptive Anchor: text claims "${mismatchClaim}", links to "${host}"!`;
      }

      return {
        host,
        path: u.pathname.length > 25 ? u.pathname.slice(0, 25) + "…" : u.pathname,
        isShortener,
        isExt,
        verdict,
        risk,
        reason,
        matchedBrand,
        isMismatch,
        mismatchClaim
      };
    } catch (_) {
      return null;
    }
  }

  document.addEventListener("mouseover", (e) => {
    if (!isHoverHudEnabled) return;
    const a = e.target.closest("a[href]");
    if (!a) return;

    const rawHref = a.getAttribute("href");
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:")) return;

    const fullUrl = absHref(rawHref);
    if (!/^https?:/.test(fullUrl)) return;

    const analysis = analyzeLink(fullUrl, a);
    if (!analysis) return;

    // Show HUD for external links, redirects, or flagged suspicious/phishing destinations
    if (!analysis.isExt && !analysis.isShortener && analysis.verdict === "safe" && !analysis.isMismatch) return;

    if (hoverHudTimeout) clearTimeout(hoverHudTimeout);
    hoverHudTimeout = setTimeout(() => {
      const hud = getHoverHud();
      let badgeHtml = '<span style="background:rgba(10,132,255,0.22);color:#38bdf8;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700">EXTERNAL</span>';
      let borderGlow = "rgba(255, 255, 255, 0.22)";
      let strokeColor = "#38bdf8";

      if (analysis.isMismatch) {
        badgeHtml = `<span style="background:rgba(255,69,58,0.28);color:#ff453a;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700">🚨 DECEPTIVE LINK</span>`;
        borderGlow = "rgba(255, 69, 58, 0.65)";
        strokeColor = "#ff453a";
      } else if (analysis.verdict === "phishing") {
        badgeHtml = `<span style="background:rgba(255,69,58,0.25);color:#ff453a;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700">🛡️ PHISHING DANGER</span>`;
        borderGlow = "rgba(255, 69, 58, 0.6)";
        strokeColor = "#ff453a";
      } else if (analysis.verdict === "suspicious") {
        badgeHtml = `<span style="background:rgba(255,159,10,0.25);color:#ff9f0a;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700">⚠️ SUSPICIOUS</span>`;
        borderGlow = "rgba(255, 159, 10, 0.5)";
        strokeColor = "#ff9f0a";
      } else if (analysis.isShortener) {
        badgeHtml = '<span style="background:rgba(191,90,242,0.25);color:#bf5af2;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700">REDIRECT</span>';
        borderGlow = "rgba(191, 90, 242, 0.4)";
        strokeColor = "#bf5af2";
      } else if (analysis.matchedBrand) {
        badgeHtml = `<span style="background:rgba(48,209,88,0.20);color:#30d158;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700">✓ ${analysis.matchedBrand.toUpperCase()}</span>`;
        borderGlow = "rgba(48, 209, 88, 0.35)";
        strokeColor = "#30d158";
      } else if (analysis.isExt) {
        badgeHtml = '<span style="background:rgba(48,209,88,0.18);color:#34d399;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700">✓ SAFE EXTERNAL</span>';
        borderGlow = "rgba(48, 209, 88, 0.28)";
        strokeColor = "#34d399";
      }

      hud.style.borderColor = borderGlow;
      hud.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          ${analysis.verdict === 'phishing' || analysis.isMismatch ? '<line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' : '<path d="m9 12 2 2 4-4"/>'}
        </svg>
        <span style="font-weight:700;color:#ffffff">${analysis.host}</span>
        <span style="color:rgba(235,235,245,0.55);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${analysis.path}</span>
        ${badgeHtml}
        ${analysis.reason ? `<span style="color:${analysis.verdict === 'phishing' || analysis.isMismatch ? '#ff453a' : '#ff9f0a'};font-size:10px;font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${analysis.reason}</span>` : ''}
      `;

      // Position near cursor, safely within viewport bounds
      const posX = Math.min(e.clientX + 12, window.innerWidth - 380);
      const posY = e.clientY + 24 > window.innerHeight - 50 ? e.clientY - 42 : e.clientY + 20;
      hud.style.left = `${Math.max(10, posX)}px`;
      hud.style.top = `${posY}px`;
      hud.style.display = "flex";

      requestAnimationFrame(() => {
        hud.style.opacity = "1";
        hud.style.transform = "translateY(0) scale(1)";
      });
    }, 120);
  }, { passive: true });

  document.addEventListener("mouseout", (e) => {
    const a = e.target.closest("a[href]");
    if (a) {
      if (hoverHudTimeout) clearTimeout(hoverHudTimeout);
      if (hoverHudEl) {
        hoverHudEl.style.opacity = "0";
        hoverHudEl.style.transform = "translateY(4px) scale(0.96)";
        setTimeout(() => {
          if (hoverHudEl && hoverHudEl.style.opacity === "0") {
            hoverHudEl.style.display = "none";
          }
        }, 150);
      }
    }
  }, { passive: true });

  /* ─── Proactive Gmail Phishing & Sender Impersonation Shield ───── */
  if (location.hostname === "mail.google.com") {
    let gmailHudEl = null;
    let gmailHudTimeout = null;

    function getGmailHud() {
      if (!gmailHudEl) {
        gmailHudEl = document.createElement("div");
        gmailHudEl.id = "__phishguard_gmail_hud__";
        gmailHudEl.style.cssText = `
          position: fixed;
          z-index: 2147483647;
          pointer-events: none;
          display: none;
          align-items: center;
          gap: 9px;
          padding: 7px 14px;
          background: rgba(15, 20, 32, 0.94);
          backdrop-filter: blur(28px) saturate(200%);
          -webkit-backdrop-filter: blur(28px) saturate(200%);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 9999px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55), inset 0 1px 1px rgba(255, 255, 255, 0.35);
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', sans-serif;
          font-size: 11.5px;
          line-height: 1.25;
          letter-spacing: -0.01em;
          transition: opacity 0.16s ease, transform 0.16s ease;
          opacity: 0;
          transform: translateY(4px) scale(0.96);
        `;
        document.documentElement.appendChild(gmailHudEl);
      }
      return gmailHudEl;
    }

    function inspectGmailElement(target) {
      if (!target) return null;
      const row = target.closest('tr[role="row"], .zA, div[role="row"], .gD, .gE, .adn');
      if (!row) return null;

      let senderName = "";
      let senderEmail = "";
      let subject = "";

      const gD = row.querySelector ? row.querySelector(".gD") : (row.classList.contains("gD") ? row : null);
      if (gD) {
        senderEmail = gD.getAttribute("email") || "";
        senderName = gD.getAttribute("name") || gD.textContent || "";
      }

      if (!senderEmail) {
        const emailSpan = row.querySelector ? row.querySelector("span[email]") : null;
        if (emailSpan) {
          senderEmail = emailSpan.getAttribute("email") || "";
          senderName = emailSpan.getAttribute("name") || emailSpan.textContent || "";
        }
      }

      if (!senderName) {
        const nameEl = row.querySelector ? row.querySelector(".yW, .yX, .zF") : null;
        if (nameEl) senderName = nameEl.textContent || "";
      }

      const subjEl = row.querySelector ? row.querySelector(".bog, .bqe, h2.hP, .ha") : null;
      if (subjEl) subject = subjEl.textContent || "";

      if (!senderEmail && senderName.includes("@")) {
        const m = senderName.match(/<([^>]+)>/) || senderName.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (m) senderEmail = m[1];
      }

      if (!senderName && !senderEmail) return null;
      return { senderName: senderName.trim(), senderEmail: senderEmail.trim(), subject: subject.trim() };
    }

    document.addEventListener("mouseover", (e) => {
      if (!isHoverHudEnabled) return;
      if (e.target.closest("a[href]")) return;

      const data = inspectGmailElement(e.target);
      if (!data || (!data.senderName && !data.senderEmail)) return;

      if (gmailHudTimeout) clearTimeout(gmailHudTimeout);
      gmailHudTimeout = setTimeout(() => {
        const hud = getGmailHud();
        let audit = null;
        if (typeof PhishGuardDetector !== "undefined" && PhishGuardDetector.analyzeEmail) {
          audit = PhishGuardDetector.analyzeEmail(data.senderName, data.senderEmail, data.subject);
        } else {
          audit = { verdict: "safe", badge: "SAFE", alertTitle: "Legitimate Sender", warningReason: "" };
        }

        let borderGlow = "rgba(48, 209, 88, 0.4)";
        let iconColor = "#30d158";
        let badgeHtml = '<span style="background:rgba(48,209,88,0.2);color:#30d158;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">✓ SAFE</span>';

        if (audit.verdict === "phishing") {
          borderGlow = "rgba(255, 69, 58, 0.65)";
          iconColor = "#ff453a";
          badgeHtml = `<span style="background:rgba(255,69,58,0.25);color:#ff453a;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">🚨 ${audit.badge || "PHISHING WARNING"}</span>`;
        } else if (audit.verdict === "suspicious") {
          borderGlow = "rgba(255, 159, 10, 0.55)";
          iconColor = "#ff9f0a";
          badgeHtml = `<span style="background:rgba(255,159,10,0.25);color:#ff9f0a;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">⚠️ ${audit.badge || "SUSPICIOUS"}</span>`;
        } else if (audit.isOfficial) {
          borderGlow = "rgba(48, 209, 88, 0.55)";
          iconColor = "#30d158";
          badgeHtml = `<span style="background:rgba(48,209,88,0.22);color:#30d158;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">✓ ${audit.badge || "OFFICIAL"}</span>`;
        }

        hud.style.borderColor = borderGlow;
        hud.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            ${audit.verdict === 'phishing' ? '<line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' : '<path d="m9 12 2 2 4-4"/>'}
          </svg>
          <div style="display:flex;flex-direction:column;gap:1px;max-width:320px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-weight:700;color:#ffffff">${audit.alertTitle}</span>
              ${badgeHtml}
            </div>
            <span style="color:rgba(235,235,245,0.70);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${audit.warningReason || (data.senderEmail || data.senderName)}</span>
          </div>
        `;

        const posX = Math.min(e.clientX + 14, window.innerWidth - 380);
        const posY = e.clientY + 26 > window.innerHeight - 60 ? e.clientY - 50 : e.clientY + 20;
        hud.style.left = `${Math.max(12, posX)}px`;
        hud.style.top = `${posY}px`;
        hud.style.display = "flex";

        requestAnimationFrame(() => {
          hud.style.opacity = "1";
          hud.style.transform = "translateY(0) scale(1)";
        });
      }, 130);
    }, { passive: true });

    document.addEventListener("mouseout", (e) => {
      const row = e.target.closest('tr[role="row"], .zA, div[role="row"], .gD, .gE, .adn');
      if (row) {
        if (gmailHudTimeout) clearTimeout(gmailHudTimeout);
        if (gmailHudEl) {
          gmailHudEl.style.opacity = "0";
          gmailHudEl.style.transform = "translateY(4px) scale(0.96)";
          setTimeout(() => {
            if (gmailHudEl && gmailHudEl.style.opacity === "0") {
              gmailHudEl.style.display = "none";
            }
          }, 150);
        }
      }
    }, { passive: true });
  }

  // ─── Real-Time Liquid Glass Ambient Streamer ───────────────────
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "PG_AMBIENT_STREAM") return;

    let scrollRafId = null;
    let colorThrottleTimer = null;
    let lastColorSampleTime = 0;
    let lastY = getScroll();

    // Persistent 1x1 canvas for color reading — allocated once, never re-created
    let sampleCanvas = null;
    let sampleCtx = null;
    function getSampleContext() {
      if (!sampleCanvas) {
        sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = 1;
        sampleCanvas.height = 1;
        sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      }
      return sampleCtx;
    }

    function getScroll() {
      return window.scrollY ||
        document.documentElement.scrollTop ||
        (document.scrollingElement && document.scrollingElement.scrollTop) ||
        (document.body && document.body.scrollTop) || 0;
    }

    function isVibrant(r, g, b) {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // Prioritize colors with perceptible chromatic saturation, skip pure black/dark gray & stark white
      return (max - min > 16) && (max > 35) && (r + g + b < 700);
    }

    function sampleColorAt(x, y) {
      try {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;

        // 1. Fast path: check element or immediate parents for computed background-color
        let cur = el;
        let depth = 0;
        while (cur && cur !== document.documentElement && depth < 4) {
          depth++;
          const bg = window.getComputedStyle(cur).backgroundColor;
          if (bg && bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0)")) {
            const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (m) {
              const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
              if (isVibrant(r, g, b)) return { r, g, b };
            }
          }
          cur = cur.parentElement;
        }

        // 2. Secondary path: check image or video thumbnail
        const img = el.tagName === "IMG" ? el : el.querySelector("img");
        if (img && img.complete && img.naturalWidth > 0) {
          try {
            const ctx = getSampleContext();
            if (ctx) {
              ctx.drawImage(img, 0, 0, 1, 1);
              const d = ctx.getImageData(0, 0, 1, 1).data;
              if (d[0] + d[1] + d[2] > 25) {
                return { r: d[0], g: d[1], b: d[2] };
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
      return null;
    }

    function sampleAndEmitColors() {
      const w = window.innerWidth;
      // Coordinates directly behind the top-right toolbar popup (width ~380)
      const px = Math.max(w - 190, 50);
      const c1 = sampleColorAt(px, 120);
      const c2 = sampleColorAt(px, 320);
      const c3 = sampleColorAt(px, 500);

      if (c1 || c2 || c3) {
        try {
          port.postMessage({
            type: "COLOR_TICK",
            c1, c2, c3
          });
        } catch (_) {}
      }
    }

    function scheduleColorSample() {
      const now = performance.now();
      if (now - lastColorSampleTime > 120) {
        lastColorSampleTime = now;
        sampleAndEmitColors();
      } else if (!colorThrottleTimer) {
        colorThrottleTimer = setTimeout(() => {
          colorThrottleTimer = null;
          lastColorSampleTime = performance.now();
          sampleAndEmitColors();
        }, 130);
      }
    }

    // High-frequency scroll emission (native 60-120fps sync) with zero DOM overhead
    function onScroll() {
      if (!scrollRafId) {
        scrollRafId = requestAnimationFrame(() => {
          scrollRafId = null;
          const sy = getScroll();
          try {
            port.postMessage({
              type: "SCROLL_TICK",
              scrollY: sy,
              deltaY: sy - lastY
            });
          } catch (_) {}
          lastY = sy;

          // Throttled color sampling in background
          scheduleColorSample();
        });
      }
    }

    // Monitor scroll with capture phase so it catches all scrolling container elements (e.g. YouTube feed)
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // Monitor video playing on page (e.g. YouTube player frames) — color updates only, never forces scroll ticks
    const videoPoll = setInterval(() => {
      const v = document.querySelector("video");
      if (v && !v.paused && !v.ended) {
        scheduleColorSample();
      }
    }, 350);

    // Initial color extraction
    sampleAndEmitColors();

    port.onDisconnect.addListener(() => {
      if (scrollRafId) cancelAnimationFrame(scrollRafId);
      if (colorThrottleTimer) clearTimeout(colorThrottleTimer);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      clearInterval(videoPoll);
    });
  });
})();
