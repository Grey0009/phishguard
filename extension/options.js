"use strict";

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
  mode: "auto",
  blockThreshold: 0.85,
};

const $ = (id) => document.getElementById(id);

let currentAllowlist = [];
let autoSaveTimer = null;

function renderChips() {
  const container = $("whitelistChips");
  if (!container) return;

  if (!currentAllowlist.length) {
    container.innerHTML = '<span class="whitelist-empty">No whitelisted domains yet.</span>';
    return;
  }

  container.innerHTML = "";
  currentAllowlist.forEach((domain) => {
    const chip = document.createElement("span");
    chip.className = "whitelist-chip";
    chip.innerHTML = `
      <span>${domain}</span>
      <button type="button" class="chip-remove-btn" title="Remove ${domain}" data-domain="${domain}">×</button>
    `;
    chip.querySelector(".chip-remove-btn").addEventListener("click", () => {
      currentAllowlist = currentAllowlist.filter((d) => d !== domain);
      renderChips();
      $("allowlist").value = currentAllowlist.join("\n");
      autoSave();
    });
    container.appendChild(chip);
  });
}

function syncChipsFromTextarea() {
  currentAllowlist = $("allowlist").value
    .split(/\s+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  // Deduplicate
  currentAllowlist = Array.from(new Set(currentAllowlist));
  renderChips();
  autoSave();
}

async function loadSettings() {
  const s = await chrome.storage.local.get(DEFAULTS);

  // System & Interface
  $("enabled").checked = s.enabled !== false;
  $("liquidGlass").checked = s.liquidGlass !== false;

  // Stealth Defuser
  $("driveByDefuser").checked = s.driveByDefuser !== false;
  $("stealthAdblock").checked = s.stealthAdblock !== false;

  // Proactive & Heuristics
  $("linkHoverHud").checked = s.linkHoverHud !== false;
  $("phishingShield").checked = s.phishingShield !== false;
  $("autoBlock").checked = s.autoBlock !== false;
  $("banner").checked = s.banner !== false;

  const thr = Number(s.blockThreshold) || 0.85;
  $("blockThreshold").value = thr;
  $("thrVal").textContent = thr.toFixed(2);
  $("mode").value = s.mode || "auto";

  // Whitelist
  currentAllowlist = Array.isArray(s.allowlist) ? [...s.allowlist] : [];
  $("allowlist").value = currentAllowlist.join("\n");
  renderChips();

  // Connection
  $("apiBase").value = s.apiBase || "http://127.0.0.1:8000";
  $("apiKey").value = s.apiKey || "";
}

// Auto-save function for switches & inputs
async function autoSave(showFeedback = true) {
  let base = $("apiBase").value.trim();
  if (!/^https?:\/\//i.test(base)) {
    base = "http://127.0.0.1:8000";
  }

  const toSave = {
    enabled: $("enabled").checked,
    liquidGlass: $("liquidGlass").checked,
    driveByDefuser: $("driveByDefuser").checked,
    stealthAdblock: $("stealthAdblock").checked,
    linkHoverHud: $("linkHoverHud").checked,
    phishingShield: $("phishingShield").checked,
    autoBlock: $("autoBlock").checked,
    banner: $("banner").checked,
    blockThreshold: Number($("blockThreshold").value),
    mode: $("mode").value,
    allowlist: currentAllowlist,
    apiBase: base.replace(/\/+$/, ""),
    apiKey: $("apiKey").value.trim(),
  };

  await chrome.storage.local.set(toSave);
  if (showFeedback) {
    showToast("✓ Settings updated & synced live across popup and tabs", true);
  }
}

// Range slider dynamic readout & auto-save
$("blockThreshold").addEventListener("input", () => {
  $("thrVal").textContent = Number($("blockThreshold").value).toFixed(2);
});
$("blockThreshold").addEventListener("change", () => autoSave());

// Wire all toggle switches to auto-save immediately on toggle
[
  "enabled",
  "liquidGlass",
  "driveByDefuser",
  "stealthAdblock",
  "linkHoverHud",
  "phishingShield",
  "autoBlock",
  "banner",
].forEach((id) => {
  const el = $(id);
  if (el) {
    el.addEventListener("change", () => autoSave());
  }
});

// Mode dropdown auto-save
$("mode").addEventListener("change", () => autoSave());

// Whitelist add button & Enter key
function addDomain() {
  const input = $("newDomainInput");
  const val = input.value.trim().toLowerCase().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!val) return;

  if (!currentAllowlist.includes(val)) {
    currentAllowlist.push(val);
    renderChips();
    $("allowlist").value = currentAllowlist.join("\n");
    autoSave();
  }
  input.value = "";
}

$("addDomainBtn").addEventListener("click", addDomain);
$("newDomainInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addDomain();
  }
});

$("allowlist").addEventListener("change", syncChipsFromTextarea);

// API Base and API Key auto-save on blur
$("apiBase").addEventListener("change", () => autoSave());
$("apiKey").addEventListener("change", () => autoSave());

// Manual Save Button Action
$("save").addEventListener("click", async () => {
  let base = $("apiBase").value.trim();
  if (!/^https?:\/\//i.test(base)) {
    showToast("Backend URL must start with http:// or https://", false);
    return;
  }
  await autoSave(true);
});

// Test Connection Action
$("test").addEventListener("click", async () => {
  showToast("Pinging backend engine…", null);
  const startTime = performance.now();
  try {
    const base = $("apiBase").value.trim().replace(/\/+$/, "");
    const apiKey = $("apiKey").value.trim();
    const headers = {};
    if (apiKey) headers["X-API-Key"] = apiKey;

    const r = await fetch(base + "/health", { headers });
    const latency = Math.round(performance.now() - startTime);
    const j = await r.json();

    if (!r.ok) throw new Error(j.error || "HTTP " + r.status);

    showToast(
      `✓ Connected (${latency}ms): v${j.version || "1.0"}, ${j.brands || 0} brands indexed, ${j.visual_templates || 0} templates, ML model: ${j.ml_model_loaded ? "loaded" : "heuristic"}.`,
      true
    );
  } catch (e) {
    showToast("✗ Connection failed: " + e.message, false);
  }
});

function showToast(msg, isSuccess) {
  const el = $("statusToast");
  el.textContent = msg;
  if (isSuccess === true) el.className = "success";
  else if (isSuccess === false) el.className = "error";
  else el.className = "";

  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  if (isSuccess === true) {
    autoSaveTimer = setTimeout(() => {
      el.textContent = "";
      el.className = "";
    }, 3500);
  }
}

// React live if settings are changed elsewhere (e.g. from the popup UI)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.enabled !== undefined && $("enabled")) {
    $("enabled").checked = changes.enabled.newValue !== false;
  }
  if (changes.liquidGlass !== undefined && $("liquidGlass")) {
    $("liquidGlass").checked = changes.liquidGlass.newValue !== false;
  }
  if (changes.phishingShield !== undefined && $("phishingShield")) {
    $("phishingShield").checked = changes.phishingShield.newValue !== false;
  }
  if (changes.stealthAdblock !== undefined && $("stealthAdblock")) {
    $("stealthAdblock").checked = changes.stealthAdblock.newValue !== false;
  }
  if (changes.driveByDefuser !== undefined && $("driveByDefuser")) {
    $("driveByDefuser").checked = changes.driveByDefuser.newValue !== false;
  }
  if (changes.mode !== undefined && $("mode")) {
    $("mode").value = changes.mode.newValue || "auto";
  }
  if (changes.allowlist !== undefined) {
    currentAllowlist = Array.isArray(changes.allowlist.newValue) ? [...changes.allowlist.newValue] : [];
    if ($("allowlist")) $("allowlist").value = currentAllowlist.join("\n");
    renderChips();
  }
});

loadSettings();
