"use strict";
/*
 * PhishGuard Stealth AdBlocker (Isolated World Content Script)
 * - Listens for blocked popups reported by main-world defuser
 * - Defuses video player click-jacking overlays on movie/streaming sites
 * - Injects stealth CSS rules to hide deceptive ad containers without tripping height checks
 * - Completely CSP-compliant (no inline script injections into DOM)
 */

(() => {
  if (window.__pgAdBlockLoaded) return;
  window.__pgAdBlockLoaded = true;

  let isEnabled = true;
  let styleEl = null;
  let observer = null;

  function reportStats(kind) {
    if (!isEnabled) return;
    chrome.storage.local.get({ pgAdStats: { ads: 0, popups: 0, traps: 0 } }, (res) => {
      const s = res.pgAdStats || { ads: 0, popups: 0, traps: 0 };
      if (kind === "ad") s.ads = (s.ads || 0) + 1;
      if (kind === "popup") s.popups = (s.popups || 0) + 1;
      if (kind === "trap") s.traps = (s.traps || 0) + 1;
      chrome.storage.local.set({ pgAdStats: s });
    });
  }

  // Listen for popup messages from main-world defuser
  window.addEventListener("message", (e) => {
    if (isEnabled && e.data && e.data.type === "PG_POPUP_BLOCKED") {
      reportStats("popup");
    }
  });

  function applyStealthStyles() {
    if (styleEl || !document.documentElement) return;
    styleEl = document.createElement("style");
    styleEl.id = "__phishguard_stealth_rules__";
    styleEl.textContent = `
      iframe[src*="adsterra"],
      iframe[src*="exoclick"],
      iframe[src*="propeller"],
      iframe[src*="onclickmega"],
      iframe[src*="adxcore"],
      iframe[src*="doubleclick"],
      div[class*="ad-overlay"],
      div[id*="ad-overlay"],
      a[href*="onclickmega"],
      a[href*="trafficjunky"],
      div[class*="banner-ads"],
      .ad-banner-floating,
      #ad-container-fixed {
        opacity: 0 !important;
        pointer-events: none !important;
        position: absolute !important;
        z-index: -9999 !important;
        clip-path: inset(100%) !important;
      }
      .jw-preview, .jw-controls {
        pointer-events: auto !important;
      }
    `;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function removeStealthStyles() {
    if (styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
    }
  }

  // Video Player Click-Jacking Overlay Stripper
  function neutralizeClickJackingOverlays() {
    if (!isEnabled) return;
    const videoContainers = document.querySelectorAll(
      "video, iframe[src*='embed'], iframe[src*='player'], .jwplayer, #player, .player-container, #vplayer"
    );

    videoContainers.forEach((vc) => {
      const parent = vc.parentElement;
      if (!parent) return;

      const siblings = parent.querySelectorAll("a[target='_blank'], div[style*='position: absolute'], div[style*='position: fixed']");
      siblings.forEach((s) => {
        if (s.contains(vc)) return;
        const rect = s.getBoundingClientRect();
        const vRect = vc.getBoundingClientRect();

        if (
          rect.width > 100 &&
          rect.height > 100 &&
          Math.abs(rect.top - vRect.top) < 150 &&
          s.innerText.trim().length === 0 &&
          s.style.display !== "none"
        ) {
          s.style.display = "none";
          s.style.pointerEvents = "none";
          reportStats("ad");
        }
      });
    });
  }

  // Fake Download / Decoy Player Button Defuser
  function neutralizeDecoyDownloadButtons() {
    if (!isEnabled) return;
    const decoyKeywords = /^(download|download hd|fast download|direct download|play now|watch in hd|start download)$/i;
    const suspiciousLinks = document.querySelectorAll("a[href], button");

    suspiciousLinks.forEach((el) => {
      if (el.dataset.pgDefused) return;
      const text = (el.innerText || "").trim();
      if (!decoyKeywords.test(text)) return;

      const href = (el.getAttribute("href") || "").toLowerCase();
      if (
        href.includes("adsterra") ||
        href.includes("onclick") ||
        href.includes("traff") ||
        href.includes("redirect") ||
        href.includes("clk") ||
        el.getAttribute("target") === "_blank"
      ) {
        el.dataset.pgDefused = "true";
        el.style.opacity = "0.2";
        el.style.pointerEvents = "none";
        el.style.filter = "grayscale(100%)";
        el.setAttribute("title", "PhishGuard: Decoy trap button defused");
        reportStats("trap");
      }
    });
  }

  function runDefusers() {
    if (!isEnabled) return;
    neutralizeClickJackingOverlays();
    neutralizeDecoyDownloadButtons();
  }

  function startObserver() {
    if (observer) return;
    let timer = null;
    observer = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        runDefusers();
      }, 500);
    });
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function updateActiveState(settings) {
    const shouldRun = settings.enabled !== false && settings.stealthAdblock !== false;
    isEnabled = shouldRun;
    if (shouldRun) {
      applyStealthStyles();
      runDefusers();
      startObserver();
    } else {
      removeStealthStyles();
      stopObserver();
    }
  }

  // Initialize from storage
  chrome.storage.local.get({ enabled: true, stealthAdblock: true }, (s) => {
    updateActiveState(s);
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled !== undefined || changes.stealthAdblock !== undefined) {
      chrome.storage.local.get({ enabled: true, stealthAdblock: true }, (s) => {
        updateActiveState(s);
      });
    }
  });
})();
