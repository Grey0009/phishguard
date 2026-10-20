#!/usr/bin/env node
/**
 * PhishGuard Release Packager (Pure JavaScript)
 * Generates distribution ZIP files for GitHub Releases and Chrome Web Store.
 *
 * Usage:
 *   node package.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, "dist");

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

console.log("================================================================");
console.log("       🛡️  PhishGuard Distribution Packaging Utility");
console.log("================================================================");

const extZip = path.join(DIST_DIR, "phishguard-extension-only.zip");
if (fs.existsSync(extZip)) fs.unlinkSync(extZip);

try {
  console.log("[*] Packaging dist/phishguard-extension-only.zip ...");
  // Create zip of extension folder contents directly
  execSync(`cd "${path.join(ROOT_DIR, "extension")}" && zip -r "${extZip}" . -x "*.DS_Store*"`, { stdio: "inherit" });
  const stats = fs.statSync(extZip);
  const sizeKb = (stats.size / 1024).toFixed(1);
  console.log(`    ✓ dist/phishguard-extension-only.zip (${sizeKb} KB)`);
} catch (err) {
  console.error("Packaging error:", err.message);
}

console.log("\n================================================================");
console.log("  [SUCCESS] Extension package ready in dist/");
console.log("================================================================\n");
