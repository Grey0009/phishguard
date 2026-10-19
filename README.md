# PhishGuard — Zero-Day Phishing & Threat Mitigation Engine

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Chromium Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Brave%20%7C%20Edge%20%7C%20Opera%20%7C%20Arc-success.svg)](#step-2-install-the-browser-extension-60-seconds)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **PhishGuard** is an advanced, real-time zero-day phishing detection and browser defense engine engineered for **Chromium-based browsers** (Google Chrome, Brave, Microsoft Edge, Opera, Vivaldi, Arc). It neutralizes deceptive websites, homoglyph domain attacks, credential traps, stealth popunders, and drive-by malware payloads **without relying on outdated static blacklists**.
> 
> *Note: A dedicated Apple Safari (macOS native Xcode App Extension) will be released in a separate companion repository as an update.*

---

## ⚡ 30-Second Quick Start (Beginner Friendly)

You do **not** need to manually configure environments or install complex packages. Everything is automated with 1-click launchers.

### Step 1: Start the Backend Server (1-Click)

* **On macOS or Linux:**
  Double-click `start.sh` or run in your terminal:
  ```bash
  ./start.sh
  ```
* **On Windows:**
  Double-click `start.bat` in File Explorer.
* **Using Docker (Optional):**
  ```bash
  docker compose up
  ```

> *The script will automatically configure Python, set up an isolated virtual environment, install necessary libraries, and launch the PhishGuard server at `http://127.0.0.1:8000`.*

---

### Step 2: Install the Browser Extension (60 Seconds)

1. Open any Chromium browser (Google Chrome, Brave, Microsoft Edge, Opera, or Arc) and navigate to:
   * **Chrome / Brave / Arc:** `chrome://extensions`
   * **Edge:** `edge://extensions`
2. Turn **ON** the **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the **`extension/`** folder inside this repository.

**That's it!** Navigate to any website (e.g. YouTube, GitHub, or any test page) and click the PhishGuard shield icon in your toolbar to see live telemetry.

---

## 🏗️ System Architecture & Multi-Stage Pipeline

PhishGuard uses a **tiered defense architecture** to balance sub-millisecond responsiveness with deep neural heuristics:

```mermaid
flowchart TD
    UserNav([🌐 User Navigates to URL]) --> PreClick[Stage 1: Instant Lexical Triage <br/> <0.5ms]
    PreClick --> Homoglyph[Homoglyph & Punycode Engine]
    Homoglyph --> Graph[Token Adjacency Graph]
    
    Graph --> Decision1{Known Safe / Allowlisted?}
    Decision1 -- Yes --> FastPass[✓ Fast Pass: No DOM Overhead]
    Decision1 -- Suspicious / Unknown --> Stage2[Stage 2: Structural DOM Audit <br/> ~0.1ms]
    
    Stage2 --> Forms[Credential & Password Trap Audit]
    Forms --> ResRatio[External Asset & Iframe Ratio]
    ResRatio --> Decision2{High Threat Threshold?}
    
    Decision2 -- Yes --> Defend[🛡️ Block Page / Display Warning]
    Decision2 -- Ambiguous Brand --> Stage3[Stage 3: Visual Layout & pHash <br/> ~1.7ms]
    
    Stage3 --> VisualMatch[Perceptual Hash & Color Histogram]
    VisualMatch --> Verdict[Final Unified Verdict & Safety Index %]
```

### Defense Layers

| Stage | Inspection Scope | Where It Runs | Average Latency |
| :--- | :--- | :--- | :--- |
| **Stage 1: URL Lexical Graph** | 40+ lexical features, Punycode/Cyrillic homoglyph decoding, TLD risk scores, Shannon entropy, brand token distance graph | Backend API | **0.53 ms** |
| **Stage 2: Structural DOM Audit** | Cross-domain form targets, unencrypted credential submissions, hidden iframes, deceptive password traps, brand text claims | Extension + Backend | **0.13 ms** |
| **Stage 3: Visual Layout & Vision** | Perceptual hashing (pHash, dHash), 8×8 luminance-edge layout descriptor, color histogram template matching | Backend (NumPy / Pillow) | **1.75 ms** |
| **Continuous Defuser** | Main-world anti-adblock flag bypass (`world: "MAIN"`), pop-under interceptor, drive-by malware download defuser | In-Tab Content Scriptlet | **0 ms (Client)** |

---

## 📊 Benchmark & Evaluation Results

PhishGuard was evaluated across balanced test sets containing known benign domains (from Tranco Top-1M) and live phishing URLs (PhishTank/OpenPhish feeds).

You can reproduce these benchmarks anytime using the included evaluation suite:
```bash
python benchmarks/run_eval.py --samples 1000 --save
```

### Verified Performance Metrics

| Metric | Result | Industry Standard Benchmark |
| :--- | :--- | :--- |
| **Overall Accuracy** | **98.00%** | > 92.0% |
| **Threat Recall (Sensitivity)** | **100.00%** | > 95.0% |
| **Precision** | **96.15%** | > 90.0% |
| **False Positive Rate (FPR)** | **4.00%** | < 5.0% |
| **Stage 1 Triage Latency (p50)** | **0.43 ms** | < 10 ms |
| **Stage 2 DOM Latency (p50)** | **0.11 ms** | < 25 ms |
| **Stage 3 Full Visual (p50)** | **1.69 ms** | < 50 ms |

---

## 🎨 Feature Showcase

* **Apple VisionOS Liquid Glass Interface**: Dynamic, real-time background color absorption adapting seamlessly to whatever web page you visit.
* **Link Hover HUD**: Preview and inspect hyperlinks before clicking them; flags suspicious URLs in real-time right at your cursor.
* **Drive-By Download Defuser**: Automatically quarantines dangerous executable files (`.dmg`, `.exe`, `.pkg`, `.iso`, `.scr`) triggered without direct user interaction.
* **Stealth Adblock & Popunder Interceptor**: Neutralizes aggressive streaming site pop-unders and deceptive tracking overlays without triggering annoying "Disable your adblocker" banners.
* **Export Security Incident Report**: One-click export of structured JSON/Markdown forensic audit reports for any detected threat.

---

## 🚀 How to Deploy on Your GitHub Repository

To upload this project to your personal GitHub repository so that you (or anyone else) can download and use it anytime:

### 1. Initialize Git and Push to GitHub
```bash
# In your terminal inside the phishguard folder:
git init
git add .
git commit -m "feat: initial commit of PhishGuard security engine"

# Create a new repository on github.com, then link it:
git remote add origin https://github.com/<YOUR_USERNAME>/phishguard.git
git branch -M main
git push -u origin main
```

### 2. Generate a Clean Release ZIP
Run the automated packaging utility to produce clean, release-ready zips without cache files:
```bash
python package_release.py
```
This generates:
* `dist/phishguard-full-project.zip`: The entire project including 1-click launchers and backend.
* `dist/phishguard-extension-only.zip`: Standalone extension ready for browser distribution.

### 3. Create a GitHub Release
1. Open your repository on GitHub.
2. In the right sidebar, click **Releases** → **Create a new release**.
3. Set a tag (e.g., `v1.0.0`) and title (e.g., `PhishGuard v1.0.0 — Production Release`).
4. Drag and drop `dist/phishguard-full-project.zip` into the release binaries box.
5. Click **Publish release**.

> Now, anyone visiting your repository can simply download the release zip, double-click `start.sh` (or `start.bat`), load the extension, and have the entire security engine running in seconds!

---

## 🛡️ Privacy & Ethical Safeguards

* **Zero Keystroke Logging**: The extension inspects structural element tags and form actions; it never reads what users type into input fields.
* **Offline-First Option**: All Stage 1 and Stage 2 heuristics run completely locally on `127.0.0.1:8000`. No telemetry is sent to third-party cloud providers.
* **Ephemeral Memory State**: Screenshots captured for visual template comparisons are processed in volatile memory and discarded immediately after feature extraction.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
