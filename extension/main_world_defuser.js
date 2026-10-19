"use strict";
/*
 * PhishGuard Main-World Scriptlet
 * Executed natively by Chromium in the page's MAIN execution context (world: "MAIN").
 * Completely immune to Content Security Policy (CSP) inline-script restrictions.
 */

(() => {
  if (window.__pgMainWorldActive) return;
  window.__pgMainWorldActive = true;

  // 1. Stub anti-adblock detector flags
  try {
    Object.defineProperty(window, "canRunAds", { value: true, writable: true, configurable: true });
    Object.defineProperty(window, "isAdBlockActive", { value: false, writable: true, configurable: true });
    Object.defineProperty(window, "hasAdBlock", { value: false, writable: true, configurable: true });
    Object.defineProperty(window, "adblockDetected", { value: false, writable: true, configurable: true });
    window.google_ad_client = "ca-pub-mock-phishguard";

    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.push = function() { return 1; };
    window.adsbygoogle.loaded = true;
  } catch (_) {}

  // 2. Mock FuckAdBlock / BlockAdBlock / SnackAdBlock
  const noopSelf = function() { return this; };
  const mockDetector = {
    on: function(isBlocked, fn) {
      if (!isBlocked && typeof fn === "function") setTimeout(fn, 10);
      return this;
    },
    onDetected: noopSelf,
    onNotDetected: function(fn) {
      if (typeof fn === "function") setTimeout(fn, 10);
      return this;
    },
    check: function(fn) {
      if (typeof fn === "function") setTimeout(() => fn(false), 10);
      return this;
    },
    setOption: noopSelf,
    clearEvent: noopSelf
  };

  try {
    window.FuckAdBlock = function() { return mockDetector; };
    window.fuckAdBlock = mockDetector;
    window.BlockAdBlock = function() { return mockDetector; };
    window.blockAdBlock = mockDetector;
    window.SnackAdBlock = mockDetector;
    window.detectAdBlock = function() { return Promise.resolve(false); };
  } catch (_) {}

  // 3. Intercept deceptive pop-unders (e.g. streaming sites clicking anywhere triggers window.open)
  const origOpen = window.open;
  const AD_PATTERNS = /(popcash|propeller|adsterra|exoclick|bet365|1xbet|onclickmega|trafficjunky|adxcore|yadro|directrev|syndication|clickadu|juicyads|vidoomy|streamtape.*ad|fembed.*ad)/i;

  window.open = function(url, target, features) {
    if (typeof url === "string" && AD_PATTERNS.test(url)) {
      window.postMessage({ type: "PG_POPUP_BLOCKED", url }, "*");
      return null; // Neutralize deceptive pop-under
    }
    return origOpen.apply(this, arguments);
  };
})();
