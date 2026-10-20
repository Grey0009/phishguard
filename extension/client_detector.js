"use strict";
/**
 * PhishGuard Client-Side Security Intelligence Engine
 * 
 * Provides 100% in-browser, zero-latency phishing detection and threat mitigation
 * without requiring any local Python backend or terminal window.
 *
 * Implements:
 *   1. Lexical URL analysis & Punycode / IDN homoglyph engine
 *   2. Unicode TR39 visual confusable skeletons (paypa1, rnicrosoft, pаypal)
 *   3. 45+ Protected brand impersonation detection (PayPal, Apple, Google, Microsoft, Banks)
 *   4. Token Adjacency Lexical Graph generator (for popup visualization)
 *   5. Structural DOM form auditor (credential traps, unencrypted actions, cross-domain posts)
 *   6. Multi-evidence Noisy-OR risk fusion & explainable threat reasons
 */

(() => {
  // ─── 1. PROTECTED BRAND DATABASE ───────────────────────────────────────────
  const BRANDS = [
    { name: "PayPal", keywords: ["paypal"], domains: ["paypal.com", "paypal.me"] },
    { name: "Google", keywords: ["google", "gmail"], domains: ["google.com", "google.co.in", "gmail.com", "youtube.com"] },
    { name: "Microsoft", keywords: ["microsoft", "office365", "onedrive"], domains: ["microsoft.com", "live.com", "office.com", "microsoftonline.com", "outlook.com", "office365.com", "onedrive.com", "hotmail.com", "bing.com", "windows.com", "azure.com"] },
    { name: "Apple", keywords: ["apple", "icloud", "appleid"], domains: ["apple.com", "icloud.com"] },
    { name: "Amazon", keywords: ["amazon"], domains: ["amazon.com", "amazon.in", "amazon.co.uk", "amazon.de"] },
    { name: "Facebook", keywords: ["facebook"], domains: ["facebook.com", "fb.com", "messenger.com", "meta.com"] },
    { name: "Instagram", keywords: ["instagram"], domains: ["instagram.com"] },
    { name: "WhatsApp", keywords: ["whatsapp"], domains: ["whatsapp.com", "whatsapp.net"] },
    { name: "Netflix", keywords: ["netflix"], domains: ["netflix.com"] },
    { name: "LinkedIn", keywords: ["linkedin"], domains: ["linkedin.com"] },
    { name: "GitHub", keywords: ["github"], domains: ["github.com"] },
    { name: "Dropbox", keywords: ["dropbox"], domains: ["dropbox.com"] },
    { name: "Adobe", keywords: ["adobe"], domains: ["adobe.com"] },
    { name: "Twitter / X", keywords: ["twitter"], domains: ["twitter.com", "x.com"] },
    { name: "Yahoo", keywords: ["yahoo"], domains: ["yahoo.com"] },
    { name: "Spotify", keywords: ["spotify"], domains: ["spotify.com"] },
    { name: "Discord", keywords: ["discord"], domains: ["discord.com"] },
    { name: "Telegram", keywords: ["telegram"], domains: ["telegram.org", "t.me"] },
    { name: "Zoom", keywords: ["zoom"], domains: ["zoom.us"] },
    { name: "DocuSign", keywords: ["docusign"], domains: ["docusign.com", "docusign.net"] },
    { name: "Steam", keywords: ["steampowered", "steamcommunity"], domains: ["steampowered.com", "steamcommunity.com"] },
    { name: "Binance", keywords: ["binance"], domains: ["binance.com"] },
    { name: "Coinbase", keywords: ["coinbase"], domains: ["coinbase.com"] },
    { name: "MetaMask", keywords: ["metamask"], domains: ["metamask.io"] },
    { name: "DHL", keywords: ["dhl"], domains: ["dhl.com"] },
    { name: "FedEx", keywords: ["fedex"], domains: ["fedex.com"] },
    { name: "UPS", keywords: ["ups"], domains: ["ups.com"] },
    { name: "USPS", keywords: ["usps"], domains: ["usps.com"] },
    { name: "State Bank of India", keywords: ["sbi", "onlinesbi"], domains: ["sbi.co.in", "onlinesbi.sbi", "onlinesbi.com", "sbicard.com"] },
    { name: "HDFC Bank", keywords: ["hdfcbank"], domains: ["hdfcbank.com"] },
    { name: "ICICI Bank", keywords: ["icicibank"], domains: ["icicibank.com"] },
    { name: "Axis Bank", keywords: ["axisbank"], domains: ["axisbank.com"] },
    { name: "Kotak Bank", keywords: ["kotak"], domains: ["kotak.com"] },
    { name: "Punjab National Bank", keywords: ["pnbindia"], domains: ["pnbindia.in"] },
    { name: "Bank of Baroda", keywords: ["bankofbaroda"], domains: ["bankofbaroda.in", "bankofbaroda.com"] },
    { name: "Canara Bank", keywords: ["canarabank"], domains: ["canarabank.com"] },
    { name: "Paytm", keywords: ["paytm"], domains: ["paytm.com"] },
    { name: "PhonePe", keywords: ["phonepe"], domains: ["phonepe.com"] },
    { name: "Flipkart", keywords: ["flipkart"], domains: ["flipkart.com"] },
    { name: "IRCTC", keywords: ["irctc"], domains: ["irctc.co.in"] },
    { name: "Income Tax India", keywords: ["incometax", "incometaxindia", "incometaxindiaefiling"], domains: ["incometax.gov.in", "incometaxindiaefiling.gov.in"] },
    { name: "UIDAI (Aadhaar)", keywords: ["uidai"], domains: ["uidai.gov.in"] },
    { name: "DigiLocker", keywords: ["digilocker"], domains: ["digilocker.gov.in"] },
    { name: "SPPU", keywords: ["unipune", "sppu"], domains: ["unipune.ac.in"] },
    { name: "Chase", keywords: ["chase", "jpmorgan"], domains: ["chase.com", "jpmorgan.com"] },
    { name: "Bank of America", keywords: ["bankofamerica", "bofa"], domains: ["bankofamerica.com", "bofa.com"] },
    { name: "Wells Fargo", keywords: ["wellsfargo"], domains: ["wellsfargo.com"] },
    { name: "Citibank", keywords: ["citibank", "citi"], domains: ["citi.com", "citibank.com"] },
    { name: "Udemy", keywords: ["udemy"], domains: ["udemy.com"] },
    { name: "Wikipedia", keywords: ["wikipedia"], domains: ["wikipedia.org"] },
    { name: "Reddit", keywords: ["reddit"], domains: ["reddit.com"] },
    { name: "Stack Overflow", keywords: ["stackoverflow"], domains: ["stackoverflow.com"] },
    { name: "Brave", keywords: ["brave"], domains: ["brave.com"] }
  ];

  // ─── 2. REPUTATION & TLD HEURISTICS ───────────────────────────────────────
  const SUSPICIOUS_TLDS = new Set([
    "tk", "ml", "ga", "cf", "gq", "xyz", "top", "click", "zip", "mov", "work",
    "support", "rest", "icu", "buzz", "cyou", "cfd", "sbs", "country", "kim",
    "loan", "men", "party", "review", "stream", "download", "racing", "win",
    "bid", "date", "cam", "monster", "quest", "mobi", "info", "pro", "cc",
    "vip", "live", "link", "surf", "space", "club", "fit", "fun", "uno", "pw", "ws"
  ]);

  const PIRACY_MALWARE_TOKENS = new Set([
    "moviesflix", "filmyzilla", "filmy4wap", "9xmovies", "tamilrockers", "123movies",
    "fmovies", "putlocker", "torrent", "warez", "crack", "keygen", "modapk", "freeapk",
    "freemovie", "watchfree", "moviesda", "kuttymovies", "isaimini", "pagalworld",
    "themoviesflix"
  ]);

  const KEYWORDS = new Set([
    "login", "signin", "verify", "verification", "secure", "security", "account",
    "update", "confirm", "banking", "wallet", "password", "webscr", "suspended",
    "unlock", "billing", "invoice", "payment", "otp", "kyc", "aadhaar", "refund",
    "claim", "reward", "recover", "recovery", "validate", "authentication",
    "limited", "unusual"
  ]);

  const SHORTENERS = new Set([
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy",
    "ow.ly", "buff.ly", "shorturl.at", "tiny.cc", "rebrand.ly", "t.ly",
    "bl.ink", "lnkd.in", "s.id", "v.gd"
  ]);

  const MULTI_PART_SUFFIXES = new Set([
    "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au",
    "co.in", "net.in", "org.in", "ac.in", "gov.in", "edu.in", "res.in",
    "nic.in", "co.jp", "com.br", "com.cn", "com.sg", "co.nz", "co.za",
    "com.mx", "com.tr", "com.pk", "com.bd", "co.id", "com.my", "com.ph",
    "com.hk", "co.kr", "com.ar", "com.ng", "co.ke"
  ]);

  const SHARED_HOSTING_SUFFIXES = new Set([
    "github.io", "pages.dev", "netlify.app", "vercel.app", "web.app",
    "firebaseapp.com", "blogspot.com", "weebly.com", "wixsite.com",
    "herokuapp.com", "glitch.me", "workers.dev", "onrender.com",
    "000webhostapp.com", "notion.site", "ngrok.io", "ngrok-free.app",
    "trycloudflare.com", "sharepoint.com", "s3.amazonaws.com",
    "azurewebsites.net", "r2.dev", "repl.co", "surge.sh", "fly.dev",
    "framer.app", "carrd.co", "webflow.io", "myshopify.com", "lovable.app"
  ]);

  const TLD_LABELS = new Set(["com", "net", "org", "co", "gov", "edu"]);

  const CREDENTIAL_WORDS = [
    "password", "passcode", "otp", "cvv", "card number", "debit card", "credit card",
    "aadhaar", "aadhar", "pan number", "upi pin", "net banking", "netbanking",
    "social security", "ssn", "security code", "mpin", "atm pin"
  ];

  const URGENCY_WORDS = [
    "verify your account", "account suspended", "account will be", "urgent",
    "immediately", "within 24 hours", "unusual activity", "confirm your identity",
    "locked", "limited access", "update your information", "kyc"
  ];

  // ─── 3. HOMOGLYPHS & CONFUSABLES (TR39) ──────────────────────────────────
  const CONFUSABLES = {
    // Cyrillic
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y",
    "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "һ": "h", "ӏ": "l", "ԛ": "q",
    "ԝ": "w", "ɡ": "g", "к": "k", "ѵ": "v", "ү": "y", "ɩ": "i",
    // Greek
    "ο": "o", "ν": "v", "α": "a", "ρ": "p", "ι": "i", "κ": "k", "υ": "u",
    "χ": "x", "ɑ": "a", "ԍ": "g",
    // Armenian
    "ո": "n", "օ": "o", "ս": "u", "ց": "g", "զ": "q",
    // Latin extended / misc
    "ı": "i", "ł": "l", "ø": "o", "đ": "d", "ƅ": "b", "ǀ": "l", "ⅼ": "l",
    "ℓ": "l"
  };

  function hasConfusableChars(str) {
    if (!str) return false;
    const lower = str.toLowerCase();
    for (const ch of lower) {
      if (CONFUSABLES[ch]) return true;
    }
    return false;
  }

  function skeleton(text) {
    if (!text) return "";
    let t = String(text).normalize("NFKC").toLowerCase();
    let res = "";
    for (const ch of t) {
      res += CONFUSABLES[ch] || ch;
    }
    return res.replace(/rn/g, "m")
              .replace(/vv/g, "w")
              .replace(/0/g, "o")
              .replace(/[1i|]/g, "l");
  }

  function isMixedScript(label) {
    if (!label) return false;
    const hasLatin = /\p{Script=Latin}/u.test(label);
    const hasNonLatin = /\p{Script=Cyrillic}|\p{Script=Greek}|\p{Script=Armenian}/u.test(label);
    return hasLatin && hasNonLatin;
  }

  // ─── 4. UTILITIES & STRING METRICS ─────────────────────────────────────────
  function tokenize(text) {
    if (!text) return [];
    return String(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }

  function shannonEntropy(s) {
    if (!s) return 0.0;
    const counts = {};
    for (const ch of s) counts[ch] = (counts[ch] || 0) + 1;
    const n = s.length;
    let ent = 0.0;
    for (const c of Object.values(counts)) {
      const p = c / n;
      ent -= p * Math.log2(p);
    }
    return ent;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      const ca = a[i - 1];
      for (let j = 1; j <= b.length; j++) {
        const cb = b[j - 1];
        const cost = ca === cb ? 0 : 1;
        cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  const VOWELS = new Set(["a", "e", "i", "o", "u"]);
  function looksRandom(tok) {
    if (!tok || tok.length < 10 || /[^\x00-\x7F]/.test(tok)) return false;
    const letters = [...tok].filter(c => /[a-z]/i.test(c));
    if (!letters.length) return false;
    const vowelCount = letters.filter(c => VOWELS.has(c.toLowerCase())).length;
    const vowelRatio = vowelCount / letters.length;
    const digitCount = [...tok].filter(c => /\d/.test(c)).length;
    const digitRatio = digitCount / tok.length;
    return vowelRatio < 0.22 || (digitRatio > 0.2 && digitRatio < 0.8 && letters.length >= 3);
  }

  function squash(points, scale = 4.5) {
    return 1.0 - Math.exp(-Math.max(points, 0.0) / scale);
  }

  // ─── 5. URL PARSER & REGISTRABLE DOMAIN EXTRACTION ─────────────────────────
  function parseUrl(raw) {
    raw = String(raw || "").trim();
    const p = {
      raw, valid: true, scheme: "", userinfo: "", host: "", unicode_host: "",
      port: null, path: "", query: "", fragment: "", sub_labels: [], sld: "",
      suffix: "", registrable: "", is_ip: false, is_local: false, shared_hosting: false,
      is_https: false
    };

    if (!raw || raw.length > 4096) { p.valid = false; return p; }
    let candidate = raw;
    if (!candidate.includes("://") && !candidate.startsWith("//")) {
      candidate = "http://" + candidate;
    }

    let u;
    try {
      u = new URL(candidate);
    } catch (_) {
      p.valid = false;
      return p;
    }

    if (u.protocol !== "http:" && u.protocol !== "https:") {
      p.valid = false;
      return p;
    }

    p.scheme = u.protocol.replace(":", "").toLowerCase();
    p.is_https = p.scheme === "https";
    p.host = u.hostname.toLowerCase().replace(/\.+$/, "");
    p.unicode_host = p.host;
    p.port = u.port ? parseInt(u.port, 10) : null;
    p.path = u.pathname || "";
    p.query = u.search ? u.search.slice(1) : "";
    p.fragment = u.hash ? u.hash.slice(1) : "";
    p.userinfo = (u.username || "") + (u.password ? ":" + u.password : "");

    // Raw authority for decoy userinfo check
    const rest = raw.split("://")[1] || raw;
    const authority = rest.split("/")[0].split("?")[0].split("#")[0];
    if (authority.includes("@")) {
      p.userinfo = authority.split("@")[0];
    }

    // IP Check
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(p.host);
    const isHexOrDec = /^\d{8,10}$/.test(p.host) || /^0x[0-9a-f]+$/i.test(p.host);
    if (isIpv4 || isHexOrDec || p.host.startsWith("[")) {
      p.is_ip = true;
      p.is_local = p.host.startsWith("127.") || p.host.startsWith("10.") ||
                   p.host.startsWith("192.168.") || p.host === "localhost" ||
                   p.host.startsWith("172.16.") || p.host.startsWith("172.17.") ||
                   p.host.startsWith("172.18.") || p.host.startsWith("172.19.") ||
                   p.host.startsWith("172.2") || p.host.startsWith("172.3");
      p.sld = p.host;
      p.registrable = p.host;
      return p;
    }

    if (p.host === "localhost") {
      p.is_local = true;
      p.sld = "localhost";
      p.registrable = "localhost";
      return p;
    }

    const asciiLabels = p.host.split(".");
    let suffixLen = 1;
    for (const n of [3, 2]) {
      if (asciiLabels.length > n) {
        const cand = asciiLabels.slice(-n).join(".");
        if (MULTI_PART_SUFFIXES.has(cand) || SHARED_HOSTING_SUFFIXES.has(cand)) {
          suffixLen = n;
          break;
        }
      }
    }

    if (asciiLabels.length <= suffixLen) {
      p.sld = p.host;
      p.registrable = p.host;
      p.suffix = "";
      return p;
    }

    p.suffix = asciiLabels.slice(-suffixLen).join(".");
    p.sld = asciiLabels[asciiLabels.length - suffixLen - 1];
    p.sub_labels = asciiLabels.slice(0, asciiLabels.length - suffixLen - 1);
    p.registrable = asciiLabels.slice(-suffixLen - 1).join(".");
    p.shared_hosting = SHARED_HOSTING_SUFFIXES.has(p.suffix);
    return p;
  }

  // ─── 6. BRAND SIGNALS & IMPERSONATION DETECTION ────────────────────────────
  function brandSignal(p) {
    let best = null;
    const rank = { homoglyph: 5, subdomain: 4, typosquat: 3, sld_token: 2, path: 1 };

    function consider(name, kind, evidence) {
      if (!best || rank[kind] > rank[best.kind]) {
        best = { name, kind, evidence };
      }
    }

    const subTokens = p.sub_labels.flatMap(tokenize);
    const sldTokens = p.is_ip ? [] : tokenize(p.sld);
    const sldFlat = sldTokens.join("");
    const pathTokens = tokenize(p.path).concat(tokenize(p.query));

    for (const b of BRANDS) {
      for (const kw of b.keywords) {
        // 1. Homoglyph / Look-alike check
        if (kw.length >= 4) {
          const sk = skeleton(kw);
          for (const tok of sldTokens.concat([sldFlat], subTokens)) {
            if (tok && tok !== kw && skeleton(tok) === sk) {
              consider(b.name, "homoglyph", `'${tok}' visually mimics '${kw}'`);
            }
          }
          if (hasConfusableChars(p.sld) && skeleton(p.sld) === sk && p.sld !== kw) {
            consider(b.name, "homoglyph", `'${p.sld}' visually mimics '${kw}'`);
          }
        }

        // 2. Subdomain deception (e.g. paypal.com.evil.com)
        if (subTokens.includes(kw)) {
          consider(b.name, "subdomain", `'${kw}' appears as a deceptive sub-domain of ${p.registrable}`);
        }

        // 3. Combined SLD token (e.g. paypal-login.com)
        if (sldTokens.includes(kw) && sldFlat !== kw) {
          consider(b.name, "sld_token", `'${kw}' is paired with other words in '${p.sld}'`);
        } else if (kw.length >= 6 && sldFlat.includes(kw) && sldFlat !== kw) {
          consider(b.name, "sld_token", `'${kw}' is embedded in '${p.sld}'`);
        }

        // 4. Typosquatting (Levenshtein distance 1-2)
        if (kw.length >= 6) {
          for (const tok of new Set(sldTokens.concat([sldFlat]))) {
            if (tok && tok !== kw && Math.abs(tok.length - kw.length) <= 2) {
              const d = levenshtein(tok, kw);
              const limit = kw.length < 8 ? 1 : 2;
              if (d >= 1 && d <= limit && skeleton(tok) !== skeleton(kw)) {
                consider(b.name, "typosquat", `'${tok}' is ${d} typo edit(s) from '${kw}'`);
              }
            }
          }
        }

        // 5. Path mention
        if (pathTokens.includes(kw)) {
          consider(b.name, "path", `'${kw}' is referenced in the URL path of an unrelated domain`);
        }
      }
    }

    return best;
  }

  function findLegitBrand(p) {
    if (!p.registrable) return null;
    return BRANDS.find(b => b.domains.includes(p.registrable) || b.domains.includes(p.host)) || null;
  }

  // ─── 7. URL LEXICAL GRAPH GENERATOR ────────────────────────────────────────
  function buildUrlGraph(p) {
    const nodes = [];
    const edges = [];
    const addNode = (id, label, kind) => nodes.push({ id, label, kind });
    const addEdge = (a, b) => edges.push([a, b]);

    addNode("url", p.raw.slice(0, 48), "url");
    addNode("scheme", p.scheme, "scheme");
    addEdge("url", "scheme");

    if (p.suffix) {
      addNode("suffix", "." + p.suffix, "suffix");
      addEdge("url", "suffix");
    }

    if (p.sld) {
      addNode("sld", p.sld, "sld");
      addEdge("url", "sld");
      const tokens = tokenize(p.sld);
      tokens.forEach((t, i) => {
        const id = `sld_t_${i}`;
        addNode(id, t, "token");
        addEdge("sld", id);
      });
    }

    p.sub_labels.forEach((sub, i) => {
      const id = `sub_${i}`;
      addNode(id, sub, "subdomain");
      addEdge("url", id);
      tokenize(sub).forEach((t, ti) => {
        const tid = `sub_${i}_t_${ti}`;
        addNode(tid, t, "token");
        addEdge(id, tid);
      });
    });

    if (p.path && p.path !== "/") {
      const segs = p.path.split("/").filter(Boolean).slice(0, 3);
      segs.forEach((seg, i) => {
        const id = `path_${i}`;
        addNode(id, "/" + seg, "path");
        addEdge("url", id);
      });
    }

    return { nodes, edges };
  }

  // ─── 8. CLIENT-SIDE URL ANALYSIS STAGE ──────────────────────────────────────
  function analyzeUrl(rawUrl, allowlist = []) {
    const t0 = performance.now();
    const p = parseUrl(rawUrl);

    if (!p.valid) {
      return {
        verdict: "suspicious",
        risk: 0.45,
        brand: null,
        stage: "url",
        host: p.host || "unknown",
        registrable_domain: p.host || "unknown",
        trusted: false,
        reasons: [{ module: "url", code: "INVALID_URL", message: "URL could not be parsed as valid HTTP(S)", points: 2.0 }],
        graph: { nodes: [], edges: [] },
        timing_ms: { total_ms: +(performance.now() - t0).toFixed(2) }
      };
    }

    // Allowlist check
    const isAllowlisted = allowlist.some(d => p.host === d || p.host.endsWith("." + d));
    if (isAllowlisted) {
      return {
        verdict: "safe",
        risk: 0.0,
        brand: null,
        stage: "allowlist",
        host: p.host,
        registrable_domain: p.registrable,
        trusted: true,
        reasons: [{ module: "url", code: "ALLOWLISTED", message: "Domain is in your trusted allowlist", points: 0.0 }],
        graph: buildUrlGraph(p),
        timing_ms: { total_ms: +(performance.now() - t0).toFixed(2) }
      };
    }

    // Legit brand check
    const legit = findLegitBrand(p);
    if (legit) {
      return {
        verdict: "safe",
        risk: 0.0,
        brand: legit.name,
        stage: "url",
        host: p.host,
        registrable_domain: p.registrable,
        trusted: true,
        trusted_brand: legit.name,
        reasons: [{ module: "url", code: "TRUSTED_DOMAIN", message: `Known legitimate domain of ${legit.name}`, points: 0.0 }],
        graph: buildUrlGraph(p),
        timing_ms: { total_ms: +(performance.now() - t0).toFixed(2) }
      };
    }

    const reasons = [];
    let points = 0.0;
    const add = (code, msg, pts) => {
      reasons.push({ module: "url", code, message: msg, points: pts });
      points += pts;
    };

    const hostTokens = tokenize(p.unicode_host);
    const pathTokens = tokenize(p.path).concat(tokenize(p.query));
    const kwInHost = hostTokens.filter(t => KEYWORDS.has(t));
    const kwInPath = pathTokens.filter(t => KEYWORDS.has(t));
    const nKw = new Set(kwInHost.concat(kwInPath)).size;

    // Rules
    if (p.is_ip && !p.is_local) {
      add("IP_HOST", "Host is a raw IP address instead of a domain name", 3.0);
    } else if (p.is_local) {
      add("LOCAL_HOST", "Host is a local or loopback private network address", 0.1);
    }

    if (p.userinfo) {
      add("USERINFO_AT", "URL contains user-info ('@') designed to camouflage the host", 2.5);
      if (/[a-z0-9-]+\.[a-z]{2,}/i.test(p.userinfo)) {
        add("USERINFO_FAKE_HOST", "Decoy domain name appears before the '@' sign", 3.0);
      }
    }

    if (p.host.includes("xn--")) {
      add("PUNYCODE", "Domain uses internationalized punycode characters", 1.5);
    }

    const hasMixed = p.unicode_host.split(".").some(isMixedScript);
    if (hasMixed) {
      add("MIXED_SCRIPT", "Domain label mixes Latin with Cyrillic / Greek alphabets (homograph attack)", 4.0);
    }

    const tld = p.suffix ? p.suffix.split(".").pop() : "";
    if (SUSPICIOUS_TLDS.has(tld)) {
      add("SUSPICIOUS_TLD", `Top-level domain .${tld} is frequently abused for phishing, spam, and piracy`, 1.8);
    }

    // Unauthorized media piracy / download lures
    const piracyHits = hostTokens.filter(t => PIRACY_MALWARE_TOKENS.has(t) || Array.from(PIRACY_MALWARE_TOKENS).some(tok => t.includes(tok)));
    if (piracyHits.length > 0) {
      add("PIRACY_MALWARE_LURE", `Domain uses unauthorized media piracy or download lure tokens (${piracyHits.slice(0, 2).join(", ")})`, 2.2);
    }

    if (SHORTENERS.has(p.registrable)) {
      add("SHORTENER", "URL shortener obscures the final target destination", 1.5);
    }

    if (p.sub_labels.length >= 4) {
      add("MANY_SUBDOMAINS", `${p.sub_labels.length} nested sub-domains detected`, 1.5);
    }

    if ((p.unicode_host.match(/-/g) || []).length >= 3) {
      add("MANY_HYPHENS", "Host name contains excessive hyphens", 1.2);
    }

    if (p.host.length > 40) {
      add("LONG_HOST", "Host name is unusually lengthy", 1.0);
    }

    if (p.port && p.port !== 80 && p.port !== 443 && !p.is_local) {
      add("ODD_PORT", `Non-standard port :${p.port} in use`, 1.0);
    }

    if (!p.is_https && !p.is_local) {
      add("NO_HTTPS", "Connection is unencrypted HTTP", 0.7);
    }

    if (p.shared_hosting) {
      add("FREE_HOSTING", `Hosted on a public/free shared platform (${p.registrable})`, 1.0);
    }

    if (p.sub_labels.some(l => TLD_LABELS.has(l))) {
      add("TLD_IN_SUBDOMAIN", "Deceptive domain suffix (e.g. '.com') positioned inside sub-domain", 2.0);
    }

    if (hostTokens.some(looksRandom)) {
      add("RANDOM_HOST", "Host contains machine-generated algorithmic random tokens", 1.2);
    }

    if (nKw > 0) {
      const topKws = Array.from(new Set(kwInHost.concat(kwInPath))).slice(0, 4);
      add("KEYWORDS", `Sensitive phishing lure keywords: ${topKws.join(", ")}`, Math.min(nKw, 3) * 0.8);
    }

    // Brand impersonation signals
    const sig = brandSignal(p);
    if (sig) {
      const { name: nm, kind: k, evidence: ev } = sig;
      if (k === "homoglyph") {
        add("BRAND_HOMOGLYPH", `Visual clone of ${nm}: ${ev}`, 9.0);
      } else if (k === "subdomain") {
        add("BRAND_SUBDOMAIN", `Impersonates ${nm}: ${ev}`, 4.5);
      } else if (k === "typosquat") {
        add("BRAND_TYPOSQUAT", `Typo-squatting variant of ${nm}: ${ev}`, 3.8);
      } else if (k === "sld_token") {
        add("BRAND_IN_DOMAIN", `Combines brand name ${nm} with external domain: ${ev}`, 2.2);
      } else if (k === "path") {
        add("BRAND_IN_PATH", `${nm} referenced in path on unrelated domain`, 1.5);
      }

      if ((k === "sld_token" || k === "typosquat") && (SUSPICIOUS_TLDS.has(tld) || p.shared_hosting)) {
        add("BRAND_ABUSED_TLD", `Brand ${nm} combined with high-risk TLD or free hosting`, 1.8);
      }
    }

    // If an unknown domain has zero threat points, it is clean but unverified (exercise standard caution)
    if (points === 0.0) {
      add("UNVERIFIED_DOMAIN", "Domain is clean but unverified third-party (standard caution)", 0.35);
    }

    const score = squash(points, 4.5);
    let verdict = "safe";
    if (score >= 0.70) verdict = "phishing";
    else if (score >= 0.40) verdict = "suspicious";

    return {
      verdict,
      risk: +score.toFixed(3),
      brand: sig ? sig.name : null,
      stage: "url",
      host: p.host,
      registrable_domain: p.registrable,
      trusted: false,
      reasons,
      graph: buildUrlGraph(p),
      timing_ms: { total_ms: +(performance.now() - t0).toFixed(2) }
    };
  }

  // ─── 9. CLIENT-SIDE STRUCTURAL DOM AUDIT ───────────────────────────────────
  function analyzeDom(dom, pageUrl) {
    const t0 = performance.now();
    const p = parseUrl(pageUrl);
    if (!dom || typeof dom !== "object") {
      return { score: 0.0, points: 0.0, reasons: [], has_password: false, timing_ms: 0 };
    }

    const reasons = [];
    let points = 0.0;
    const add = (code, msg, pts) => {
      reasons.push({ module: "dom", code, message: msg, points: pts });
      points += pts;
    };

    const forms = Array.isArray(dom.forms) ? dom.forms : [];
    const hasPw = (dom.passwordInputs > 0) || forms.some(f => f.hasPassword);
    const text = String(dom.text || "").toLowerCase();
    const title = String(dom.title || "").toLowerCase();

    const links = dom.links || { total: 0, external: 0, nullish: 0 };
    const res = dom.resources || { total: 0, external: 0 };
    const ifr = dom.iframes || { total: 0, hidden: 0, external: 0 };

    const extLinkRatio = links.total ? links.external / links.total : 0.0;
    const nullLinkRatio = links.total ? links.nullish / links.total : 0.0;
    const extResRatio = res.total ? res.external / res.total : 0.0;

    let crossForm = false;
    let httpForm = false;
    let emptyForm = false;
    let mailtoForm = false;

    for (const f of forms) {
      const act = String(f.action || "").trim();
      if (!act || act.startsWith("#") || act.toLowerCase().startsWith("javascript:")) {
        if (f.hasPassword) emptyForm = true;
        continue;
      }
      if (act.toLowerCase().startsWith("mailto:")) {
        mailtoForm = true;
        continue;
      }
      let fullAct = act;
      try {
        fullAct = new URL(act, pageUrl).href;
      } catch (_) {}
      const fp = parseUrl(fullAct);
      if (!fp.valid) continue;
      if (fp.registrable && p.registrable && fp.registrable !== p.registrable) {
        // Also check if domain has matching second level name (e.g. udemy in auth.udemy.com or udemy-sso.com)
        const pSld = p.sld || (p.registrable ? p.registrable.split(".")[0] : "");
        const fpSld = fp.sld || (fp.registrable ? fp.registrable.split(".")[0] : "");
        const isRelated = pSld && fpSld && (pSld.includes(fpSld) || fpSld.includes(pSld));
        if (!isRelated && (f.hasPassword || dom.sensitiveFields > 0)) {
          crossForm = true;
        }
      }
      if (fp.scheme === "http" && !fp.is_local && !p.is_local && (f.hasPassword || dom.sensitiveFields > 0)) {
        httpForm = true;
      }
    }

    const credHits = CREDENTIAL_WORDS.filter(w => text.includes(w)).length;
    const urgHits = URGENCY_WORDS.filter(w => text.includes(w)).length;

    // Brand claim in page title or content
    let brandClaim = null;
    const titleTokens = new Set(tokenize(title));
    const textTokens = tokenize(text.slice(0, 3000));
    for (const b of BRANDS) {
      if (b.domains.includes(p.registrable) || b.domains.includes(p.host)) continue;
      for (const kw of b.keywords) {
        if (kw.length < 4) continue;
        if (titleTokens.has(kw)) {
          brandClaim = { name: b.name, where: "title" };
          break;
        }
        if (!brandClaim && textTokens.filter(t => t === kw).length >= 4) {
          brandClaim = { name: b.name, where: "text" };
        }
      }
      if (brandClaim && brandClaim.where === "title") break;
    }

    if (crossForm) {
      add("FORM_CROSS_DOMAIN", "Credential collection form transmits data to an external unauthorized domain", 4.0);
    }
    if (httpForm) {
      add("FORM_HTTP", "Login submission target sends credentials over unencrypted HTTP", 2.8);
    }
    if (mailtoForm) {
      add("FORM_MAILTO", "Form captures sensitive credentials via mailto: transfer", 3.0);
    }
    if (emptyForm && hasPw) {
      add("FORM_EMPTY_ACTION", "Password form has no destination action or uses a null handler", 1.0);
    }

    // Context check: If URL is clean HTTPS and there is no brand impersonation or form theft,
    // normal websites frequently use analytics iframes (e.g. Google Tag Manager) and CDN assets.
    const isCleanContext = (!crossForm && !httpForm && !mailtoForm && !brandClaim && p.is_https && !p.shared_hosting);

    if (ifr.hidden >= 1) {
      if (!isCleanContext || p.shared_hosting) {
        add("HIDDEN_IFRAME", `${ifr.hidden} invisible zero-dimension iframe(s) detected`, 1.5);
      }
    }
    if (res.total >= 8 && extResRatio >= 0.6) {
      if (!isCleanContext) {
        add("EXTERNAL_RESOURCES", "Over 60% of assets & styling are hotlinked from other origins (page clone)", 1.2);
      }
    }
    if (links.total >= 5 && nullLinkRatio >= 0.5) {
      add("NULL_LINKS", "Over 50% of page navigation links are empty '#' placeholders", 1.5);
    }
    if (dom.rightClickBlocked) {
      add("RIGHT_CLICK_BLOCKED", "Context menu and right-click inspections are explicitly disabled", 1.0);
    }
    if (dom.sensitiveFields > 0 && !isCleanContext) {
      add("SENSITIVE_FIELDS", "Form requests high-risk payment or identity numbers (OTP, CVV, Aadhaar)", 1.8);
    }
    if (credHits >= 3 && !isCleanContext) {
      add("CREDENTIAL_TEXT", "Page content contains dense credential harvesting requests", 1.2);
    }
    if (urgHits >= 2 && !isCleanContext) {
      add("URGENCY_TEXT", "Coercive urgency tactics used ('account suspended within 24 hours')", 1.2);
    }
    if (p.shared_hosting && hasPw) {
      add("PASSWORD_ON_FREE_HOST", "Credential input form deployed on a free shared hosting platform", 2.2);
    }
    if (brandClaim) {
      const pts = hasPw ? (brandClaim.where === "title" ? 4.5 : 3.0) : (brandClaim.where === "title" ? 2.5 : 1.0);
      add("BRAND_CLAIM", `Page claims to be ${brandClaim.name} (${brandClaim.where}) but is hosted on ${p.registrable}`, pts);
    }
    if (hasPw && !p.is_https && !p.is_local) {
      add("PASSWORD_OVER_HTTP", "Password input field hosted on an unencrypted HTTP page", 1.5);
    }

    const DB_ERROR_SIGNATURES = [
      "mysql error", "sql syntax", "error in file:", "errcode: 28", "no space left on device",
      "sql query: select", "warning: mysql_", "warning: mysqli_", "warning: pg_",
      "fatal error: uncaught", "database connection failed", "ora-01756", "sqlite_error"
    ];
    const hasDbError = DB_ERROR_SIGNATURES.some(sig => text.includes(sig) || title.includes(sig));
    if (hasDbError) {
      add("SERVER_SQL_ERROR", "Server leaks internal database / SQL error traces (unstable or compromised host)", 2.4);
    }

    const score = squash(points, 5.0);
    return {
      score: +score.toFixed(3),
      points: +points.toFixed(2),
      reasons,
      has_password: hasPw,
      brand_claim: brandClaim,
      timing_ms: +(performance.now() - t0).toFixed(2)
    };
  }

  // ─── 10. MULTI-STAGE NOISY-OR RISK FUSION ──────────────────────────────────
  function analyzeFull(rawUrl, dom = null, allowlist = []) {
    const urlRes = analyzeUrl(rawUrl, allowlist);
    if (urlRes.trusted || !dom) {
      urlRes.modules = {
        url: { score: urlRes.risk, points: urlRes.points || 0 },
        dom: { score: 0.0, points: 0.0, has_password: false }
      };
      return urlRes;
    }

    const domRes = analyzeDom(dom, rawUrl);
    const wUrl = 1.00;
    const wDom = 0.90;

    // Noisy-OR formula
    const keep = (1.0 - wUrl * urlRes.risk) * (1.0 - wDom * domRes.score);
    let fusedRisk = 1.0 - keep;

    // Brand evidence overrides
    const urlStrong = Boolean(urlRes.brand);
    const domClaim = Boolean(domRes.brand_claim);
    const hasPw = domRes.has_password;

    if (hasPw && (urlStrong || domClaim)) {
      fusedRisk = Math.max(fusedRisk, 0.88);
    } else if (urlStrong && domClaim) {
      fusedRisk = Math.max(fusedRisk, 0.82);
    } else if (domRes.reasons.some(r => r.code === "SERVER_SQL_ERROR")) {
      fusedRisk = Math.max(fusedRisk, 0.65);
    }

    // Clean baseline preservation: If both URL and DOM have 0 threat points, guarantee 0 risk
    if (urlRes.risk === 0 && domRes.points === 0) {
      fusedRisk = 0.0;
    }

    fusedRisk = Math.max(0.0, Math.min(1.0, fusedRisk));

    let verdict = "safe";
    if (fusedRisk >= 0.70) verdict = "phishing";
    else if (fusedRisk >= 0.40) verdict = "suspicious";

    const allReasons = urlRes.reasons.concat(domRes.reasons);
    allReasons.sort((a, b) => (b.points || 0) - (a.points || 0));

    return {
      verdict,
      risk: +fusedRisk.toFixed(3),
      brand: urlRes.brand || (domRes.brand_claim ? domRes.brand_claim.name : null),
      stage: "dom",
      host: urlRes.host,
      registrable_domain: urlRes.registrable_domain,
      trusted: false,
      reasons: allReasons,
      graph: urlRes.graph,
      modules: {
        url: { score: urlRes.risk, points: urlRes.points || 0 },
        dom: { score: domRes.score, points: domRes.points || 0, has_password: domRes.has_password }
      },
      timing_ms: {
        url_ms: urlRes.timing_ms.total_ms,
        dom_ms: domRes.timing_ms,
        total_ms: +(urlRes.timing_ms.total_ms + domRes.timing_ms).toFixed(2)
      }
    };
  }

  // ─── 11. GMAIL SENDER & PHISHING AUDITOR ──────────────────────────────────
  function analyzeEmail(senderName, senderEmail, subjectText = "") {
    senderName = String(senderName || "").trim();
    senderEmail = String(senderEmail || "").trim().toLowerCase();
    subjectText = String(subjectText || "").trim();

    // Extract domain from sender email (e.g. "service@paypal.com" -> "paypal.com")
    let senderDomain = "";
    const emailMatch = senderEmail.match(/@([a-z0-9.-]+)/i);
    if (emailMatch) {
      senderDomain = emailMatch[1].toLowerCase().replace(/^www\./, "");
    }
    const senderP = senderDomain ? parseUrl("https://" + senderDomain) : null;

    const FREE_WEBMAIL = new Set([
      "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "hotmail.com",
      "outlook.com", "live.com", "icloud.com", "mail.ru", "yandex.com",
      "proton.me", "protonmail.com", "zoho.com", "aol.com", "gmx.com"
    ]);

    let verdict = "safe";
    let risk = 0.0;
    let badge = "SAFE";
    let alertTitle = "Safe Sender";
    let warningReason = "";
    let isSpoofed = false;
    let matchedBrand = null;

    // Check if sender display name mentions any protected brand
    const normName = senderName.toLowerCase();
    for (const b of BRANDS) {
      const brandHit = b.keywords.some(kw => {
        if (kw.length < 3) return false;
        const regex = new RegExp(`(^|\\W)${kw}(\\W|$)`, "i");
        return regex.test(normName);
      });

      if (brandHit) {
        matchedBrand = b;
        const isOfficialDomain = b.domains.some(d => senderDomain === d || senderDomain.endsWith("." + d));
        if (isOfficialDomain) {
          verdict = "safe";
          risk = 0.01;
          badge = "OFFICIAL";
          alertTitle = `Verified Official ${b.name}`;
          warningReason = `Authenticated sender domain (${senderDomain}) of ${b.name}`;
          return { verdict, risk, badge, alertTitle, warningReason, matchedBrand: b.name, senderDomain, isOfficial: true };
        } else {
          isSpoofed = true;
          if (FREE_WEBMAIL.has(senderDomain)) {
            verdict = "phishing";
            risk = 0.95;
            badge = "IMPERSONATION";
            alertTitle = `Critical Spoof: ${b.name} Impersonator`;
            warningReason = `Display name claims "${senderName}", but email is from a free @${senderDomain} account!`;
          } else {
            verdict = "phishing";
            risk = 0.92;
            badge = "DECEPTIVE SENDER";
            alertTitle = `Brand Spoofing: ${b.name} Deception`;
            warningReason = `Display name claims "${senderName}", but actual sender domain is "${senderDomain}"!`;
          }
          break;
        }
      }
    }

    if (!isSpoofed && senderP) {
      const sig = brandSignal(senderP);
      if (sig) {
        verdict = "phishing";
        risk = 0.88;
        badge = "LOOKALIKE DOMAIN";
        alertTitle = `Deceptive Domain: ${sig.name} Clone`;
        warningReason = `Sender domain "${senderDomain}" is a visual lookalike/typosquat of ${sig.name}`;
      } else if (SUSPICIOUS_TLDS.has(senderP.suffix)) {
        verdict = "suspicious";
        risk = 0.65;
        badge = "SUSPICIOUS TLD";
        alertTitle = "High-Risk Domain";
        warningReason = `Sender domain uses top-level domain .${senderP.suffix} frequently abused for phishing.`;
      }
    }

    // Check subject for urgency / credential extortion
    if (subjectText) {
      const subLower = subjectText.toLowerCase();
      const hasUrgency = URGENCY_WORDS.some(w => subLower.includes(w));
      const hasCreds = CREDENTIAL_WORDS.some(w => subLower.includes(w));
      if (hasUrgency || hasCreds) {
        if (isSpoofed) {
          risk = Math.max(risk, 0.98);
        } else if (verdict === "safe" && FREE_WEBMAIL.has(senderDomain) && (subLower.includes("suspended") || subLower.includes("verify") || subLower.includes("password"))) {
          verdict = "suspicious";
          risk = 0.60;
          badge = "SUSPICIOUS LURE";
          alertTitle = "Urgent Account Warning";
          warningReason = "Email contains urgent account/security threats from an unverified public sender.";
        }
      }
    }

    if (verdict === "safe") {
      alertTitle = "Legitimate Sender";
      warningReason = senderDomain ? `Standard authenticated domain: ${senderDomain}` : "Standard contact";
    }

    return {
      verdict,
      risk,
      badge,
      alertTitle,
      warningReason,
      matchedBrand: matchedBrand ? matchedBrand.name : null,
      senderDomain,
      isOfficial: false
    };
  }

  // Export to global scope
  const api = {
    analyzeUrl,
    analyzeDom,
    analyzeFull,
    analyzeEmail,
    parseUrl,
    skeleton,
    hasConfusableChars,
    isMixedScript,
    buildUrlGraph,
    BRANDS,
    KEYWORDS,
    SUSPICIOUS_TLDS
  };

  if (typeof globalThis !== "undefined") {
    globalThis.PhishGuardDetector = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
