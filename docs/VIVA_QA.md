# Viva preparation – likely questions and honest answers

**1. What is "zero-day" here?**
A phishing page that is not yet on any blacklist (PhishTank, Google Safe Browsing). Blacklists are reactive – a page is usually only listed after victims report it. We judge the page by *properties* (URL structure, DOM, appearance), so a brand-new page can be caught on first visit.

**2. Why three layers instead of one ML model?**
Each layer fails differently. URL features miss pages on compromised legitimate sites; DOM features miss pixel-perfect clones with clean markup; visual similarity needs a reference. Fusing independent evidence lowers both false negatives and false positives, and each layer explains itself.

**3. What is the "URL lexical graph"?**
For each URL we build a graph: nodes are scheme, suffix, registered domain, sub-domain labels, path segments, query keys and the *tokens* inside them; edges are hierarchy and token adjacency. Token nodes are shared, so the same word in two places creates a cycle. Graph measures (distance of a brand token from the registered domain, a keyword like `secure` adjacent to a brand token, cycle count, depth, degree) separate `paypal.com.secure-login.xyz` from `paypal.com` far better than character counts. They also feed the ML model.

**4. How do you detect homoglyph attacks?**
(a) Decode punycode (`xn--pypal-4ve.com` → `pаypal.com` with Cyrillic "а"), (b) flag labels that mix scripts, (c) map confusable characters to an ASCII *skeleton* (Cyrillic а→a, 1→l, rn→m, 0→o …) and compare the skeleton of each domain token to the skeleton of protected brand names. Skeleton equal but text different ⇒ look-alike. A unit test also asserts no two brands collide.

**5. How does the visual part work without deep learning?**
Screenshot → 32×32 grey → DCT → pHash; 9×8 → dHash; 8×8 grid of luminance and edge density → cosine similarity; 4×4×4 colour histogram. Weighted similarity against *templates of the real login page*. Clones scored 0.93–0.99 in tests, unrelated pages 0.35–0.60, so the thresholds (0.78 weak / 0.88 strong) sit in a clear gap. It runs in ~3 ms on CPU. Why not a CNN? Latency, no GPU, tiny training set per brand; Phishpedia/PhishIntention are the heavier research alternatives (future work).

**6. Can it run in real time inside a browser?**
Yes, with a staged design: URL check ≈ 1 ms server-side (plus a localhost round-trip) *before* the page loads; DOM check after load; screenshot only when needed. In our end-to-end test the clone was fully analysed in ≈ 0.45 s from navigation start including page load. Limits: Chrome allows ~2 `captureVisibleTab` calls/s and only for the visible tab; MV3 service workers can be suspended (state kept in `storage.session`); the model runs server-side, so latency grows with a remote backend.

**7. Why a backend at all? Why not run everything in the extension?**
The CV/ML stack (NumPy, scikit-learn) is far easier in Python, models can be updated without republishing the extension, and templates/feedback can be shared. Trade-off: network dependency and privacy. Mitigations: localhost deployment, URL-only mode, trusted domains never read. Porting to ONNX/WASM is listed as future work.

**8. Privacy?**
No typed values are ever read. Structural summary only; screenshots downscaled, sent only on demand, never stored; feedback log keeps scheme+host+path. API key, rate limit, localhost binding.

**9. What are false positives / how do you control them?**
Trusted-domain shortcut, allow-list, user-content hosts (e.g. `sites.google.com`) deliberately *not* trusted, brand-evidence rules that need *independent* signals before a verdict becomes "phishing", feedback button. Weak visual matches (0.78–0.88) are only "suspicious" unless corroborated.

**10. How did you evaluate it?**
Three levels: 35 unit/API tests (incl. 10 phishing + 9 legitimate URL fixtures), a real-browser end-to-end test (11 checks), a latency benchmark. For *accuracy numbers* you must train/evaluate on real data (PhishTank/OpenPhish vs Tranco) with a grouped split by domain and report precision, recall, F1, ROC-AUC and false-positive rate. The repo's synthetic data is only for running the pipeline offline – do not quote its metrics.

**11. How could an attacker evade it?**
Cloaking (serve a benign page to crawlers), rendering the login form as an image/canvas, slightly altering the layout to drop below the similarity threshold, hosting on a compromised trusted domain, delayed injection of the form after our DOM scan, attacking the model with adversarial URLs. Mitigations: re-scan on SPA route changes, multiple independent layers, templates updated from feedback.

**12. Future scope?**
GNN over the URL graph; logo detection (Phishpedia-style) instead of whole-page similarity; in-browser ONNX model; community-shared templates; QR-code and SMS link checking; continuous retraining from the feedback log; Firefox/Edge ports.

**Be ready to demo:** playground (homograph URL + graph), clone detection on the demo pages, popup reasons, the warning page, `python e2e/run_e2e.py`.
