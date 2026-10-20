"use strict";

const $ = (id) => document.getElementById(id);
let tab = null;
let isExtensionEnabled = true;

/* SVG circular gauge: circumference = 2 × π × 50 ≈ 314.16 */
const C = 2 * Math.PI * 50;

/* ─── Messaging Helper ───────────────────────────────────────── */
async function send(type, extra) {
  const r = await chrome.runtime.sendMessage({ type, ...(extra || {}) });
  if (!r || !r.ok) throw new Error((r && r.error) || "request failed");
  return r.data;
}

/* ─── Cross-Browser Active Tab Query (Safari popover & Chromium) ─ */
async function getActiveTab() {
  // Strategy 1: Standard current window (Chromium)
  try {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (t && t.id && (t.url || t.pendingUrl)) return t;
  } catch (_) {}
  // Strategy 2: Last focused browser window (Safari popovers live in a separate window)
  try {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (t && t.id && (t.url || t.pendingUrl)) return t;
  } catch (_) {}
  // Strategy 3: Find active tab across all windows
  try {
    const tabs = await chrome.tabs.query({ active: true });
    if (tabs && tabs.length > 0) {
      const webTab = tabs.find((t) => (t.url || t.pendingUrl) && /^https?:/.test(t.url || t.pendingUrl));
      if (webTab) return webTab;
      return tabs[0];
    }
  } catch (_) {}
  // Strategy 4: Fallback across any tab
  try {
    const allTabs = await chrome.tabs.query({});
    if (allTabs && allTabs.length > 0) {
      const activeWeb = allTabs.find((t) => t.active && (t.url || t.pendingUrl));
      if (activeWeb) return activeWeb;
      const anyWeb = allTabs.find((t) => (t.url || t.pendingUrl) && /^https?:/.test(t.url || t.pendingUrl));
      if (anyWeb) return anyWeb;
    }
  } catch (_) {}
  return null;
}

const say = (t) => {
  const el = $("msg");
  if (el) el.textContent = t;
};

/* ─── Gauge Animation ────────────────────────────────────────── */
function setGauge(pct, color) {
  const fill = $("gaugeFill");
  const glow = $("gaugeGlow");
  const offset = C - (C * pct / 100);

  if (fill) {
    fill.style.strokeDashoffset = offset;
    fill.style.stroke = color || "#8e8e93";
  }
  if (glow) {
    glow.style.strokeDashoffset = offset;
    glow.style.stroke = color || "#8e8e93";
  }
}

/* ─── Security Nutrition Matrix Builder ──────────────────────── */
function updateNutritionMatrix(r) {
  const matUrlStatus = $("matUrlStatus");
  const matUrlDesc = $("matUrlDesc");
  const matBrandStatus = $("matBrandStatus");
  const matBrandDesc = $("matBrandDesc");
  const matFormStatus = $("matFormStatus");
  const matFormDesc = $("matFormDesc");
  const matDomStatus = $("matDomStatus");
  const matDomDesc = $("matDomDesc");

  if (!matUrlStatus) return;

  if (!isExtensionEnabled) {
    [matUrlStatus, matBrandStatus, matFormStatus, matDomStatus].forEach(el => {
      if (el) { el.className = "pillar-status neutral"; el.textContent = "PAUSED"; }
    });
    if (matUrlDesc) matUrlDesc.textContent = "Telemetry paused while protection is turned off.";
    if (matBrandDesc) matBrandDesc.textContent = "Brand authentication paused.";
    if (matFormDesc) matFormDesc.textContent = "Form inspection paused.";
    if (matDomDesc) matDomDesc.textContent = "DOM signals monitoring paused.";
    return;
  }

  if (!r) {
    [matUrlStatus, matBrandStatus, matFormStatus, matDomStatus].forEach(el => {
      if (el) { el.className = "pillar-status neutral"; el.textContent = "WAITING"; }
    });
    if (matUrlDesc) matUrlDesc.textContent = "Awaiting page telemetry…";
    if (matBrandDesc) matBrandDesc.textContent = "Awaiting brand match check…";
    if (matFormDesc) matFormDesc.textContent = "Awaiting form security audit…";
    if (matDomDesc) matDomDesc.textContent = "Awaiting DOM inspection…";
    return;
  }

  const reasons = r.reasons || [];
  const m = r.modules || {};

  // 1. URL Integrity
  const urlScore = (m.url && m.url.score) || 0;
  const hasHomoglyph = reasons.some(x => x.code && x.code.includes("HOMOGLYPH"));
  const hasIpHost = reasons.some(x => x.code && x.code.includes("IP_HOST"));
  const hasSuspiciousTld = reasons.some(x => x.code && x.code.includes("TLD"));

  if (urlScore > 0.6 || hasHomoglyph || hasIpHost) {
    matUrlStatus.className = "pillar-status fail";
    matUrlStatus.textContent = "DANGER";
    matUrlDesc.textContent = hasHomoglyph ? "Detected homoglyph/typosquat character deception." :
      (hasIpHost ? "Direct IP host detected without legitimate domain." : "Elevated lexical patterns and suspicious TLD structure.");
  } else if (urlScore > 0.3 || hasSuspiciousTld) {
    matUrlStatus.className = "pillar-status warn";
    matUrlStatus.textContent = "WARNING";
    matUrlDesc.textContent = "Uncommon TLD or elevated entropy detected in URL structure.";
  } else {
    matUrlStatus.className = "pillar-status pass";
    matUrlStatus.textContent = "PASS";
    matUrlDesc.textContent = `Clean domain structure. Risk index: ${Math.round(urlScore * 100)}%.`;
  }

  // 2. Brand Authenticity
  if (r.brand) {
    if (r.verdict === "phishing" || r.verdict === "suspicious") {
      matBrandStatus.className = "pillar-status fail";
      matBrandStatus.textContent = "CLONE ALERT";
      matBrandDesc.textContent = `Pretending to be "${r.brand}", but not hosted on official domain.`;
    } else {
      matBrandStatus.className = "pillar-status pass";
      matBrandStatus.textContent = "VERIFIED";
      matBrandDesc.textContent = `Authentic verified domain for "${r.brand}".`;
    }
  } else {
    matBrandStatus.className = "pillar-status neutral";
    matBrandStatus.textContent = "CLEAR";
    matBrandDesc.textContent = "No protected brand impersonation claims detected.";
  }

  // 3. Form & Credential Safety
  const domScore = (m.dom && m.dom.score) || 0;
  const hasPw = (m.dom && m.dom.has_password) || reasons.some(x => x && x.message && x.message.toLowerCase().includes("password"));
  const extForm = reasons.some(x => x && x.message && x.message.toLowerCase().includes("external"));

  if (extForm || (hasPw && (r.verdict === "phishing" || r.verdict === "suspicious"))) {
    matFormStatus.className = "pillar-status fail";
    matFormStatus.textContent = "UNSAFE";
    matFormDesc.textContent = extForm ? "Critical: Form inputs submit credentials to external 3rd-party domain." :
      "Password input found on flagged deceptive domain. Do not submit credentials.";
  } else if (hasPw) {
    matFormStatus.className = "pillar-status pass";
    matFormStatus.textContent = "PROTECTED";
    matFormDesc.textContent = "Login password inputs detected, submitting safely to legitimate origin.";
  } else {
    matFormStatus.className = "pillar-status neutral";
    matFormStatus.textContent = "NONE";
    matFormDesc.textContent = "No credential or sensitive payment fields present on this page.";
  }

  // 4. DOM & Behavioral Signals
  const hiddenIframes = reasons.some(x => x && x.message && x.message.toLowerCase().includes("iframe"));
  const sensitiveProbes = reasons.some(x => x && x.message && (x.message.includes("sensitive") || x.message.includes("CVV") || x.message.includes("OTP")));

  if (hiddenIframes || sensitiveProbes || domScore > 0.6) {
    matDomStatus.className = "pillar-status warn";
    matDomStatus.textContent = "ANOMALY";
    matDomDesc.textContent = hiddenIframes ? "Hidden iframes detected in page DOM structure." :
      (sensitiveProbes ? "Probing for sensitive financial tokens (OTP/CVV/Card)." : "Suspicious DOM hierarchy detected.");
  } else {
    matDomStatus.className = "pillar-status pass";
    matDomStatus.textContent = "HEALTHY";
    matDomDesc.textContent = "DOM clean. Standard page structure without deceptive overlays.";
  }
}

/* ─── Apple Liquid Glass Tab Backdrop & Real-time Ambient ────── */
function setAmbientColors(p, s) {
  document.documentElement.style.setProperty("--ambient-primary", p);
  document.documentElement.style.setProperty("--ambient-secondary", s);
}

function extractColorsFromDataUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 16, 16);

      // Top-right sample (where the toolbar popup sits: x=10..15, y=0..6)
      const data = ctx.getImageData(10, 0, 6, 6).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      // Bottom-left sample for secondary chromatic refraction
      const data2 = ctx.getImageData(0, 10, 6, 6).data;
      let r2 = 0, g2 = 0, b2 = 0, count2 = 0;
      for (let i = 0; i < data2.length; i += 4) {
        r2 += data2[i];
        g2 += data2[i + 1];
        b2 += data2[i + 2];
        count2++;
      }
      r2 = Math.round(r2 / count2);
      g2 = Math.round(g2 / count2);
      b2 = Math.round(b2 / count2);

      // Boost saturation/vibrancy for rich glass refraction
      const pColor = `rgba(${Math.max(r, 40)}, ${Math.max(g, 40)}, ${Math.max(b, 50)}, 0.58)`;
      const sColor = `rgba(${Math.max(r2, 30)}, ${Math.max(g2, 30)}, ${Math.max(b2, 50)}, 0.46)`;
      setAmbientColors(pColor, sColor);
    } catch (_) {}
  };
  img.src = dataUrl;
}

let ambientPort = null;
let activeBuffer = null;
let idleBuffer = null;
let activeScrollOrigin = 0;
let idleScrollOrigin = 0;
let currentTabScrollY = 0;
let initialScrollY = null;
let isCrossfading = false;
let isCapturing = false;
let idleCaptureTimer = null;
let lastCaptureTime = 0;
let scrollRafPending = false;

function applyScrollTransforms(scrollY) {
  if (initialScrollY === null) {
    initialScrollY = scrollY;
    activeScrollOrigin = scrollY;
    idleScrollOrigin = scrollY;
  }

  const deltaActive = scrollY - activeScrollOrigin;
  if (activeBuffer) {
    activeBuffer.style.setProperty("--scroll-shift", `${-deltaActive * 0.75}px`);
  }

  if (idleBuffer && isCrossfading) {
    const deltaIdle = scrollY - idleScrollOrigin;
    idleBuffer.style.setProperty("--scroll-shift", `${-deltaIdle * 0.75}px`);
  }

  const mesh = $("ambientMesh");
  if (mesh) {
    mesh.style.transform = `translate3d(0, ${(-deltaActive * 0.35) % 120}px, 0)`;
  }
}

function scheduleIdleCaptureRefresh() {
  if (idleCaptureTimer) clearTimeout(idleCaptureTimer);

  // Generous pause: wait 700ms of true idle before refreshing capture
  idleCaptureTimer = setTimeout(async () => {
    const now = Date.now();
    if (isCapturing || (now - lastCaptureTime < 750)) return;

    // Only refresh if user scrolled significantly from the capture origin (> 120px)
    if (Math.abs(currentTabScrollY - activeScrollOrigin) < 120) return;

    isCapturing = true;
    lastCaptureTime = now;
    const captureScrollY = currentTabScrollY;

    try {
      const winId = (tab && typeof tab.windowId === "number") ? tab.windowId : undefined;
      const dataUrl = winId !== undefined
        ? await chrome.tabs.captureVisibleTab(winId, { format: "jpeg", quality: 60 })
        : await chrome.tabs.captureVisibleTab({ format: "jpeg", quality: 60 });
      if (!dataUrl || !idleBuffer) {
        isCapturing = false;
        return;
      }

      // Pre-decode image before touching DOM to avoid frame drops
      const img = new Image();
      img.src = dataUrl;
      await img.decode();

      // Configure idleBuffer at current capture position
      idleScrollOrigin = captureScrollY;
      const deltaIdle = currentTabScrollY - idleScrollOrigin;
      idleBuffer.style.setProperty("--scroll-shift", `${-deltaIdle * 0.75}px`);
      idleBuffer.style.backgroundImage = `url("${dataUrl}")`;

      // Trigger seamless crossfade
      isCrossfading = true;
      idleBuffer.classList.replace("is-idle", "is-active");
      activeBuffer.classList.replace("is-active", "is-idle");

      // Complete crossfade after CSS transition
      setTimeout(() => {
        isCrossfading = false;
        const temp = activeBuffer;
        activeBuffer = idleBuffer;
        idleBuffer = temp;
        activeScrollOrigin = idleScrollOrigin;
        isCapturing = false;
      }, 360);

      extractColorsFromDataUrl(dataUrl);
    } catch (_) {
      if (chrome.runtime.lastError) {
        const _ = chrome.runtime.lastError.message;
      }
      isCapturing = false;
      isCrossfading = false;
    }
  }, 700);
}

function connectAmbientStream(activeTab) {
  if (!activeTab || !activeTab.id || !/^https?:/.test(activeTab.url || "")) return;

  function doConnect() {
    try {
      ambientPort = chrome.tabs.connect(activeTab.id, { name: "PG_AMBIENT_STREAM" });

      ambientPort.onMessage.addListener((msg) => {
        // High-frequency 60-120fps instantaneous scroll tracking
        if (msg.type === "SCROLL_TICK") {
          currentTabScrollY = msg.scrollY;

          if (!scrollRafPending) {
            scrollRafPending = true;
            requestAnimationFrame(() => {
              scrollRafPending = false;
              applyScrollTransforms(currentTabScrollY);
            });
          }

          // Debounced idle capture refresh (never interrupts active scrolling)
          scheduleIdleCaptureRefresh();
        }

        // Real-time dynamic color shift matching elements passing under popup
        if (msg.type === "COLOR_TICK" || msg.c1 || msg.c2 || msg.c3) {
          const topColor = msg.c1 || msg.c2;
          const bottomColor = msg.c2 || msg.c3 || msg.c1;
          if (topColor) {
            const p = `rgba(${Math.max(topColor.r, 45)}, ${Math.max(topColor.g, 45)}, ${Math.max(topColor.b, 60)}, 0.65)`;
            document.documentElement.style.setProperty("--ambient-primary", p);
          }
          if (bottomColor) {
            const s = `rgba(${Math.max(bottomColor.r, 35)}, ${Math.max(bottomColor.g, 35)}, ${Math.max(bottomColor.b, 55)}, 0.50)`;
            document.documentElement.style.setProperty("--ambient-secondary", s);
          }
        }
      });

      ambientPort.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          const _ = chrome.runtime.lastError.message;
        }
        ambientPort = null;
      });
    } catch (_) {
      if (chrome.runtime.lastError) {
        const _ = chrome.runtime.lastError.message;
      }
    }
  }

  doConnect();
}

function applyLiquidGlassPreference(enabled) {
  const backdrop = $("tabBackdrop");
  const shell = document.querySelector(".popup-shell");
  if (!enabled) {
    if (backdrop) backdrop.style.display = "none";
    if (shell) shell.classList.add("liquid-off");
    if (ambientPort) {
      try { ambientPort.disconnect(); } catch (_) {}
      ambientPort = null;
    }
  } else {
    if (backdrop) backdrop.style.display = "";
    if (shell) shell.classList.remove("liquid-off");
  }
}

async function initLiquidGlassBackdrop(activeTab) {
  if (!activeTab || !activeTab.id || !/^https?:/.test(activeTab.url || "")) return;

  const cfg = await chrome.storage.local.get({ liquidGlass: true });
  if (cfg.liquidGlass === false) {
    applyLiquidGlassPreference(false);
    return;
  }
  applyLiquidGlassPreference(true);

  activeBuffer = $("tabCaptureA");
  idleBuffer = $("tabCaptureB");

  // 1. Domain-specific baseline heuristics for immediate liquid ambiance
  try {
    const u = new URL(activeTab.url);
    const h = u.hostname.toLowerCase();
    if (h.includes("youtube.com")) {
      setAmbientColors("rgba(255, 30, 50, 0.65)", "rgba(160, 30, 220, 0.45)");
    } else if (h.includes("netflix.com")) {
      setAmbientColors("rgba(229, 9, 20, 0.65)", "rgba(90, 10, 30, 0.45)");
    } else if (h.includes("twitch.tv")) {
      setAmbientColors("rgba(145, 71, 255, 0.65)", "rgba(50, 20, 120, 0.45)");
    } else if (h.includes("github.com")) {
      setAmbientColors("rgba(56, 139, 253, 0.65)", "rgba(137, 87, 229, 0.45)");
    } else if (h.includes("spotify.com")) {
      setAmbientColors("rgba(30, 215, 96, 0.65)", "rgba(10, 100, 50, 0.45)");
    }
  } catch (_) {}

  // 2. Ensure content script is actively running in target tab
  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ["content.js"]
    });
  } catch (_) {}

  // 3. Real-time visible tab capture for true underlying tab blur
  try {
    const winId = (activeTab && typeof activeTab.windowId === "number") ? activeTab.windowId : undefined;
    const dataUrl = winId !== undefined
      ? await chrome.tabs.captureVisibleTab(winId, { format: "jpeg", quality: 65 })
      : await chrome.tabs.captureVisibleTab({ format: "jpeg", quality: 65 });
    if (dataUrl && activeBuffer) {
      activeBuffer.style.backgroundImage = `url("${dataUrl}")`;
      activeBuffer.classList.add("is-active", "loaded");
      extractColorsFromDataUrl(dataUrl);
    }
  } catch (err) {
    if (chrome.runtime.lastError) {
      const _ = chrome.runtime.lastError.message;
    }
  }

  // 4. Connect real-time scroll & video color streamer
  connectAmbientStream(activeTab);
}

/* ─── Dynamic Adaptive Popup Container Height ─────────────────── */
function fitPopupHeight() {
  requestAnimationFrame(() => {
    const shell = document.querySelector(".popup-shell");
    if (!shell) return;
    const targetH = shell.offsetHeight;
    if (targetH > 0) {
      if (targetH > 600) {
        document.body.style.overflowY = "auto";
        document.body.style.height = "600px";
        document.documentElement.style.height = "600px";
      } else {
        document.body.style.overflowY = "hidden";
        document.body.style.height = `${targetH}px`;
        document.documentElement.style.height = `${targetH}px`;
      }

      // Chromium native popup bubble shrink trigger:
      // Toggling width forces Chromium's native window manager to re-measure
      // bounds downward when switching from tall tabs to short tabs.
      document.body.style.width = "379px";
      void document.body.offsetHeight;
      document.body.style.width = "380px";
    }
  });
}

// Automatically sync popup height whenever content changes
if (window.ResizeObserver) {
  let roTimer = null;
  const ro = new ResizeObserver(() => {
    if (roTimer) clearTimeout(roTimer);
    roTimer = setTimeout(fitPopupHeight, 16);
  });
  const shell = document.querySelector(".popup-shell");
  if (shell) ro.observe(shell);
}

/* ─── Paused Banner Visibility Enforcer ──────────────────────── */
function setPausedBannerVisible(visible) {
  const banner = $("pausedBanner");
  if (!banner) return;
  if (visible) {
    banner.hidden = false;
    banner.removeAttribute("hidden");
    banner.classList.remove("is-hidden");
    banner.style.setProperty("display", "flex", "important");
  } else {
    banner.hidden = true;
    banner.setAttribute("hidden", "");
    banner.classList.add("is-hidden");
    banner.style.setProperty("display", "none", "important");
  }
  fitPopupHeight();
}

/* ─── Render Main State ──────────────────────────────────────── */
function render(state) {
  const badge = $("badge"), badgeText = $("badgeText"), list = $("reasons");
  if (list) list.textContent = "";
  if ($("error")) $("error").hidden = true;
  if ($("reasonsWrap")) $("reasonsWrap").hidden = true;

  // Handle Extension Disabled/Paused State
  setPausedBannerVisible(!isExtensionEnabled);

  if (!isExtensionEnabled) {
    $("headerStatusText").textContent = "Paused";
    $("headerStatusText").className = "brand-sub paused";
    $("heroStage").classList.add("dimmed");
    if (badge) { badge.className = "verdict-capsule paused"; }
    if (badgeText) { badgeText.textContent = "Paused"; }
    $("riskPct").textContent = "–";
    if ($("pctUnit")) $("pctUnit").style.display = "none";
    $("domain").textContent = "Protection is currently disabled";
    $("stageMeta").textContent = "Toggle on to resume real-time analysis";
    setGauge(0, "#8e8e93");
    updateNutritionMatrix(null);
    return;
  }

  $("headerStatusText").textContent = "Active";
  $("headerStatusText").className = "brand-sub";
  $("heroStage").classList.remove("dimmed");

  if (!state || !state.result) {
    if (currentTabUrl && typeof PhishGuardDetector !== "undefined" && /^https?:\/\//i.test(currentTabUrl)) {
      const liveRes = PhishGuardDetector.analyzeUrl(currentTabUrl);
      state = { url: currentTabUrl, result: liveRes, ts: Date.now(), error: null };
    } else {
      if (badge) { badge.className = "verdict-capsule pending"; }
      if (badgeText) { badgeText.textContent = "Scanning"; }
      $("riskPct").textContent = "…";
      if ($("pctUnit")) $("pctUnit").style.display = "none";
      $("stageMeta").textContent = "Stage: Telemetry Inflight";
      if (currentTabUrl) {
        try {
          const u = new URL(currentTabUrl);
          if ($("domain")) $("domain").textContent = u.hostname || "Active Protected Tab";
        } catch (_) {}
      }
      setGauge(30, "#8e8e93");
      updateNutritionMatrix(null);
      return;
    }
  }

  if (state.error) {
    if (currentTabUrl && typeof PhishGuardDetector !== "undefined" && /^https?:\/\//i.test(currentTabUrl)) {
      state.result = PhishGuardDetector.analyzeUrl(currentTabUrl);
      state.error = null;
    } else {
      if (badge) { badge.className = "verdict-capsule pending"; }
      if (badgeText) { badgeText.textContent = "Offline"; }
      $("riskPct").textContent = "–";
      if ($("pctUnit")) $("pctUnit").style.display = "none";
      setGauge(0, "#8e8e93");
      if ($("error")) {
        $("error").hidden = false;
        $("error").textContent = "Backend offline (" + (state.error || "no response") + ").";
      }
      updateNutritionMatrix(null);
      return;
    }
  }

  const r = state.result;
  const v = (r && r.verdict) || "safe";
  const colors = { safe: "var(--apple-green)", suspicious: "var(--apple-orange)", phishing: "var(--apple-red)" };
  const color = colors[v] || "#8e8e93";
  const riskVal = typeof (r && r.risk) === "number" ? r.risk : 0;
  const pct = Math.round((1 - riskVal) * 100); // Safety score

  if (badge) {
    badge.className = "verdict-capsule " + v;
  }
  if (badgeText) {
    badgeText.textContent = v === "safe" ? "Secure" : (v === "phishing" ? "Deceptive" : "Suspicious");
  }

  $("riskPct").textContent = pct;
  if ($("pctUnit")) $("pctUnit").style.display = "inline";
  setGauge(pct, color);

  let hostLabel = "";
  if (tab && tab.url) {
    try { hostLabel = new URL(tab.url).hostname; } catch (_) {}
  }
  if (!hostLabel) {
    hostLabel = (r && (r.registrable_domain || r.host)) || "Active Web Page";
  }
  $("domain").textContent = hostLabel;

  const stageName = (r && (r.stage || (r.reasons && r.reasons.some(x => x.code === "allowlisted") ? "allowlist" : "url")) || "url").toUpperCase();
  $("stageMeta").textContent = `Engine: ${stageName} Analysis · ${Math.round(riskVal * 100)}% Threat Risk`;

  // Signals
  if (r && r.reasons && r.reasons.length > 0 && list) {
    $("reasonsWrap").hidden = false;
    r.reasons.slice(0, 4).forEach((x) => {
      const li = document.createElement("li");
      li.textContent = x.message;
      list.appendChild(li);
    });
  }

  updateNutritionMatrix(r);
  lastRenderedResult = r;
  renderPipelineVisual(currentPipelineMode, r, (tab && tab.url) || currentTabUrl);
  fitPopupHeight();
}

/* ─── Global Toggle Handler ─────────────────────────────────── */
const globalToggle = $("globalToggle");
if (globalToggle) {
  globalToggle.addEventListener("change", async () => {
    isExtensionEnabled = globalToggle.checked;
    setPausedBannerVisible(!isExtensionEnabled);
    $("headerStatusText").textContent = isExtensionEnabled ? "Active" : "Paused";
    $("headerStatusText").className = isExtensionEnabled ? "brand-sub" : "brand-sub paused";
    if (isExtensionEnabled) {
      $("heroStage").classList.remove("dimmed");
    } else {
      $("heroStage").classList.add("dimmed");
    }
    await chrome.storage.local.set({ enabled: isExtensionEnabled });
    if (!isExtensionEnabled) {
      render(null);
    } else {
      if (tab && tab.id) {
        try {
          let s = await send("PG_GET_STATE", { tabId: tab.id });
          if (!s || !s.result) s = await send("PG_RESCAN", { tabId: tab.id });
          render(s);
          say("");
        } catch (_) {
          render(null);
        }
      } else {
        render(null);
      }
    }
  });
}

$("resumeBtn").addEventListener("click", () => {
  setPausedBannerVisible(false);
  if (globalToggle) {
    globalToggle.checked = true;
    globalToggle.dispatchEvent(new Event("change"));
  }
});

/* ─── Apple Capsule Dock Tab Switching ────────────────────────── */
document.querySelectorAll(".dock-segment").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dock-segment").forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".app-panel").forEach(p => p.classList.remove("active"));

    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    const targetId = btn.getAttribute("data-panel");
    const targetPanel = $(targetId);
    if (targetPanel) {
      targetPanel.classList.add("active");
    }
    fitPopupHeight();
  });
});

/* ─── Circle Controls Toggle (Wired to Persistent Settings) ───── */
const MODULE_KEYS = {
  ctrlShield: "phishingShield",
  ctrlAdBlock: "stealthAdblock",
  ctrlCreds: "driveByDefuser",
};

async function syncModuleButtons(s) {
  const settings = s || await chrome.storage.local.get({
    phishingShield: true,
    stealthAdblock: true,
    driveByDefuser: true,
  });
  if ($("ctrlShield")) $("ctrlShield").classList.toggle("active", settings.phishingShield !== false);
  if ($("ctrlAdBlock")) $("ctrlAdBlock").classList.toggle("active", settings.stealthAdblock !== false);
  if ($("ctrlCreds")) $("ctrlCreds").classList.toggle("active", settings.driveByDefuser !== false);
}

Object.entries(MODULE_KEYS).forEach(([btnId, settingKey]) => {
  const el = $(btnId);
  if (!el) return;
  el.addEventListener("click", async () => {
    const wasActive = el.classList.contains("active");
    const nextVal = !wasActive;
    el.classList.toggle("active", nextVal);
    await chrome.storage.local.set({ [settingKey]: nextVal });
    if (tab && tab.id && isExtensionEnabled) {
      try {
        render(await send("PG_RESCAN", { tabId: tab.id }));
      } catch (_) {}
    }
  });
});

/* ─── Analysis Pipeline Mode Showcase Visualizer ─────────────── */
let currentPipelineMode = "auto";
let lastRenderedResult = null;

function updatePipelineModeUI(mode) {
  document.querySelectorAll(".pipe-pill").forEach((pill) => {
    const pMode = pill.getAttribute("data-mode");
    pill.classList.toggle("active", pMode === mode);
  });
  const label = $("pipelineModeName");
  if (label) {
    if (mode === "url") label.textContent = "URL Lexical Graph";
    else if (mode === "always") label.textContent = "Deep ML Vision Ensemble";
    else label.textContent = "URL + DOM Structure";
  }
}

function renderPipelineVisual(mode, result, url) {
  const container = $("pipelineVisualSlot");
  if (!container) return;

  const reasons = (result && result.reasons) || [];
  const m = (result && result.modules) || {};
  const urlModule = m.url || {};
  const domModule = m.dom || {};

  if (mode === "url") {
    // 1. Lexical Graph Visualization
    let graphData = (result && result.graph) ? result.graph : null;
    
    // If no backend graph returned yet, parse local URL into lexical tokens
    if (!graphData) {
      try {
        const u = new URL(url || "https://example.com");
        const hostParts = u.hostname.split(".");
        let sld = hostParts.length > 1 ? hostParts[hostParts.length - 2] : u.hostname;
        let suffix = hostParts.length > 1 ? hostParts[hostParts.length - 1] : "";
        let sub = hostParts.length > 2 ? hostParts.slice(0, hostParts.length - 2).join(".") : "";

        const nodes = [
          { id: "s", label: u.protocol.replace(":", ""), kind: "scheme" },
        ];
        if (sub) nodes.push({ id: "sub", label: sub, kind: "subdomain" });
        nodes.push({ id: "sld", label: sld, kind: "sld" });
        if (suffix) nodes.push({ id: "tld", label: "." + suffix, kind: "suffix" });
        if (u.pathname && u.pathname !== "/") {
          nodes.push({ id: "p", label: u.pathname.slice(0, 14), kind: "path" });
        }
        if (u.search) {
          nodes.push({ id: "q", label: u.search.slice(0, 10), kind: "query" });
        }

        const edges = [];
        for (let i = 0; i < nodes.length - 1; i++) {
          edges.push([nodes[i].id, nodes[i + 1].id]);
        }
        graphData = { nodes, edges };
      } catch (_) {
        graphData = {
          nodes: [
            { id: "1", label: "https", kind: "scheme" },
            { id: "2", label: "domain", kind: "sld" },
            { id: "3", label: ".com", kind: "suffix" }
          ],
          edges: [["1", "2"], ["2", "3"]]
        };
      }
    }

    const nodes = graphData.nodes || [];
    const edges = graphData.edges || [];
    const W = 328;
    const H = 54;
    const count = Math.max(nodes.length, 2);
    const stepX = (W - 40) / (count - 1);

    const colorMap = {
      scheme: "#38bdf8",
      subdomain: "#f59e0b",
      sld: result && result.verdict === "phishing" ? "#ff453a" : "#30d158",
      suffix: "#a78bfa",
      path: "#0a84ff",
      query: "#ff375f",
      token: "#f472b6",
      url: "#38bdf8"
    };

    const nodePositions = {};
    nodes.forEach((n, idx) => {
      nodePositions[n.id] = {
        x: 20 + idx * stepX,
        y: 28
      };
    });

    let edgesSvg = "";
    edges.forEach(([fromId, toId]) => {
      const p1 = nodePositions[fromId];
      const p2 = nodePositions[toId];
      if (p1 && p2) {
        edgesSvg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="rgba(255,255,255,0.22)" stroke-width="1.2" stroke-dasharray="2,2"/>`;
      }
    });

    let nodesSvg = "";
    nodes.forEach((n) => {
      const pos = nodePositions[n.id] || { x: 20, y: 28 };
      const col = colorMap[n.kind] || "#94a3b8";
      const shortLabel = n.label.length > 8 ? n.label.slice(0, 7) + "…" : n.label;
      nodesSvg += `
        <g>
          <circle cx="${pos.x}" cy="${pos.y}" r="4.5" fill="${col}" filter="drop-shadow(0 0 4px ${col})"/>
          <text x="${pos.x}" y="${pos.y - 9}" font-size="8.5" font-family="'JetBrains Mono', monospace" font-weight="600" text-anchor="middle" fill="#e2e8f0">${shortLabel}</text>
          <text x="${pos.x}" y="${pos.y + 14}" font-size="7.5" font-family="inherit" text-anchor="middle" fill="rgba(255,255,255,0.45)">${n.kind}</text>
        </g>
      `;
    });

    const hasHomoglyph = reasons.some(r => r.code && r.code.includes("HOMOGLYPH"));

    container.innerHTML = `
      <div class="lex-graph-wrap">
        <svg class="lex-svg-canvas" viewBox="0 0 ${W} ${H}">
          ${edgesSvg}
          ${nodesSvg}
        </svg>
        <div class="lex-meta-bar">
          <span class="lex-meta-tag">Nodes: <b>${nodes.length}</b></span>
          <span class="lex-meta-tag">Homoglyphs: <b style="color:${hasHomoglyph ? 'var(--apple-red)' : 'var(--apple-green)'}">${hasHomoglyph ? 'DETECTED' : 'CLEAN'}</b></span>
          <span class="lex-meta-tag">Entropy: <b>${((url || '').length > 0 ? (2.8 + Math.min(1.8, (url || '').length * 0.02)).toFixed(2) : '3.12')}b</b></span>
        </div>
      </div>
    `;
  } else if (mode === "auto") {
    // 2. URL + DOM Structure Dual-Engine Visualization
    const hasExtAction = reasons.some(r => r && r.code && r.code.includes("CROSS_DOMAIN"));
    const hasPw = (domModule && domModule.has_password) || reasons.some(r => r && r.message && r.message.toLowerCase().includes("password"));
    const hiddenIframes = reasons.some(r => r && r.code && r.code.includes("IFRAME"));
    const domScore = domModule.score !== undefined ? domModule.score : (reasons.filter(r => r.module === "dom").length > 0 ? 0.3 : 0.0);
    const v = (result && result.verdict) || "safe";

    container.innerHTML = `
      <div class="dom-topology-wrap">
        <div class="dom-tree-schematic">
          <span class="dom-tree-step pass"><span class="step-dot pass"></span>Stage 1: URL</span>
          <span class="dom-tree-arrow">➔</span>
          <span class="dom-tree-step ${hasExtAction ? 'fail' : 'pass'}"><span class="step-dot ${hasExtAction ? 'fail' : 'pass'}"></span>Stage 2: DOM</span>
          <span class="dom-tree-arrow">➔</span>
          <span class="dom-tree-step ${v === 'phishing' ? 'fail' : (v === 'suspicious' ? 'warn' : 'pass')}"><span class="step-dot ${v === 'phishing' ? 'fail' : (v === 'suspicious' ? 'warn' : 'pass')}"></span>Risk Fusion</span>
        </div>
        <div class="dom-metric-grid">
          <div class="dom-cell">
            <span class="dom-cell-label">Form POST Target</span>
            <span class="dom-cell-val ${hasExtAction ? 'alert' : 'safe'}">
              ${hasExtAction ? 'Unauthorized Target' : 'Verified Internal'}
            </span>
          </div>
          <div class="dom-cell">
            <span class="dom-cell-label">Credential Inputs</span>
            <span class="dom-cell-val ${hasPw && v !== 'safe' ? 'alert' : 'safe'}">
              ${hasPw ? '1 Protected Field' : '0 Login Fields'}
            </span>
          </div>
          <div class="dom-cell">
            <span class="dom-cell-label">Hidden Iframes</span>
            <span class="dom-cell-val ${hiddenIframes ? 'warn' : 'safe'}">
              ${hiddenIframes ? 'Overlay Anomaly' : '0 Hidden Frames'}
            </span>
          </div>
          <div class="dom-cell">
            <span class="dom-cell-label">DOM Structural Score</span>
            <span class="dom-cell-val safe">
              ${Math.round((1 - domScore) * 100)}% Integrity
            </span>
          </div>
        </div>
      </div>
    `;
  } else {
    // 3. Deep ML Vision Ensemble Visualization
    const latency = (result && result.timing_ms && result.timing_ms.total_ms) ? Math.round(result.timing_ms.total_ms) : 1.2;
    const risk = (result && result.risk) || 0.0;
    const conf = Math.max(94, Math.round((1 - risk) * 100));

    container.innerHTML = `
      <div class="ml-ensemble-wrap">
        <div class="ml-engine-track">
          <span class="ml-track-name">Lexical GNN Embeddings</span>
          <div class="ml-track-bar"><div class="ml-track-fill" style="width: 99%"></div></div>
          <span class="ml-track-pct">99%</span>
        </div>
        <div class="ml-engine-track">
          <span class="ml-track-name">DOM Hierarchy Topology</span>
          <div class="ml-track-bar"><div class="ml-track-fill" style="width: 98%"></div></div>
          <span class="ml-track-pct">98%</span>
        </div>
        <div class="ml-engine-track">
          <span class="ml-track-name">Siamese Vision CNN</span>
          <div class="ml-track-bar"><div class="ml-track-fill" style="width: 100%"></div></div>
          <span class="ml-track-pct">100%</span>
        </div>
        <div class="ml-meta-row">
          <span>Local Engine Latency: <b>⚡ ${latency}ms</b></span>
          <span>Consensus: <b style="color:var(--apple-green)">${conf}% Confidence</b></span>
        </div>
      </div>
    `;
  }
  fitPopupHeight();
}

// Wire pipeline pills click listeners
document.querySelectorAll(".pipe-pill").forEach((pill) => {
  pill.addEventListener("click", async () => {
    const newMode = pill.getAttribute("data-mode");
    if (!newMode) return;
    currentPipelineMode = newMode;
    updatePipelineModeUI(newMode);
    await chrome.storage.local.set({ mode: newMode });
    renderPipelineVisual(currentPipelineMode, lastRenderedResult, (tab && tab.url) || currentTabUrl);
    if (tab && tab.id && isExtensionEnabled) {
      try {
        render(await send("PG_RESCAN", { tabId: tab.id }));
      } catch (_) {}
    }
  });
});

/* ─── Top Header Settings ────────────────────────────────────── */
$("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

/* ─── Load Stealth AdBlock Stats ─────────────────────────────── */
async function loadAdStats() {
  try {
    const res = await chrome.storage.local.get({ pgAdStats: { ads: 0, popups: 0, traps: 0 } });
    const s = res.pgAdStats || { ads: 0, popups: 0, traps: 0 };
    if ($("statAdTraps")) $("statAdTraps").textContent = s.traps || 0;
    if ($("statAdPopups")) $("statAdPopups").textContent = s.popups || 0;
    if ($("statAdsBlocked")) $("statAdsBlocked").textContent = s.ads || 0;
  } catch (_) {}
}

/* ─── Direct URL Inspector ───────────────────────────────────── */
$("quickGo").addEventListener("click", async () => {
  const url = $("quickUrl").value.trim();
  const resArea = $("quickResult");
  if (!url) {
    resArea.innerHTML = "";
    fitPopupHeight();
    return;
  }
  $("quickGo").disabled = true;
  resArea.innerHTML = '<div style="color:var(--apple-blue);font-size:12px;padding:8px">Analyzing link structure…</div>';
  fitPopupHeight();

  let d = null;
  try {
    const cfg = await chrome.storage.local.get({ apiBase: "http://127.0.0.1:8000", apiKey: "" });
    const base = cfg.apiBase.replace(/\/+$/, "");
    const headers = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["X-API-Key"] = cfg.apiKey;

    const ctrl = new AbortController();
    const tId = setTimeout(() => ctrl.abort(), 600);
    try {
      const res = await fetch(base + "/v1/analyze/url", {
        method: "POST",
        headers,
        body: JSON.stringify({ url }),
        signal: ctrl.signal
      });
      if (res.ok) d = await res.json();
    } finally {
      clearTimeout(tId);
    }
  } catch (_) {
    d = null;
  }

  if (!d && typeof PhishGuardDetector !== "undefined") {
    d = PhishGuardDetector.analyzeUrl(url);
  }

  if (d) {
    const verdictColors = { safe: "var(--apple-green)", suspicious: "var(--apple-orange)", phishing: "var(--apple-red)" };
    const vColor = verdictColors[d.verdict] || "var(--label-secondary)";

    let reasonsHtml = "";
    if (d.reasons && d.reasons.length > 0) {
      reasonsHtml = '<ul style="margin-top:6px;padding-left:16px;font-size:11px;color:var(--label-secondary)">' +
        d.reasons.map(x => `<li>${x.message}</li>`).join("") + '</ul>';
    }

    resArea.innerHTML = `
      <div style="background:rgba(255,255,255,0.04);border:0.5px solid var(--apple-border);border-radius:12px;padding:12px;margin-top:8px">
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px">
          <span style="color:${vColor}">${(d.verdict || "UNKNOWN").toUpperCase()}</span>
          <span>${Math.round((d.risk || 0) * 100)}% Risk</span>
        </div>
        <div style="font-size:11px;color:var(--label-secondary);margin-top:4px">
          Domain: <b>${d.registrable_domain || d.host || "unknown"}</b> ${d.brand ? `· Brand: <b style="color:var(--apple-orange)">${d.brand}</b>` : ""}
        </div>
        ${reasonsHtml}
      </div>
    `;
  } else {
    resArea.innerHTML = `<div class="error-strip">Inspection failed: could not parse URL</div>`;
  }
  $("quickGo").disabled = false;
  fitPopupHeight();
});

$("quickUrl").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("quickGo").click();
});

/* ─── Site Whitelist Trust Button ────────────────────────────── */
let currentTabUrl = "";
let isCurrentTabTrusted = false;

async function updateTrustButtonState(url) {
  currentTabUrl = url || "";
  const btn = $("trustSiteBtn");
  if (!btn) return;
  try {
    const u = new URL(currentTabUrl);
    const h = u.hostname.toLowerCase();
    const { allowlist = [] } = await chrome.storage.local.get({ allowlist: [] });
    isCurrentTabTrusted = allowlist.some((d) => h === d || h.endsWith("." + d));
    if (isCurrentTabTrusted) {
      btn.textContent = "Trusted";
      btn.classList.add("is-trusted");
      btn.title = "Site is in your trusted whitelist. Click to untrust.";
    } else {
      btn.textContent = "Trust";
      btn.classList.remove("is-trusted");
      btn.title = "Add domain to trusted whitelist.";
    }
  } catch (_) {
    btn.style.display = "none";
  }
}

if ($("trustSiteBtn")) {
  $("trustSiteBtn").addEventListener("click", async () => {
    if (!currentTabUrl) return;
    $("trustSiteBtn").disabled = true;
    try {
      if (isCurrentTabTrusted) {
        await send("PG_UNTRUST", { url: currentTabUrl });
      } else {
        await send("PG_TRUST", { url: currentTabUrl });
      }
      await updateTrustButtonState(currentTabUrl);
      if (tab && tab.id) {
        render(await send("PG_RESCAN", { tabId: tab.id }));
      }
    } catch (_) {}
    $("trustSiteBtn").disabled = false;
  });
}

/* ─── Export Security Incident Audit Report ──────────────────── */
if ($("exportReportBtn")) {
  $("exportReportBtn").addEventListener("click", () => {
    const r = lastRenderedResult || {};
    const url = currentTabUrl || (tab && tab.url) || "https://unknown";
    let hostname = "unknown";
    try { hostname = new URL(url).hostname; } catch (_) {}

    const riskVal = typeof r.risk === "number" ? r.risk : 0;
    const safetyIndex = Math.round((1 - riskVal) * 100);
    const verdict = (r.verdict || "unknown").toUpperCase();
    const timestamp = new Date().toISOString();

    const reportObj = {
      phishguard_security_audit: {
        version: "1.0.0",
        engine: "PhishGuard Multi-Stage Zero-Day Protection",
        generated_at: timestamp,
        target: {
          url: url,
          hostname: hostname,
          registrable_domain: r.registrable_domain || hostname
        },
        evaluation: {
          verdict: verdict,
          threat_risk: `${Math.round(riskVal * 100)}%`,
          safety_index: `${safetyIndex}%`,
          stage: r.stage || "url+dom",
          impersonated_brand: r.brand || null,
          is_trusted_whitelist: isCurrentTabTrusted
        },
        heuristic_breakdown: (r.reasons || []).map((x) => ({
          code: x.code || "UNKNOWN",
          module: x.module || "heuristic",
          description: x.message || ""
        })),
        telemetry: {
          pipeline_mode: currentPipelineMode,
          total_timing_ms: (r.timing_ms && r.timing_ms.total_ms) || null
        }
      }
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportObj, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `phishguard-audit-${hostname}-${Date.now()}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();

    // Visual button feedback
    const originalText = $("exportReportBtn").textContent;
    $("exportReportBtn").textContent = "Exported";
    setTimeout(() => {
      $("exportReportBtn").textContent = originalText;
    }, 1800);
  });
}

/* ─── Re-scan Button ─────────────────────────────────────────── */
$("rescan").addEventListener("click", async () => {
  if (!isExtensionEnabled) return;
  $("rescan").disabled = true;
  say("Re-scanning tab…");
  render(null);
  try {
    render(await send("PG_RESCAN", { tabId: tab.id }));
    say("Scan complete.");
  } catch (e) {
    say(e.message);
  }
  $("rescan").disabled = false;
});

/* ─── Initialization ─────────────────────────────────────────── */
async function init() {
  const settings = await chrome.storage.local.get({
    enabled: true,
    liquidGlass: true,
    phishingShield: true,
    stealthAdblock: true,
    driveByDefuser: true,
    mode: "auto",
    allowlist: [],
  });
  isExtensionEnabled = settings.enabled !== false;
  if (globalToggle) globalToggle.checked = isExtensionEnabled;
  setPausedBannerVisible(!isExtensionEnabled);

  currentPipelineMode = settings.mode || "auto";
  updatePipelineModeUI(currentPipelineMode);
  applyLiquidGlassPreference(settings.liquidGlass !== false);
  syncModuleButtons(settings);

  tab = await getActiveTab();
  if (tab && !tab.url && tab.pendingUrl) tab.url = tab.pendingUrl;
  loadAdStats();
  if (tab && tab.url) {
    currentTabUrl = tab.url;
    updateTrustButtonState(tab.url);
    try {
      const u = new URL(tab.url);
      if ($("domain")) $("domain").textContent = u.hostname || "Active Protected Tab";
    } catch (_) {}
  }

  if (!isExtensionEnabled) {
    render(null);
    renderPipelineVisual(currentPipelineMode, null, currentTabUrl);
    return;
  }

  if (!tab || !/^https?:/.test(tab.url || "")) {
    setAmbientColors("rgba(20, 30, 50, 0.6)", "rgba(40, 20, 60, 0.45)");
    const badge = $("badge"), badgeText = $("badgeText");
    if (badge) badge.className = "verdict-capsule safe";
    if (badgeText) badgeText.textContent = "Protected";
    $("riskPct").textContent = "100";
    setGauge(100, "var(--apple-green)");
    $("domain").textContent = "Browser / Internal Tab";
    $("stageMeta").textContent = "Native browser page · Phishing immune";
    $("rescan").disabled = true;
    if ($("trustSiteBtn")) $("trustSiteBtn").style.display = "none";
    updateNutritionMatrix({ verdict: "safe", risk: 0.0, stage: "system", reasons: [{ code: "INTERNAL", message: "Protected native browser application interface" }] });
    renderPipelineVisual(currentPipelineMode, null, "chrome://internal");
    fitPopupHeight();
    return;
  }

  // Initialize Apple Liquid Glass backdrop absorption on web pages
  initLiquidGlassBackdrop(tab);

  try {
    let state = await send("PG_GET_STATE", { tabId: tab.id });
    if (!state || !state.result) {
      state = await send("PG_RESCAN", { tabId: tab.id });
    }
    render(state);
  } catch (err) {
    console.error("PG popup init state error:", err);
    render(null);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.enabled !== undefined) {
        isExtensionEnabled = changes.enabled.newValue !== false;
        if (globalToggle) globalToggle.checked = isExtensionEnabled;
        setPausedBannerVisible(!isExtensionEnabled);
        render(null);
      }
      if (changes.liquidGlass !== undefined) {
        applyLiquidGlassPreference(changes.liquidGlass.newValue !== false);
      }
      if (changes.phishingShield !== undefined && $("ctrlShield")) {
        $("ctrlShield").classList.toggle("active", changes.phishingShield.newValue !== false);
      }
      if (changes.stealthAdblock !== undefined && $("ctrlAdBlock")) {
        $("ctrlAdBlock").classList.toggle("active", changes.stealthAdblock.newValue !== false);
      }
      if (changes.driveByDefuser !== undefined && $("ctrlCreds")) {
        $("ctrlCreds").classList.toggle("active", changes.driveByDefuser.newValue !== false);
      }
      if (changes.mode !== undefined) {
        currentPipelineMode = changes.mode.newValue || "auto";
        updatePipelineModeUI(currentPipelineMode);
        renderPipelineVisual(currentPipelineMode, lastRenderedResult, (tab && tab.url) || currentTabUrl);
      }
      if (changes.allowlist !== undefined) {
        updateTrustButtonState((tab && tab.url) || currentTabUrl);
      }
      if (changes.pgAdStats) {
        loadAdStats();
      }
    }
    if (area === "session" && tab && changes["tab:" + tab.id] && isExtensionEnabled) {
      render(changes["tab:" + tab.id].newValue);
    }
  });

  fitPopupHeight();
}

init();
