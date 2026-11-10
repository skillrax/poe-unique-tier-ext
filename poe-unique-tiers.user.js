// ==UserScript==
// @name         PoE Wiki Unique Tiers
// @namespace    poe-unique-tier-ext
// @version      0.2.0
// @description  Shows a unique item's drop tier (from Guide:Analysis of unique item tiers) on its poewiki.net page.
// @author       skillrax
// @license      MIT
// @homepageURL  https://github.com/skillrax/poe-unique-tier-ext
// @supportURL   https://github.com/skillrax/poe-unique-tier-ext/issues
// @updateURL    https://raw.githubusercontent.com/skillrax/poe-unique-tier-ext/main/poe-unique-tiers.user.js
// @downloadURL  https://raw.githubusercontent.com/skillrax/poe-unique-tier-ext/main/poe-unique-tiers.user.js
// @match        https://www.poewiki.net/wiki/*
// @match        https://poewiki.net/wiki/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM.getValue
// @grant        GM.setValue
// @run-at       document-idle
// ==/UserScript==

/* ---------- Parser (pure; also loadable from Node for testing) ---------- */

const SOURCE_NAMES = { d: "Dust", u: "Ultimatum", r: "Ritual" };

function cleanHeader(h) {
  return h.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
}

function parseCell(raw) {
  // e.g. "4<sup>d</sup>", "2<sup>u</sup>", "3", "", "<s>2</s> 3"
  const text = raw.replace(/<s>.*?<\/s>/gi, "").trim();
  const m = text.match(/^(T?F|-?\d)\s*(?:<sup>\s*([a-z,\s]+)\s*<\/sup>)?/i);
  if (!m) return null;
  const sources = (m[2] || "")
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((s) => SOURCE_NAMES[s.toLowerCase()] || s);
  return { tier: m[1].toUpperCase(), source: sources.join(", ") };
}

function linkTarget(cell) {
  const m = cell.match(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/);
  return m ? m[1].trim() : null;
}

function stripMarkup(s) {
  return s
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/\{\{il\|([^}|]+)[^}]*\}\}/g, "$1")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// Wikitext of the guide -> { "Page title": { section, history, latest, notes } }
function parseTierWikitext(wikitext) {
  const text = wikitext.replace(/<!--[\s\S]*?-->/g, "");
  const result = {};
  let headers = null;
  let section = "";

  for (const line of text.split("\n")) {
    const sec = line.match(/^(=+)\s*(.*?)\s*\1\s*$/);
    if (sec) { section = sec[2]; continue; }

    // Each table has its own version columns, so read the header per table.
    if (/^!\s*Unique\b/.test(line)) {
      headers = line.replace(/^!/, "").split("!!").map(cleanHeader);
      continue;
    }
    if (line.startsWith("|}")) { headers = null; continue; }
    if (!headers || !/^\|\s*\[\[/.test(line)) continue;

    const cells = line.replace(/^\|/, "").split("||");
    const name = linkTarget(cells[0]);
    if (!name) continue;

    const history = [];
    let notes = "";
    for (let i = 1; i < cells.length && i < headers.length; i++) {
      const h = headers[i];
      if (/^notes?$/i.test(h)) { notes = stripMarkup(cells[i]); continue; }
      const parsed = parseCell(cells[i]);
      if (parsed) history.push({ version: h, ...parsed });
    }
    if (!history.length && !notes) continue;

    if (!result[name]) {
      result[name] = { section, history, latest: history[history.length - 1] || null, notes };
    }
  }
  return result;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseTierWikitext };
} else {
  main();
}

/* ---------- Page integration ---------- */

function main() {
  const GUIDE = "Guide:Analysis of unique item tiers";
  const GUIDE_URL = "/wiki/" + encodeURIComponent(GUIDE.replace(/ /g, "_"));
  const API = "/w/api.php";
  const CACHE_KEY = "tierCache";
  const RECHECK_MS = 6 * 60 * 60 * 1000; // check for guide edits at most every 6h

  // Storage: Tampermonkey/Violentmonkey (GM_*) or Greasemonkey 4 (GM.*), else localStorage.
  const store = {
    async get(k) {
      if (typeof GM_getValue === "function") return GM_getValue(k, null);
      if (typeof GM !== "undefined" && GM.getValue) return GM.getValue(k, null);
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    },
    async set(k, v) {
      if (typeof GM_setValue === "function") return GM_setValue(k, v);
      if (typeof GM !== "undefined" && GM.setValue) return GM.setValue(k, v);
      localStorage.setItem(k, JSON.stringify(v));
    },
  };

  const uniqueBox = document.querySelector(".infobox-page-container .item-box.-unique");
  if (!uniqueBox) return;

  const heading = document.getElementById("firstHeading");
  const title = (heading ? heading.textContent : decodeURIComponent(location.pathname.split("/wiki/")[1] || ""))
    .replace(/_/g, " ")
    .trim();

  addStyle(`
    .poe-tier-box { margin: 6px auto; padding: 6px 10px; border: 1px solid #af6025;
      background: rgba(0,0,0,.75); color: #ccc; font-size: .9em; text-align: center;
      max-width: 100%; box-sizing: border-box; }
    .poe-tier-head { font-size: 1.15em; color: #af6025; font-weight: bold; }
    .poe-tier-meta { font-weight: normal; color: #999; font-size: .85em; }
    .poe-tier-badge { display: inline-block; min-width: 2.2em; padding: 0 6px; border-radius: 3px;
      color: #000; font-weight: bold; }
    .poe-tier-history { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
    .poe-tier-hist-item { padding: 0 4px; border-radius: 2px; color: #000; font-size: .85em; }
    .poe-tier-notes { margin-top: 4px; font-style: italic; color: #aaa; }
    .poe-tier-link { display: block; margin-top: 4px; font-size: .85em; }
    .poe-tier-tf, .poe-tier-t0 { background: #ff4d4d; }
    .poe-tier-t1 { background: #ff9f40; }
    .poe-tier-t2 { background: #ffd84d; }
    .poe-tier-t3 { background: #8fd16a; }
    .poe-tier-t4 { background: #7fb2e5; }
    .poe-tier-t5 { background: #b0b0b0; }
  `);

  loadTiers()
    .then((data) => render(data[title] || null))
    .catch((e) => console.warn("[poe-unique-tiers]", e));

  function addStyle(css) {
    if (typeof GM_addStyle === "function") return GM_addStyle(css);
    const s = document.createElement("style");
    s.textContent = css;
    document.head.append(s);
  }

  async function api(params) {
    const url = API + "?" + new URLSearchParams({ format: "json", formatversion: "2", ...params });
    const res = await fetch(url);
    if (!res.ok) throw new Error("API " + res.status);
    return res.json();
  }

  async function loadTiers() {
    const cache = await store.get(CACHE_KEY);
    const now = Date.now();
    if (cache && now - cache.checkedAt < RECHECK_MS) return cache.data;

    let revid;
    try {
      const j = await api({ action: "query", prop: "revisions", titles: GUIDE, rvprop: "ids" });
      revid = j.query.pages[0].revisions[0].revid;
    } catch (e) {
      if (cache) return cache.data;
      throw e;
    }

    if (cache && cache.revid === revid) {
      await store.set(CACHE_KEY, { ...cache, checkedAt: now });
      return cache.data;
    }
    const j = await api({ action: "parse", page: GUIDE, prop: "wikitext" });
    const data = parseTierWikitext(j.parse.wikitext);
    await store.set(CACHE_KEY, { revid, checkedAt: now, data });
    return data;
  }

  function tierClass(t) {
    return "poe-tier-t" + String(t).toLowerCase().replace(/[^0-9a-z]/g, "");
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render(entry) {
    const box = el("div", "poe-tier-box");
    const head = el("div", "poe-tier-head");

    if (entry && entry.latest) {
      const { tier, version, source } = entry.latest;
      head.append(
        el("span", "poe-tier-badge " + tierClass(tier), "T" + tier),
        " Unique tier",
        el("span", "poe-tier-meta", ` (${version}${source ? ", " + source : ""})`)
      );
    } else {
      head.textContent = entry ? "No tier data" : "Not listed in tier guide";
    }
    box.append(head);

    if (entry && entry.history.length) {
      const hist = el("div", "poe-tier-history");
      for (const h of entry.history) {
        const s = el(
          "span",
          "poe-tier-hist-item " + tierClass(h.tier),
          `${h.version}: T${h.tier}${h.source ? " " + h.source[0].toLowerCase() : ""}`
        );
        if (h.source) s.title = "Source: " + h.source;
        hist.append(s);
      }
      box.append(hist);
    }
    if (entry && entry.notes) box.append(el("div", "poe-tier-notes", entry.notes));

    const link = el("a", "poe-tier-link", entry && entry.section ? `Tier guide › ${entry.section}` : "Tier guide");
    link.href = GUIDE_URL + (entry && entry.section ? "#" + encodeURIComponent(entry.section.replace(/ /g, "_")) : "");
    box.append(link);

    // Top of the infobox so it's visible without scrolling.
    uniqueBox.insertAdjacentElement("beforebegin", box);
  }
}
