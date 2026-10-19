const pptxgen = require("pptxgenjs");
const React = require("react");
const RDS = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const { applyTheme } = require("/mnt/skills/public/pptx/scripts/apply_theme.js");

const OUT = process.argv[2] || "PhishGuard_Final_Year_Project.pptx";

const THEME = {
  name: "PhishGuard",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "0B1B2B", lt1: "FFFFFF", dk2: "0F2A43", lt2: "EAF3F6",
    accent1: "0E7490", accent2: "06B6D4", accent3: "DC2626", accent4: "D97706",
    accent5: "15803D", accent6: "64748B", hlink: "0E7490", folHlink: "64748B",
  },
};
const H = THEME.colors; // hex access (charts / tables only)

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "PhishGuard - Automated phishing detection with visual layout analysis and URL lexical graphs";
pres.author = "BE Computer Engineering, SPPU";
const C = pres.SchemeColor;
const SH = pres.ShapeType;

/* ---------------------------------------------------------------- layouts */
pres.defineSlideMaster({
  title: "TITLE",
  background: { color: C.text2 },
  objects: [],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9, h: 0.75, fontSize: 30, bold: true, color: C.text2, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "PhishGuard  |  BE Computer Engineering, SPPU", options: { x: 0.5, y: 5.28, w: 6, h: 0.25, fontSize: 10, color: C.accent6, margin: 0 } } },
  ],
  slideNumber: { x: 9.0, y: 5.28, w: 0.5, h: 0.25, fontSize: 10, color: C.accent6, align: "right" },
});
pres.defineSlideMaster({
  title: "DARK",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9, h: 0.75, fontSize: 30, bold: true, color: C.background1, align: "left", valign: "middle", margin: 0 }, text: "" } },
  ],
});

/* ---------------------------------------------------------------- icons */
async function icon(Comp, color = "#FFFFFF") {
  const svg = RDS.renderToStaticMarkup(React.createElement(Comp, { color, size: "256" }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
const ICON_NAMES = {
  shield: fa.FaShieldAlt, link: fa.FaLink, code: fa.FaCode, eye: fa.FaEye, lock: fa.FaLock, bolt: fa.FaBolt,
  globe: fa.FaGlobe, search: fa.FaSearch, server: fa.FaServer, chrome: fa.FaChrome, check: fa.FaCheckCircle,
  warn: fa.FaExclamationTriangle, graph: fa.FaProjectDiagram, font: fa.FaFont, image: fa.FaImage,
  balance: fa.FaBalanceScale, secret: fa.FaUserSecret, db: fa.FaDatabase, puzzle: fa.FaPuzzlePiece,
  rocket: fa.FaRocket, userShield: fa.FaUserShield, tools: fa.FaTools, fish: fa.FaFish, clock: fa.FaClock,
  user: fa.FaUser, bug: fa.FaBug, file: fa.FaFileAlt, python: fa.FaPython, js: fa.FaJs, cog: fa.FaCog,
  list: fa.FaListUl, flask: fa.FaFlask, layer: fa.FaLayerGroup,
};
const IC = {};

/* ---------------------------------------------------------------- helpers */
let slideNo = 0;
function content(section, title, notes) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  if (notes) s.addNotes(notes);
  slideNo++;
  return s;
}
function dark(section, title, notes) {
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  if (notes) s.addNotes(notes);
  return s;
}
function card(s, x, y, w, h, name, fill = C.background2) {
  s.addShape(SH.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: name || "card" });
}
function badge(s, ic, x, y, d, fill = C.accent1, name) {
  s.addShape(SH.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: (name || "icon") + " circle" });
  const p = d * 0.26;
  s.addImage({ data: IC[ic], x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, altText: (name || ic) + " icon" });
}
function txt(s, text, x, y, w, h, o = {}) {
  s.addText(text, Object.assign({ x, y, w, h, fontSize: 14, color: C.text1, margin: 0, valign: "top", isTextBox: true }, o));
}
function bullets(s, items, x, y, w, h, size = 14, color = C.text1) {
  const arr = items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 6 } }));
  s.addText(arr, { x, y, w, h, fontSize: size, color, margin: 0, valign: "top", isTextBox: true });
}
function stat(s, big, label, x, y, w, color = C.accent1) {
  txt(s, big, x, y, w, 0.7, { fontSize: 38, bold: true, fontFace: "Cambria", color });
  txt(s, label, x, y + 0.7, w, 0.55, { fontSize: 13, color: C.accent6 });
}
function arrow(s, x1, y1, x2, y2, color = C.accent6, w = 1.5, dash) {
  const o = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), line: { color, width: w, endArrowType: "triangle" } };
  if (dash) o.line.dashType = dash;
  if (x2 < x1) o.flipH = true;
  if (y2 < y1) o.flipV = true;
  s.addShape(SH.line, o);
}
function line(s, x1, y1, x2, y2, color = C.accent6, w = 1, dash) {
  const o = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), line: { color, width: w } };
  if (dash) o.line.dashType = dash;
  if ((x2 < x1) !== (y2 < y1)) o.flipV = true;
  s.addShape(SH.line, o);
}
function box(s, text, x, y, w, h, o = {}) {
  s.addShape(o.shape || SH.roundRect, {
    x, y, w, h, rectRadius: 0.07, fill: { color: o.fill || C.accent1 }, line: { color: o.lineColor || o.fill || C.accent1, width: o.lineW || 1 },
  });
  s.addText(text, { x, y, w, h, fontSize: o.size || 12, bold: o.bold !== false, color: o.color || C.background1, align: "center", valign: "middle", margin: 0.04, isTextBox: true });
}
function hdrCell(t) { return { text: t, options: { bold: true, color: "FFFFFF", fill: { color: H.accent1 }, fontSize: 12 } }; }
function cell(t, o = {}) { return { text: t, options: Object.assign({ fontSize: 12, color: H.dk1 }, o) }; }
const BORDER = { type: "solid", color: "CBD5E1", pt: 0.75 };

/* ================================================================= build */
(async () => {
  for (const [k, v] of Object.entries(ICON_NAMES)) IC[k] = await icon(v);
  IC.tealShield = await icon(fa.FaShieldAlt, "#06B6D4");

  /* 1 ---- title */
  pres.addSection({ title: "Introduction" });
  {
    const s = pres.addSlide({ masterName: "TITLE", sectionTitle: "Introduction" });
    s.addNotes("Introduce yourselves, the guide and the college. One sentence on the idea: judge a page on its own evidence instead of waiting for it to be blacklisted.");
    s.addShape(SH.ellipse, { x: 6.55, y: 0.95, w: 2.9, h: 2.9, fill: { color: C.accent1 }, line: { color: C.accent2, width: 3 }, objectName: "title motif circle" });
    s.addImage({ data: IC.shield, x: 7.2, y: 1.6, w: 1.6, h: 1.6, altText: "Shield icon" });
    txt(s, "BE (COMPUTER ENGINEERING)  |  FINAL YEAR PROJECT", 0.6, 0.55, 8, 0.3, { fontSize: 12, bold: true, color: C.accent2, charSpacing: 2 });
    txt(s, "PhishGuard", 0.6, 1.15, 6, 1.0, { fontSize: 54, bold: true, fontFace: "Cambria", color: C.background1 });
    txt(s, "Automated phishing detection with visual layout analysis and URL lexical graphs", 0.6, 2.25, 5.7, 1.1, { fontSize: 22, color: C.background2 });
    txt(s, "A Chrome extension and backend API that catches zero-day phishing pages without relying on blacklists", 0.6, 3.5, 5.7, 0.7, { fontSize: 14, color: C.accent2 });
    txt(s, "Team: [Student names, roll numbers]   |   Guide: [Guide name]\n[College name], Savitribai Phule Pune University   |   Academic year 2026-27", 0.6, 4.55, 8.8, 0.6, { fontSize: 12, color: C.background2 });
  }

  /* 2 ---- agenda */
  {
    const s = content("Introduction", "Agenda", "Walk through the structure: problem first, then related work, then the design, implementation, results and limits.");
    const items = [["1", "Problem and motivation"], ["2", "Literature survey and gap"], ["3", "Proposed system and architecture"], ["4", "Detection modules: URL graph, DOM, visual"],
      ["5", "Fusion, UML and requirements"], ["6", "Implementation and API"], ["7", "Real-time feasibility and testing"], ["8", "Privacy, limits, future scope"]];
    items.forEach(([n, t], i) => {
      const col = i % 2, row = Math.floor(i / 2), x = 0.5 + col * 4.6, y = 1.3 + row * 0.95;
      card(s, x, y, 4.4, 0.78, "agenda card " + n);
      s.addShape(SH.ellipse, { x: x + 0.15, y: y + 0.14, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
      txt(s, n, x + 0.15, y + 0.14, 0.5, 0.5, { fontSize: 18, bold: true, color: C.background1, align: "center", valign: "middle", fontFace: "Cambria" });
      txt(s, t, x + 0.8, y + 0.14, 3.5, 0.5, { fontSize: 15, valign: "middle", bold: true });
    });
  }

  /* 3 ---- abstract */
  {
    const s = content("Introduction", "Abstract", "Keep the abstract to 30 seconds. The three numbers on the right are measured: 3 evidence layers, under 1 ms mean URL analysis on the benchmark machine, 11 of 11 end-to-end checks passing in a real Chromium.");
    txt(s, "Phishing sites appear and disappear faster than blacklists can list them. PhishGuard judges a page on its own evidence. A lexical graph of the URL with homoglyph checks, the structure of the page DOM, and lightweight computer vision on a screenshot compared with real brand login pages are fused into one explainable risk score.\n\nA Chrome extension (Manifest V3) talks to a Python API through a staged pipeline that stays real-time and sends page data only when needed.", 0.5, 1.3, 5.3, 3.7, { fontSize: 15 });
    card(s, 6.2, 1.3, 3.3, 3.7, "stat panel");
    stat(s, "3", "independent layers of evidence: URL graph, DOM, visual", 6.45, 1.35, 2.9);
    stat(s, "< 1 ms", "mean server time for URL + lexical-graph analysis", 6.45, 2.5, 2.9);
    stat(s, "11 / 11", "end-to-end checks passed in real Chromium", 6.45, 3.65, 2.9);
  }

  /* 4 ---- introduction */
  {
    const s = content("Introduction", "Introduction and background", "Explain the blacklist gap: a page must first be seen, reported and verified before it is listed. Zero-day phishing lives in that window.");
    bullets(s, ["Phishing: a fake page imitates a trusted brand to steal credentials", "Page kits make a clone cost minutes, not days", "Blacklists are reactive: a page is listed only after it is reported and verified", "Goal: judge the page itself, at the moment of the visit"], 0.5, 1.3, 4.3, 3.6, 15);
    const steps = ["Page goes live", "First victims", "Reported and verified", "Added to blacklist"];
    steps.forEach((t, i) => {
      box(s, t, 5.2, 1.3 + i * 0.8, 4.2, 0.6, { fill: i < 3 ? C.accent1 : C.accent5, size: 14 });
      if (i < 3) arrow(s, 7.3, 1.9 + i * 0.8, 7.3, 2.1 + i * 0.8, C.accent6);
    });
    box(s, "Unprotected window: blacklists cannot help here", 5.2, 4.5, 4.2, 0.55, { fill: C.accent3, size: 13 });
  }

  /* 5 ---- motivation */
  {
    const s = content("Introduction", "Motivation: the scale of phishing", "Figures are from APWG (Anti-Phishing Working Group) Phishing Activity Trends reports: 3.8 million attacks in 2025 vs 3.76 million in 2024; 971,181 in Q1 2026, up 13.8 percent from 853,244 in Q4 2025.");
    stat(s, "3.8 million", "phishing attacks observed by APWG in 2025 (3.76 million in 2024)", 0.5, 1.35, 4.2);
    stat(s, "+13.8 %", "growth from Q4 2025 to Q1 2026 (853,244 to 971,181 attacks)", 0.5, 2.85, 4.2, C.accent3);
    s.addChart(pres.charts.BAR, [{ name: "Phishing attacks", labels: ["Q4 2025", "Q1 2026"], values: [853244, 971181] }], {
      x: 5.0, y: 1.25, w: 4.5, h: 3.5, barDir: "col", chartColors: [H.accent1, H.accent3], showTitle: true, title: "APWG-reported attacks per quarter",
      titleFontSize: 13, titleColor: H.dk1, showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 12, dataLabelColor: H.dk1, dataLabelFormatCode: "#,##0",
      catAxisLabelColor: H.dk1, valAxisLabelColor: H.accent6, catAxisLabelFontSize: 12, valAxisLabelFontSize: 10, valGridLine: { color: "E2E8F0", size: 0.5 },
      catGridLine: { style: "none" }, showLegend: false, valAxisMinVal: 0, valAxisLabelFormatCode: "#,##0", catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
      dataLabelFontFace: "+mn-lt", titleFontFace: "+mn-lt",
    });
    txt(s, "Source: APWG Phishing Activity Trends Report, Q1 2026, and 2025 year-in-review release.", 0.5, 4.85, 9, 0.3, { fontSize: 10, color: C.accent6 });
  }

  /* 6 ---- problem statement */
  {
    const s = content("Introduction", "Problem statement", "Read the statement, then point to the three constraints: real-time, explainable and privacy-preserving. These drive every design decision later.");
    card(s, 0.5, 1.3, 9, 1.9, "problem card");
    badge(s, "warn", 0.75, 1.55, 0.7, C.accent3, "problem");
    txt(s, "Design and implement a browser-based system that detects previously unseen (zero-day) phishing pages in real time, using URL lexical-graph features, DOM structure and visual layout analysis, without depending on static blacklists.", 1.7, 1.45, 7.6, 1.6, { fontSize: 17, valign: "middle", fontFace: "Cambria" });
    const cons = [["bolt", "Real-time", "Verdict while the user is still on the page; block before content when the URL is conclusive"], ["list", "Explainable", "Every verdict lists the signals behind it"], ["lock", "Privacy-preserving", "Typed values never read; screenshots only on demand"]];
    cons.forEach(([ic, t, d], i) => {
      const x = 0.5 + i * 3.05;
      badge(s, ic, x, 3.5, 0.6, C.accent1, t);
      txt(s, t, x + 0.75, 3.5, 2.1, 0.6, { fontSize: 16, bold: true, valign: "middle" });
      txt(s, d, x, 4.2, 2.85, 0.9, { fontSize: 13, color: C.accent6 });
    });
  }

  /* 7 ---- objectives */
  {
    const s = content("Introduction", "Objectives", "Map each objective to a module later in the deck. Objective 5 is why the project is a working extension and not only a model.");
    const objs = [["graph", "Extract URL lexical features and a token graph; detect homoglyph and typosquat domains"], ["code", "Analyse DOM structure: form targets, credential fields, iframes, brand claims"],
      ["image", "Compare page screenshots with brand templates using lightweight computer vision"], ["balance", "Fuse the evidence into one explainable risk score with clear thresholds"],
      ["chrome", "Deliver a Manifest V3 extension plus REST API that works in real time"]];
    objs.forEach(([ic, t], i) => {
      const y = 1.25 + i * 0.76;
      card(s, 0.5, y, 9, 0.64, "objective " + (i + 1));
      badge(s, ic, 0.62, y + 0.07, 0.5, C.accent1, "objective " + (i + 1));
      txt(s, t, 1.3, y, 8.0, 0.64, { fontSize: 15, valign: "middle" });
    });
  }

  /* 8-9 ---- literature */
  pres.addSection({ title: "Literature" });
  {
    const s = content("Literature", "Literature survey (1 of 2): URL and content", "Authors and venues are from the standard literature; verify the exact citation format required by your college before submission.");
    const rows = [
      [hdrCell("Work"), hdrCell("Approach"), hdrCell("Limitation for our goal")],
      [cell("Ma et al., KDD 2009", { bold: true }), cell("Beyond blacklists: classifies sites from lexical and host features of the URL"), cell("No page content and no visual cues")],
      [cell("Zhang, Hong, Cranor, WWW 2007 (CANTINA)", { bold: true }), cell("TF-IDF content analysis plus URL heuristics, using a search engine"), cell("Language dependent; needs an external search query")],
      [cell("Whittaker et al., NDSS 2010", { bold: true }), cell("Large-scale automatic classification of phishing pages at Google"), cell("Server-side infrastructure at scale; not a lightweight client")],
      [cell("Sahingoz et al., 2019", { bold: true }), cell("Machine learning on URL words and NLP-based features"), cell("URL only; weaker on pages hosted on compromised domains")],
    ];
    s.addTable(rows, { x: 0.5, y: 1.3, w: 9, colW: [2.6, 3.6, 2.8], border: BORDER, valign: "middle", rowH: [0.4, 0.7, 0.7, 0.7, 0.7], margin: [0.05, 0.1, 0.05, 0.1], fill: { color: "FFFFFF" } });
    txt(s, "Takeaway: URL and text features work early, but alone they miss clones with clean markup.", 0.5, 4.7, 9, 0.35, { fontSize: 13, italic: true, color: C.accent1 });
  }
  {
    const s = content("Literature", "Literature survey (2 of 2): visual", "VisualPhishNet is explicitly about zero-day detection by visual similarity. Phishpedia and PhishIntention are the heavier deep-learning alternatives; we chose hashes for latency and no GPU.");
    const rows = [
      [hdrCell("Work"), hdrCell("Approach"), hdrCell("Limitation for our goal")],
      [cell("Fu et al., IEEE TDSC 2006", { bold: true }), cell("Visual similarity of page images using Earth Mover's Distance"), cell("Whole-page comparison against reference pages; costly")],
      [cell("Afroz and Greenstadt, 2011 (PhishZoo)", { bold: true }), cell("Profile-based matching of site content and images with fuzzy hashing"), cell("Needs a profile per protected brand")],
      [cell("Abdelnabi et al., CCS 2020 (VisualPhishNet)", { bold: true }), cell("Triplet network learns screenshot similarity for zero-day pages"), cell("Needs a large training set; heavier inference")],
      [cell("Lin et al., USENIX Sec. 2021 (Phishpedia)", { bold: true }), cell("Detects the logo and matches it to a brand, reports the target"), cell("Deep-learning detector; heavier than hashing")],
      [cell("Liu et al., USENIX Sec. 2022 (PhishIntention)", { bold: true }), cell("Adds page dynamics and credential-taking intention"), cell("More complex pipeline; heavier to run in a browser")],
    ];
    s.addTable(rows, { x: 0.5, y: 1.25, w: 9, colW: [2.9, 3.5, 2.6], border: BORDER, valign: "middle", rowH: [0.38, 0.62, 0.62, 0.62, 0.62, 0.62], margin: [0.04, 0.1, 0.04, 0.1], fill: { color: "FFFFFF" } });
  }

  /* 10 ---- gap */
  {
    const s = content("Literature", "Research gap", "Be honest in the footnote: the visual layer only protects brands whose templates have been registered. That is a stated limitation, not a hidden one.");
    const Y = (t) => cell(t, { bold: true, color: H.accent5, align: "center" });
    const N = (t) => cell(t, { bold: true, color: H.accent3, align: "center" });
    const P = (t) => cell(t, { bold: true, color: H.accent4, align: "center" });
    const rows = [
      [hdrCell("Approach"), hdrCell("Zero-day"), hdrCell("Real-time in browser"), hdrCell("Explains verdict"), hdrCell("No GPU needed"), hdrCell("Homographs")],
      [cell("Static blacklists", { bold: true }), N("No"), Y("Yes"), N("No"), Y("Yes"), N("No")],
      [cell("URL-only machine learning", { bold: true }), P("Partial"), Y("Yes"), P("Partial"), Y("Yes"), P("Partial")],
      [cell("Deep visual models (CNN)", { bold: true }), Y("Yes"), P("Partial"), P("Partial"), N("No"), N("No")],
      [cell("PhishGuard (this project)", { bold: true, fill: { color: "DDF1F6" } }), Y("Yes"), Y("Yes"), Y("Yes"), Y("Yes"), Y("Yes")],
    ];
    s.addTable(rows, { x: 0.5, y: 1.35, w: 9, colW: [2.6, 1.2, 1.5, 1.4, 1.2, 1.1], border: BORDER, valign: "middle", rowH: [0.5, 0.62, 0.62, 0.62, 0.62], margin: [0.04, 0.08, 0.04, 0.08], fill: { color: "FFFFFF" } });
    txt(s, "Gap: lexical-graph, DOM and visual evidence in one lightweight, explainable, in-browser pipeline.", 0.5, 4.4, 9, 0.35, { fontSize: 14, bold: true, color: C.accent1 });
    txt(s, "Note: the visual layer protects brands whose real login pages have been registered as templates.", 0.5, 4.9, 9, 0.3, { fontSize: 11, color: C.accent6 });
  }

  /* 11 ---- architecture */
  pres.addSection({ title: "Design" });
  {
    const s = content("Design", "System architecture", "Left is the browser side, right is the API. All heavy analysis is in Python so models and brand data can change without republishing the extension.");
    s.addShape(SH.roundRect, { x: 0.4, y: 1.2, w: 3.6, h: 3.75, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: C.accent1, width: 1.5 } });
    txt(s, "Chrome extension (MV3)", 0.55, 1.27, 3.3, 0.3, { fontSize: 14, bold: true, color: C.accent1 });
    box(s, "Content script\nDOM structure summary, banner", 0.6, 1.7, 3.2, 0.8, { fill: C.accent1, size: 12 });
    box(s, "Service worker\nstaged pipeline, cache, badge, block", 0.6, 2.7, 3.2, 0.8, { fill: C.text2, size: 12 });
    box(s, "Popup, options, warning page", 0.6, 3.7, 3.2, 0.8, { fill: C.accent1, size: 12 });
    s.addShape(SH.roundRect, { x: 5.0, y: 1.2, w: 4.6, h: 3.75, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: C.accent1, width: 1.5 } });
    txt(s, "Backend API (Flask)", 5.15, 1.27, 4.3, 0.3, { fontSize: 14, bold: true, color: C.accent1 });
    box(s, "URL lexical + graph", 5.15, 1.7, 2.1, 0.6, { fill: C.accent1, size: 12 });
    box(s, "Homoglyph check", 7.4, 1.7, 2.05, 0.6, { fill: C.accent1, size: 12 });
    box(s, "DOM analyzer", 5.15, 2.42, 2.1, 0.6, { fill: C.accent1, size: 12 });
    box(s, "Visual (NumPy + Pillow)", 7.4, 2.42, 2.05, 0.6, { fill: C.accent1, size: 12 });
    box(s, "Fusion engine: risk and verdict", 5.15, 3.14, 4.3, 0.6, { fill: C.text2, size: 13 });
    box(s, "brands.json", 5.15, 3.95, 1.35, 0.7, { fill: C.accent6, size: 11 });
    box(s, "templates.json", 6.62, 3.95, 1.4, 0.7, { fill: C.accent6, size: 11 });
    box(s, "feedback.jsonl", 8.14, 3.95, 1.31, 0.7, { fill: C.accent6, size: 11 });
    arrow(s, 4.0, 2.85, 5.0, 2.85, C.accent3, 2.5);
    arrow(s, 5.0, 3.25, 4.0, 3.25, C.accent5, 2.5);
    txt(s, "JSON / HTTP", 4.02, 2.45, 0.96, 0.3, { fontSize: 10, color: C.accent6, align: "center" });
    txt(s, "verdict", 4.02, 3.3, 0.96, 0.3, { fontSize: 10, color: C.accent6, align: "center" });
  }

  /* 12 ---- staged pipeline */
  {
    const s = content("Design", "Staged real-time pipeline", "Each stage is cheaper and less private than the next, so most pages stop early. Trusted brand domains stop after stage 1 and are never read. A conclusive risk of 0.90 or more skips the screenshot.");
    const cols = [
      ["1", "Before the page loads", "onBeforeNavigate", ["Sends the URL only", "Lexical graph, homoglyph, brand checks", "About 1 ms on the server", "Can block before any content"], C.accent1],
      ["2", "After the page loads", "tab complete", ["DOM structure summary", "Forms, password fields, iframes", "Skipped for trusted domains", "Never reads typed values"], C.accent2],
      ["3", "Only if the server asks", "request_screenshot", ["480 px JPEG of the visible tab", "Needs credential form + brand clue", "Skipped when already conclusive", "Hashes compared with templates"], C.accent4],
    ];
    cols.forEach(([n, t, sub, items, col], i) => {
      const x = 0.5 + i * 3.1;
      card(s, x, 1.3, 2.9, 3.0, "stage " + n);
      s.addShape(SH.ellipse, { x: x + 0.15, y: 1.45, w: 0.5, h: 0.5, fill: { color: col }, line: { color: col, width: 0 } });
      txt(s, n, x + 0.15, 1.45, 0.5, 0.5, { fontSize: 18, bold: true, color: C.background1, align: "center", valign: "middle", fontFace: "Cambria" });
      txt(s, t, x + 0.75, 1.42, 2.1, 0.55, { fontSize: 14, bold: true, valign: "middle" });
      txt(s, sub, x + 0.15, 2.05, 2.6, 0.3, { fontSize: 11, color: C.accent6, fontFace: "Consolas" });
      bullets(s, items, x + 0.15, 2.4, 2.65, 1.8, 12);
    });
    txt(s, "Also: 10-minute result cache, per-tab sequence numbers drop stale answers, re-scan on single-page-app route changes, open tabs scanned at install.", 0.5, 4.5, 9, 0.6, { fontSize: 13, color: C.accent1, bold: true });
  }

  /* 13 ---- URL lexical */
  {
    const s = content("Design", "Module 1: URL lexical analysis", "The rules are additive points, squashed to 0..1 with 1 - exp(-points/4.5). They are transparent on purpose; the optional ML model learns weights from data.");
    const groups = [
      ["Structure", "globe", ["Length of URL, host, path", "Dots, hyphens, digits in host", "Sub-domain count and path depth", "Entropy and random-looking tokens"]],
      ["Abuse signals", "warn", ["Raw IP host, odd port, no https", "@ user-info trick (paypal.com@evil)", "Abused TLDs, shorteners, free hosting", "Fake suffix inside sub-domain"]],
      ["Brand signals", "secret", ["Brand as sub-domain or inside domain", "Typosquat: edit distance 1-2", "Homoglyph skeleton equals brand", "Sensitive keywords: login, verify, kyc"]],
    ];
    groups.forEach(([t, ic, items], i) => {
      const x = 0.5 + i * 3.1;
      card(s, x, 1.3, 2.9, 2.85, "group " + t);
      badge(s, ic, x + 0.15, 1.42, 0.5, C.accent1, t);
      txt(s, t, x + 0.78, 1.42, 2.0, 0.5, { fontSize: 16, bold: true, valign: "middle" });
      bullets(s, items, x + 0.15, 2.1, 2.65, 2.0, 12);
    });
    card(s, 0.5, 4.3, 9, 0.75, "example");
    txt(s, [{ text: "Example  ", options: { bold: true, color: C.accent1 } }, { text: "http://paypal.com.secure-login.xyz/verify", options: { fontFace: "Consolas" } },
      { text: "   brand as sub-domain +4.5, fake suffix +2.0, keywords +2.4, abused TLD +1.5, no https +0.7  =  risk 0.92", options: { color: C.accent6 } }], 0.65, 4.3, 8.7, 0.75, { fontSize: 12, valign: "middle" });
  }

  /* 14 ---- URL graph */
  {
    const s = content("Design", "The URL lexical graph", "Walk the example: the brand token paypal is three hops from the registered domain secure-login.xyz. The keyword tokens secure and login are adjacent to each other inside one label. Shared token nodes create cycles when a word repeats.");
    // example graph for http://paypal.com.secure-login.xyz/verify
    const N = (label, x, y, w, fill, name) => { box(s, label, x, y, w, 0.42, { fill, size: 11, shape: SH.roundRect }); return { x: x + w / 2, y: y + 0.21, l: x, r: x + w, t: y, b: y + 0.42, name }; };
    const root = N("URL", 0.5, 2.75, 0.7, C.text2);
    const scheme = N("http", 1.55, 1.9, 0.8, C.accent6);
    const suffix = N("xyz", 1.55, 3.7, 0.8, C.accent6);
    const sld = N("secure-login", 2.75, 3.7, 1.4, C.accent5);
    const sub0 = N("sub: com", 4.55, 3.7, 1.0, C.accent4);
    const sub1 = N("sub: paypal", 5.9, 3.7, 1.2, C.accent4);
    const tSecure = N("secure", 2.0, 4.45, 0.85, C.accent3);
    const tLogin = N("login", 3.1, 4.45, 0.85, C.accent3);
    const tPay = N("paypal", 5.9, 4.45, 1.2, C.accent3);
    const path = N("path: verify", 2.75, 2.75, 1.3, C.accent6);
    const tVer = N("verify", 4.55, 2.75, 0.9, C.accent3);
    line(s, root.x, root.t, scheme.l, scheme.y, C.accent6); line(s, root.x, root.b, suffix.l, suffix.y, C.accent6);
    line(s, root.r, root.y, path.l, path.y, C.accent6);
    line(s, suffix.r, suffix.y, sld.l, sld.y, C.accent6); line(s, sld.r, sld.y, sub0.l, sub0.y, C.accent6); line(s, sub0.r, sub0.y, sub1.l, sub1.y, C.accent6);
    line(s, sld.x - 0.3, sld.b, tSecure.x, tSecure.t, C.accent6); line(s, sld.x + 0.3, sld.b, tLogin.x, tLogin.t, C.accent6);
    line(s, tSecure.r, tSecure.y, tLogin.l, tLogin.y, C.accent3, 2);
    line(s, sub1.x, sub1.b, tPay.x, tPay.t, C.accent6); line(s, path.r, path.y, tVer.l, tVer.y, C.accent6);
    // legend + features
    card(s, 7.45, 1.3, 2.05, 3.75, "graph features");
    txt(s, "Graph features", 7.55, 1.38, 1.9, 0.3, { fontSize: 13, bold: true, color: C.accent1 });
    bullets(s, ["Nodes, edges, density", "Depth, degree", "Cycles (shared tokens)", "Brand-token distance from the registered domain", "Keyword next to brand token", "Random tokens, entropy"], 7.55, 1.75, 1.9, 3.2, 11);
    txt(s, "Edges: host hierarchy, path chain, query keys, token adjacency inside a label. Token nodes are shared, so a repeated word creates a cycle.", 0.5, 1.25, 6.8, 0.5, { fontSize: 11, color: C.accent6 });
    txt(s, "Brand token is 3 hops from the registered domain; red edge: adjacent tokens inside one label", 0.5, 4.97, 6.8, 0.25, { fontSize: 10, color: C.accent6 });
  }

  /* 15 ---- homoglyph */
  {
    const s = content("Design", "Homoglyph and typosquat detection", "Show the skeleton idea. The unit test also asserts that no two protected brands share a skeleton, so the map cannot create false matches between brands.");
    card(s, 0.5, 1.3, 4.3, 1.5, "example card");
    txt(s, "xn--pypal-4ve.com", 0.7, 1.4, 3.9, 0.35, { fontSize: 15, fontFace: "Consolas", color: C.accent3, bold: true });
    txt(s, "decodes to  p\u0430ypal.com", 0.7, 1.8, 3.9, 0.35, { fontSize: 15, fontFace: "Consolas" });
    txt(s, "the \u0430 is Cyrillic, not Latin 'a'. Browsers can show it identically to paypal.com", 0.7, 2.2, 3.9, 0.55, { fontSize: 12, color: C.accent6 });
    const steps = [["1", "Decode punycode (IDNA)"], ["2", "Flag labels mixing Latin and other scripts"], ["3", "Map look-alikes to an ASCII skeleton"], ["4", "Skeleton equals brand but text differs: look-alike"]];
    steps.forEach(([n, t], i) => {
      const y = 3.0 + i * 0.5;
      s.addShape(SH.ellipse, { x: 0.5, y: y + 0.03, w: 0.36, h: 0.36, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
      txt(s, n, 0.5, y + 0.03, 0.36, 0.36, { fontSize: 12, bold: true, color: C.background1, align: "center", valign: "middle" });
      txt(s, t, 1.0, y, 3.8, 0.42, { fontSize: 13, valign: "middle" });
    });
    const rows = [[hdrCell("Disguised"), hdrCell("Skeleton of"), hdrCell("Caught as")],
      [cell("p\u0430ypal (Cyrillic a)", { fontFace: "Consolas" }), cell("paypal"), cell("homoglyph")],
      [cell("paypa1-secure", { fontFace: "Consolas" }), cell("paypal"), cell("homoglyph")],
      [cell("rnicrosoft", { fontFace: "Consolas" }), cell("microsoft"), cell("homoglyph")],
      [cell("amaz0n", { fontFace: "Consolas" }), cell("amazon"), cell("homoglyph")],
      [cell("paypall", { fontFace: "Consolas" }), cell("edit distance 1"), cell("typosquat")]];
    s.addTable(rows, { x: 5.1, y: 1.3, w: 4.4, colW: [1.75, 1.45, 1.2], border: BORDER, valign: "middle", rowH: 0.5, margin: [0.04, 0.08, 0.04, 0.08], fill: { color: "FFFFFF" } });
    txt(s, "Rules: rn to m, vv to w, 0 to o, 1 or i to l, plus Cyrillic, Greek and Armenian look-alike letters.", 5.1, 4.45, 4.4, 0.6, { fontSize: 12, color: C.accent6 });
  }

  /* 16 ---- DOM */
  {
    const s = content("Design", "Module 2: DOM structure analysis", "The content script only counts and summarises. Weights are additive points that are squashed to a 0 to 1 score. Brand claim means the title or text names a brand that does not own the current domain.");
    const rows = [[hdrCell("Signal"), hdrCell("Why it matters"), hdrCell("Points")],
      [cell("Brand claimed in title, page on another domain"), cell("Page presents itself as a brand it is not"), cell("+4.5", { bold: true, align: "center" })],
      [cell("Credential form posts to another domain"), cell("Classic harvesting pattern"), cell("+4.0", { bold: true, align: "center" })],
      [cell("Password form over http, or mailto: form"), cell("Unencrypted or emailed credentials"), cell("+2.5 to 3.0", { bold: true, align: "center" })],
      [cell("Card, OTP, Aadhaar, PAN style fields"), cell("Asks for data a login never needs"), cell("+1.5", { bold: true, align: "center" })],
      [cell("Mostly empty links, external resources, hidden iframes"), cell("Cloned or cloaked page"), cell("+1.2 to 1.5", { bold: true, align: "center" })],
      [cell("Thin page, urgency wording, right-click disabled"), cell("Lure and anti-inspection tricks"), cell("+1.0", { bold: true, align: "center" })]];
    s.addTable(rows, { x: 0.5, y: 1.3, w: 9, colW: [4.0, 3.7, 1.3], border: BORDER, valign: "middle", rowH: [0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], margin: [0.04, 0.1, 0.04, 0.1], fill: { color: "FFFFFF" } });
    txt(s, "Privacy by design: counts and form targets only. Values typed into inputs are never read.", 0.5, 4.75, 9, 0.35, { fontSize: 13, bold: true, color: C.accent1 });
  }

  /* 17 ---- visual */
  {
    const s = content("Design", "Module 3: visual layout analysis", "No deep learning. A screenshot becomes a compact descriptor, compared with templates of the real login page. The chart uses synthetic test pages from the test suite; the real-browser demo clone scored 0.993.");
    const steps = ["Screenshot 480 px", "pHash + dHash", "8x8 layout grid", "Colour histogram", "Compare with brand templates"];
    steps.forEach((t, i) => {
      box(s, t, 0.5 + i * 1.82, 1.3, 1.62, 0.62, { fill: i === 4 ? C.accent5 : C.accent1, size: 11 });
      if (i < 4) arrow(s, 0.5 + i * 1.82 + 1.62, 1.61, 0.5 + (i + 1) * 1.82, 1.61, C.accent6);
    });
    txt(s, "similarity = 0.35 pHash + 0.20 dHash + 0.30 layout cosine + 0.15 colour overlap", 0.5, 2.05, 9, 0.3, { fontSize: 12, fontFace: "Consolas", color: C.accent1 });
    s.addChart(pres.charts.BAR, [{ name: "Similarity to template", labels: ["Identical", "1080p scale", "800 px scale", "Text edited", "Shifted 6 px", "Recoloured", "Blog page", "Dashboard", "Other login", "Blank page"], values: [1.0, 0.977, 0.985, 0.994, 0.933, 0.995, 0.599, 0.37, 0.35, 0.462] }], {
      x: 0.4, y: 2.4, w: 6.4, h: 2.75, barDir: "col", chartColors: [H.accent1, H.accent1, H.accent1, H.accent1, H.accent1, H.accent1, H.accent6, H.accent6, H.accent6, H.accent6],
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 9, dataLabelColor: H.dk1, dataLabelFormatCode: "0.00", catAxisLabelFontSize: 9, catAxisLabelColor: H.dk1, valAxisLabelColor: H.accent6,
      valAxisLabelFontSize: 9, valGridLine: { color: "E2E8F0", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, valAxisMinVal: 0, valAxisMaxVal: 1.1, valAxisLabelFormatCode: "0.0",
      catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt",
    });
    card(s, 7.0, 2.45, 2.5, 2.6, "thresholds");
    txt(s, "Thresholds", 7.15, 2.52, 2.2, 0.3, { fontSize: 13, bold: true, color: C.accent1 });
    bullets(s, ["Strong clone: 0.88 or more", "Weak match: 0.78 to 0.88, needs other evidence", "Clones 0.93-0.99, unrelated 0.35-0.60", "Real-browser demo clone: 0.993"], 7.15, 2.85, 2.25, 2.1, 11);
  }

  /* 18 ---- fusion */
  {
    const s = content("Design", "Fusion and risk scoring", "Noisy-OR means independent weak signals add up, but one strong signal is enough on its own. The brand-evidence rules stop a single ambiguous signal from becoming a block.");
    card(s, 0.5, 1.3, 4.5, 3.75, "fusion rules");
    txt(s, "Noisy-OR fusion", 0.65, 1.38, 4.2, 0.3, { fontSize: 15, bold: true, color: C.accent1 });
    txt(s, "risk = 1 - product( 1 - w x score )\nover URL, DOM, visual (and ML)", 0.65, 1.75, 4.2, 0.6, { fontSize: 13, fontFace: "Consolas" });
    txt(s, "Brand-evidence rules", 0.65, 2.45, 4.2, 0.3, { fontSize: 15, bold: true, color: C.accent1 });
    bullets(s, ["Evidence sources: brand in URL, brand claim in DOM, visual match", "Credential form + strong visual or 2 sources: risk at least 0.90", "One source only: at least 0.60 (suspicious)", "Trusted brand domains: fixed at 0.02"], 0.65, 2.82, 4.2, 2.2, 12);
    const bands = [["Safe", "below 0.40", C.accent5], ["Suspicious", "0.40 to 0.70", C.accent4], ["Phishing", "0.70 and above", C.accent3]];
    bands.forEach(([t, r, col], i) => {
      const y = 1.3 + i * 0.95;
      box(s, t, 5.3, y, 1.7, 0.8, { fill: col, size: 16 });
      txt(s, r, 7.15, y, 2.3, 0.8, { fontSize: 14, valign: "middle" });
    });
    card(s, 5.3, 4.15, 4.2, 0.9, "block rule");
    txt(s, [{ text: "Block page: ", options: { bold: true, color: C.accent3 } }, { text: "risk of 0.85 or more shows the warning page (threshold set in options)" }], 5.45, 4.15, 3.95, 0.9, { fontSize: 12, valign: "middle" });
  }

  /* 19 ---- sequence */
  pres.addSection({ title: "Implementation" });
  {
    const s = content("Implementation", "Sequence diagram", "Follow one page visit from top to bottom. Messages 1-3 happen before the page loads; 4-7 after it loads; 8-10 only when the server asks for a screenshot.");
    const lx = [1.3, 3.8, 6.1, 8.5];
    const names = ["Browser tab", "Service worker", "Content script", "Backend API"];
    names.forEach((n, i) => { box(s, n, lx[i] - 0.65, 1.2, 1.3, 0.38, { fill: i === 3 ? C.text2 : C.accent1, size: 11 }); line(s, lx[i], 1.58, lx[i], 5.1, C.accent6, 1, "dash"); });
    const msgs = [[0, 1, "1 onBeforeNavigate(url)"], [1, 3, "2 POST /analyze/url"], [3, 1, "3 risk, reasons (block?)"], [0, 1, "4 tab complete"], [1, 2, "5 collect DOM"], [2, 1, "6 DOM summary"],
      [1, 3, "7 POST /analyze {url, dom}"], [3, 1, "8 verdict + request_screenshot"], [1, 3, "9 + 480 px screenshot"], [3, 1, "10 final verdict"], [1, 0, "11 badge, banner or warning"]];
    msgs.forEach(([a, b, t], i) => {
      const y = 1.82 + i * 0.3;
      arrow(s, lx[a], y, lx[b], y, i < 3 ? C.accent1 : (i < 7 ? C.accent2 : C.accent4), 1.5);
      const x0 = Math.min(lx[a], lx[b]);
      txt(s, t, x0 + 0.05, y - 0.22, Math.abs(lx[b] - lx[a]) - 0.1, 0.2, { fontSize: 10, color: C.text1, align: "center" });
    });
  }

  /* 20 ---- use case */
  {
    const s = content("Implementation", "Use case diagram", "Two actors: the end user and the analyst or administrator who maintains brands, templates and the model.");
    s.addShape(SH.roundRect, { x: 1.7, y: 1.2, w: 6.6, h: 3.85, rectRadius: 0.08, fill: { color: C.background1 }, line: { color: C.accent1, width: 1.5 } });
    txt(s, "PhishGuard system", 1.85, 1.25, 3, 0.3, { fontSize: 12, bold: true, color: C.accent1 });
    const left = ["Browse (automatic scan)", "View verdict and reasons", "Block or bypass warning", "Report phishing / safe"];
    const right = ["Teach brand template", "Configure settings, allow-list", "Review feedback log", "Train / update ML model"];
    const uc = (t, x, y) => { s.addShape(SH.ellipse, { x, y, w: 2.9, h: 0.58, fill: { color: C.background2 }, line: { color: C.accent1, width: 1 } }); txt(s, t, x, y, 2.9, 0.58, { fontSize: 11, align: "center", valign: "middle", bold: true }); return [x, y + 0.29, x + 2.9]; };
    const L = left.map((t, i) => uc(t, 1.95, 1.65 + i * 0.85));
    const R = right.map((t, i) => uc(t, 5.2, 1.65 + i * 0.85));
    badge(s, "user", 0.45, 2.55, 0.8, C.accent1, "end user"); txt(s, "End user", 0.2, 3.4, 1.3, 0.3, { fontSize: 12, bold: true, align: "center" });
    badge(s, "tools", 8.7, 2.55, 0.8, C.text2, "analyst"); txt(s, "Analyst / admin", 8.4, 3.4, 1.4, 0.3, { fontSize: 12, bold: true, align: "center" });
    L.forEach(([x, y]) => line(s, 1.25, 2.95, x, y, C.accent6, 1));
    R.forEach(([x, y, x2]) => line(s, 8.7, 2.95, x2, y, C.accent6, 1));
  }

  /* 21 ---- SRS */
  {
    const s = content("Implementation", "Software requirements", "Requirements are phrased so each one can be tested; the test slide shows how they are verified.");
    card(s, 0.5, 1.3, 4.4, 3.75, "functional");
    txt(s, "Functional", 0.65, 1.38, 4, 0.3, { fontSize: 15, bold: true, color: C.accent1 });
    bullets(s, ["Analyse every http(s) navigation automatically", "Return verdict, risk and reasons", "Block high-risk pages with a bypass option", "Learn brand templates from a screenshot", "Accept user feedback and an allow-list", "Optional ML model trained from CSV"], 0.65, 1.75, 4.1, 3.2, 13);
    card(s, 5.1, 1.3, 4.4, 2.0, "non-functional");
    txt(s, "Non-functional", 5.25, 1.38, 4, 0.3, { fontSize: 15, bold: true, color: C.accent1 });
    bullets(s, ["Latency: URL stage in milliseconds", "Privacy: no typed values, screenshots on demand", "Robustness: bad input never crashes the API", "Security: API key, rate limit, localhost bind"], 5.25, 1.75, 4.15, 1.5, 12);
    card(s, 5.1, 3.45, 4.4, 1.6, "environment");
    txt(s, "Environment", 5.25, 3.52, 4, 0.3, { fontSize: 15, bold: true, color: C.accent1 });
    bullets(s, ["Python 3.10+, Flask, NumPy, Pillow", "Chrome / Edge 110+ (Manifest V3)", "Any laptop, no GPU required"], 5.25, 3.88, 4.15, 1.1, 12);
  }

  /* 22 ---- tech stack */
  {
    const s = content("Implementation", "Technology stack", "Each choice is deliberate: Python for the CV and ML stack, MV3 because Chrome requires it for new extensions, hashes instead of CNNs for latency and no GPU.");
    const items = [["chrome", "Extension", "JavaScript, Manifest V3, service worker, content script, OffscreenCanvas"], ["server", "Backend", "Python 3, Flask REST API, waitress server"], ["image", "Computer vision", "NumPy and Pillow: pHash, dHash, layout descriptor"],
      ["layer", "Machine learning", "scikit-learn gradient boosting on URL and graph features (optional)"], ["bug", "Testing", "unittest, Playwright with real Chromium, latency benchmark"], ["db", "Data", "PhishTank / OpenPhish (phishing), Tranco list (benign), JSON stores"]];
    items.forEach(([ic, t, d], i) => {
      const col = i % 3, row = Math.floor(i / 3), x = 0.5 + col * 3.1, y = 1.3 + row * 1.9;
      card(s, x, y, 2.9, 1.75, "stack " + t);
      badge(s, ic, x + 0.15, y + 0.15, 0.55, C.accent1, t);
      txt(s, t, x + 0.85, y + 0.15, 1.95, 0.55, { fontSize: 15, bold: true, valign: "middle" });
      txt(s, d, x + 0.15, y + 0.85, 2.65, 0.85, { fontSize: 12, color: C.accent6 });
    });
  }

  /* 23 ---- UI mockups */
  {
    const s = content("Implementation", "Extension user interface", "These are drawn representations of the real screens: the toolbar popup, the in-page banner and the full-page warning shown for risk of 0.85 or more.");
    // popup
    s.addShape(SH.roundRect, { x: 0.5, y: 1.25, w: 2.9, h: 3.8, rectRadius: 0.1, fill: { color: C.text2 }, line: { color: C.text2, width: 1 } });
    txt(s, "PhishGuard", 0.7, 1.35, 2.5, 0.3, { fontSize: 13, bold: true, color: C.background1 });
    box(s, "PHISHING", 0.7, 1.75, 1.15, 0.32, { fill: C.accent3, size: 10 });
    s.addShape(SH.roundRect, { x: 1.95, y: 1.86, w: 1.2, h: 0.1, rectRadius: 0.05, fill: { color: C.accent3 }, line: { color: C.accent3, width: 0 } });
    txt(s, "98%  |  brand: DemoBank", 0.7, 2.15, 2.5, 0.25, { fontSize: 10, color: C.accent2 });
    txt(s, "Looks almost identical to the DemoBank login page\nPage presents itself as DemoBank\nSensitive keywords in URL", 0.7, 2.5, 2.55, 0.9, { fontSize: 10, color: C.background2 });
    box(s, "Re-scan", 0.7, 3.65, 1.2, 0.34, { fill: C.accent2, size: 10, color: C.text2 }); box(s, "Trust site", 2.0, 3.65, 1.2, 0.34, { fill: C.accent6, size: 10 });
    txt(s, "Teach a brand's real login page", 0.7, 4.2, 2.5, 0.3, { fontSize: 10, color: C.accent2 });
    txt(s, "Toolbar popup", 0.5, 5.05, 2.9, 0.22, { fontSize: 10, color: C.accent6, align: "center" });
    // banner
    s.addShape(SH.roundRect, { x: 3.65, y: 1.25, w: 2.9, h: 3.8, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: C.accent6, width: 1 } });
    s.addShape(SH.rect, { x: 3.65, y: 1.25, w: 2.9, h: 0.95, fill: { color: "7F1D1D" }, line: { color: "7F1D1D", width: 0 } });
    txt(s, "Likely phishing page: pretending to be DemoBank (risk 98%)", 3.75, 1.28, 2.7, 0.55, { fontSize: 10, bold: true, color: C.background1 });
    txt(s, "- Visual clone of DemoBank login", 3.75, 1.82, 2.7, 0.3, { fontSize: 9, color: "FECACA" });
    box(s, "Log in to DemoBank", 4.2, 2.8, 1.8, 0.4, { fill: C.accent6, size: 10 });
    box(s, "Customer ID", 4.2, 3.35, 1.8, 0.3, { fill: C.background2, size: 9, color: C.accent6, bold: false });
    box(s, "Password", 4.2, 3.75, 1.8, 0.3, { fill: C.background2, size: 9, color: C.accent6, bold: false });
    txt(s, "In-page banner (closed shadow root)", 3.65, 5.05, 2.9, 0.22, { fontSize: 10, color: C.accent6, align: "center" });
    // warning page
    s.addShape(SH.roundRect, { x: 6.8, y: 1.25, w: 2.7, h: 3.8, rectRadius: 0.1, fill: { color: "450A0A" }, line: { color: "450A0A", width: 1 } });
    txt(s, "Deceptive site blocked", 6.95, 1.5, 2.4, 0.4, { fontSize: 14, bold: true, color: "FEE2E2", fontFace: "Cambria" });
    txt(s, "Likely credential theft, pretending to be DemoBank.\nRisk 98%", 6.95, 2.0, 2.4, 0.7, { fontSize: 10, color: "FECACA" });
    txt(s, "- Visual clone\n- Brand claim in title\n- Sensitive keywords", 6.95, 2.8, 2.4, 0.8, { fontSize: 10, color: "FECACA" });
    box(s, "Take me to safety", 6.95, 3.8, 2.4, 0.36, { fill: "FECACA", size: 10, color: "450A0A" });
    box(s, "Continue anyway", 6.95, 4.3, 2.4, 0.36, { fill: "450A0A", lineColor: "B91C1C", size: 10, color: "FECACA" });
    txt(s, "Blocking warning page", 6.8, 5.05, 2.7, 0.22, { fontSize: 10, color: C.accent6, align: "center" });
  }

  /* 24 ---- API */
  {
    const s = content("Implementation", "REST API design", "The server decides when a screenshot is needed (request_screenshot), so the client never uploads images unnecessarily.");
    const rows = [[hdrCell("Endpoint"), hdrCell("Input"), hdrCell("Output")],
      [cell("POST /v1/analyze/url", { fontFace: "Consolas" }), cell("url"), cell("verdict, risk, reasons, graph (optional)")],
      [cell("POST /v1/analyze", { fontFace: "Consolas" }), cell("url, dom, screenshot_b64"), cell("same + request_screenshot, stage, timing")],
      [cell("POST /v1/brands/templates", { fontFace: "Consolas" }), cell("brand, domains, screenshot"), cell("learns a visual template")],
      [cell("GET /v1/brands", { fontFace: "Consolas" }), cell("none"), cell("protected brands and template counts")],
      [cell("POST /v1/feedback", { fontFace: "Consolas" }), cell("url, label"), cell("logged as scheme://host/path only")],
      [cell("GET /health", { fontFace: "Consolas" }), cell("none"), cell("version, brands, ML model loaded")]];
    s.addTable(rows, { x: 0.5, y: 1.3, w: 9, colW: [3.0, 2.6, 3.4], border: BORDER, valign: "middle", rowH: [0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], margin: [0.04, 0.1, 0.04, 0.1], fill: { color: "FFFFFF" } });
    txt(s, "Safeguards: optional X-API-Key, per-IP rate limit, 8 MB body limit, CORS only for chrome-extension origins, input sanitised.", 0.5, 4.85, 9, 0.4, { fontSize: 12, color: C.accent1, bold: true });
  }

  /* 25 ---- real-time */
  pres.addSection({ title: "Evaluation" });
  {
    const s = content("Evaluation", "Can it run in real time?", "Server timings are in-process means measured with tools/benchmark.py on a single-core machine. End-to-end 0.45 s is from the real-Chromium test on localhost and includes page load, DOM collection, screenshot and two API calls. A remote backend adds network round-trip time.");
    s.addChart(pres.charts.BAR, [{ name: "Mean server time (ms)", labels: ["URL + lexical graph", "URL + DOM", "Visual descriptor", "Full: URL + DOM + screenshot"], values: [0.83, 0.9, 2.9, 4.57] }], {
      x: 0.4, y: 1.25, w: 5.4, h: 3.0, barDir: "bar", chartColors: [H.accent1], showTitle: true, title: "Mean server time per analysis (ms)", titleFontSize: 12, titleColor: H.dk1,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 11, dataLabelColor: H.dk1, dataLabelFormatCode: "0.00", catAxisLabelColor: H.dk1, catAxisLabelFontSize: 11, valAxisLabelColor: H.accent6,
      valAxisLabelFontSize: 10, valGridLine: { color: "E2E8F0", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, valAxisMinVal: 0, valAxisMaxVal: 6, catAxisOrientation: "maxMin",
      catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", titleFontFace: "+mn-lt",
    });
    stat(s, "0.45 s", "navigation to final verdict in real Chromium, including page load and a screenshot", 6.1, 1.25, 3.4, C.accent5);
    card(s, 0.5, 4.35, 9, 0.8, "yes answer");
    txt(s, [{ text: "Yes, with limits: ", options: { bold: true, color: C.accent1 } }, { text: "Chrome allows about 2 captures per second and only of the visible tab; an MV3 worker can sleep (state kept in session storage); a remote backend adds network latency." }], 0.65, 4.35, 8.7, 0.8, { fontSize: 12, valign: "middle" });
    txt(s, "Screenshot payload: 480 px JPEG (about 7 KB for the demo page).", 6.1, 2.5, 3.4, 0.6, { fontSize: 12, color: C.accent6 });
  }

  /* 26 ---- testing */
  {
    const s = content("Evaluation", "Testing and evaluation plan", "Be clear about what is measured and what is not: functional correctness and latency are measured; detection accuracy must come from real datasets and is described as a plan.");
    const rows = [[hdrCell("Level"), hdrCell("What is checked"), hdrCell("Result")],
      [cell("Unit and API", { bold: true }), cell("URL parsing, homoglyphs, lexical scoring, graph, DOM, visual, API auth, rate limit, privacy"), cell("35 tests pass", { bold: true, color: H.accent5 })],
      [cell("End to end", { bold: true }), cell("Real Chromium + extension: benign page, brand learning, clone block, bypass, URL-stage block, popup"), cell("11 of 11 pass", { bold: true, color: H.accent5 })],
      [cell("Latency", { bold: true }), cell("Benchmark of URL, DOM and visual stages"), cell("0.8 to 4.6 ms", { bold: true, color: H.accent5 })]];
    s.addTable(rows, { x: 0.5, y: 1.3, w: 9, colW: [1.6, 5.6, 1.8], border: BORDER, valign: "middle", rowH: [0.38, 0.6, 0.6, 0.45], margin: [0.04, 0.1, 0.04, 0.1], fill: { color: "FFFFFF" } });
    card(s, 0.5, 3.55, 9, 1.5, "accuracy plan");
    txt(s, "Accuracy evaluation plan (to run on real data)", 0.65, 3.62, 8.7, 0.3, { fontSize: 14, bold: true, color: C.accent1 });
    bullets(s, ["Data: PhishTank / OpenPhish phishing URLs, Tranco top sites as benign", "Split grouped by registrable domain to avoid leakage; also a time-based split", "Report precision, recall, F1, ROC-AUC and false-positive rate"], 0.65, 3.98, 8.7, 1.05, 12);
  }

  /* 27 ---- privacy & security */
  {
    const s = content("Evaluation", "Privacy, security and ethics", "Privacy is a design property, not an afterthought: the cheapest stage runs first and trusted domains are never read.");
    const items = [["lock", "Minimal data", "Typed values never read. Structure summary only. Trusted domains are not read at all."], ["image", "Screenshots on demand", "480 px, only if the server asks, never stored. Only hashes of registered templates are kept."],
      ["server", "Hardened API", "Localhost bind, optional API key, rate limit, body limit, CORS for the extension only."], ["userShield", "User control", "URL-only mode, allow-list, bypass option, feedback stores host and path only."]];
    items.forEach(([ic, t, d], i) => {
      const col = i % 2, row = Math.floor(i / 2), x = 0.5 + col * 4.6, y = 1.3 + row * 1.9;
      card(s, x, y, 4.4, 1.75, "privacy " + t);
      badge(s, ic, x + 0.15, y + 0.15, 0.55, C.accent1, t);
      txt(s, t, x + 0.85, y + 0.15, 3.4, 0.55, { fontSize: 16, bold: true, valign: "middle" });
      txt(s, d, x + 0.15, y + 0.85, 4.1, 0.85, { fontSize: 13, color: C.accent6 });
    });
  }

  /* 28 ---- limitations */
  pres.addSection({ title: "Closing" });
  {
    const s = content("Closing", "Limitations and threat model", "State these before the examiner does. Each limitation has a mitigation or a future-work item.");
    const rows = [[hdrCell("Limitation or attack"), hdrCell("Effect"), hdrCell("Mitigation")],
      [cell("Visual layer needs templates", { bold: true }), cell("Unregistered brands get no visual check"), cell("Teach brands from the popup; ship a template pack")],
      [cell("Cloaking by the phishing kit", { bold: true }), cell("Scanner sees a benign page"), cell("Analyse in the user's own browser; re-scan on route change")],
      [cell("Form drawn as image or canvas", { bold: true }), cell("DOM signals are weak"), cell("Visual and URL layers still apply")],
      [cell("Small layout changes", { bold: true }), cell("Similarity drops below the threshold"), cell("Multiple templates; weak matches count as evidence")],
      [cell("Hand-tuned thresholds", { bold: true }), cell("Not calibrated on large data"), cell("Calibrate on real datasets before claiming accuracy")]];
    s.addTable(rows, { x: 0.5, y: 1.3, w: 9, colW: [2.9, 2.9, 3.2], border: BORDER, valign: "middle", rowH: [0.38, 0.62, 0.62, 0.62, 0.62, 0.62], margin: [0.04, 0.1, 0.04, 0.1], fill: { color: "FFFFFF" } });
  }

  /* 29 ---- future scope */
  {
    const s = content("Closing", "Future scope", "Prioritise: calibrating on real data first, then logo detection, then an in-browser model.");
    const items = [["graph", "Graph neural network over the URL token graph"], ["image", "Logo detection instead of whole-page similarity"], ["rocket", "In-browser ONNX model for fully offline use"], ["globe", "Community-shared brand templates and feedback"],
      ["file", "QR-code and SMS link checking"], ["chrome", "Firefox and Edge store builds"]];
    items.forEach(([ic, t], i) => {
      const col = i % 2, row = Math.floor(i / 2), x = 0.5 + col * 4.6, y = 1.3 + row * 1.25;
      card(s, x, y, 4.4, 1.1, "future " + (i + 1));
      badge(s, ic, x + 0.15, y + 0.22, 0.65, C.accent1, "future " + (i + 1));
      txt(s, t, x + 1.0, y, 3.3, 1.1, { fontSize: 14, bold: true, valign: "middle" });
    });
  }

  /* 30 ---- conclusion (dark) */
  {
    const s = dark("Closing", "Conclusion", "Close with the three takeaways. Then offer the live demo: playground, clone detection, popup reasons.");
    const pts = [["check", "Zero-day capable: pages are judged on URL graph, DOM and visual evidence, not on a list."], ["bolt", "Real-time: staged pipeline, about 1 ms URL stage, 0.45 s end to end with screenshot."], ["lock", "Explainable and private: every verdict has reasons, and page data is sent only when needed."]];
    pts.forEach(([ic, t], i) => {
      const y = 1.35 + i * 1.15;
      badge(s, ic, 0.6, y, 0.7, C.accent1, "takeaway " + (i + 1));
      txt(s, t, 1.55, y - 0.05, 7.9, 0.8, { fontSize: 18, color: C.background1, valign: "middle" });
    });
    txt(s, "A working extension, API, 35 unit tests and an 11-check browser test deliver the objectives.", 0.6, 4.75, 8.9, 0.4, { fontSize: 14, color: C.accent2, italic: true });
  }

  /* 31 ---- references */
  {
    const s = content("Closing", "References", "Format these in the citation style your college requires. Statistics come from the APWG reports named on the motivation slide.");
    const refs = [
      "A. Abdelnabi, K. Krombholz, M. Fritz. VisualPhishNet: Zero-day phishing website detection by visual similarity. ACM CCS, 2020.",
      "Y. Lin et al. Phishpedia: A hybrid deep learning based approach to visually identify phishing webpages. USENIX Security, 2021.",
      "R. Liu et al. Inferring phishing intention via webpage appearance and dynamics (PhishIntention). USENIX Security, 2022.",
      "J. Ma, L. Saul, S. Savage, G. Voelker. Beyond blacklists: Learning to detect malicious web sites from suspicious URLs. KDD, 2009.",
      "Y. Zhang, J. Hong, L. Cranor. CANTINA: A content-based approach to detecting phishing web sites. WWW, 2007.",
      "C. Whittaker, B. Ryner, M. Nazif. Large-scale automatic classification of phishing pages. NDSS, 2010.",
      "O. Sahingoz et al. Machine learning based phishing detection from URLs. Expert Systems with Applications, 2019.",
      "A. Fu, L. Wenyin, X. Deng. Detecting phishing web pages with visual similarity assessment based on EMD. IEEE TDSC, 2006.",
      "S. Afroz, R. Greenstadt. PhishZoo: Detecting phishing websites by looking at them. IEEE ICSC, 2011.",
      "E. Gabrilovich, A. Gontmakher. The homograph attack. Communications of the ACM, 2002.",
      "APWG. Phishing Activity Trends Reports, 2025 year in review and Q1 2026. apwg.org.",
    ];
    bullets(s, refs, 0.5, 1.2, 9, 3.95, 12);
  }

  /* 32 ---- thank you */
  {
    const s = pres.addSlide({ masterName: "TITLE", sectionTitle: "Closing" });
    s.addNotes("Offer the demo. Have the backend running (python run.py), the extension loaded, and the demo server started (python demo/serve_demo.py).");
    s.addShape(SH.ellipse, { x: 4.2, y: 0.7, w: 1.6, h: 1.6, fill: { color: C.accent1 }, line: { color: C.accent2, width: 2 }, objectName: "closing motif circle" });
    s.addImage({ data: IC.shield, x: 4.6, y: 1.1, w: 0.8, h: 0.8, altText: "Shield icon" });
    txt(s, "Thank you", 0.5, 2.5, 9, 0.9, { fontSize: 44, bold: true, fontFace: "Cambria", color: C.background1, align: "center" });
    txt(s, "Questions and live demo", 0.5, 3.4, 9, 0.5, { fontSize: 20, color: C.accent2, align: "center" });
    txt(s, "[Student names]  |  [Guide name]  |  [College name], SPPU", 0.5, 4.5, 9, 0.4, { fontSize: 13, color: C.background2, align: "center" });
  }

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("written", OUT);
})();
