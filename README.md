# PoE Wiki Unique Tiers (userscript)

Adds a tier box to the top of every unique item page on poewiki.net. The data comes from
[Guide:Analysis of unique item tiers](https://www.poewiki.net/wiki/Guide:Analysis_of_unique_item_tiers).

## Install
1. Install a userscript manager: [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Edge, Firefox) or [Violentmonkey](https://violentmonkey.github.io/).
   - Chrome/Edge: Tampermonkey needs **Allow User Scripts** turned on in its extension details page (or Developer mode on older Chrome versions).
2. **[Click here to install the script](https://raw.githubusercontent.com/skillrax/poe-unique-tier-ext/main/poe-unique-tiers.user.js)**. Your userscript manager will open an install page. Updates are picked up automatically.
3. Open any unique page, e.g. https://www.poewiki.net/wiki/Kaom%27s_Primacy

Tier data is community-estimated (see the guide itself) and may not match the game exactly. Corrections belong on the wiki page; this script picks them up automatically.

## How it works
- Runs on `poewiki.net/wiki/*` and only does anything when the page has a unique item box.
- Fetches the guide's **wikitext** through the wiki's own MediaWiki API. The request goes to the same site the page is on, so no cross-site permissions are needed.
- Parses every `| [[Item]] || 3 || 4<sup>d</sup> ...` row using that table's own column headers.
- Caches the parsed map in userscript storage, falling back to `localStorage`. It checks the guide's revision ID at most every 6h and only re-downloads the guide when it has been edited.
- The badge shows the newest column's tier. The full history for each version is shown under it (d = Dust, u = Ultimatum, r = Ritual), with any notes and a link to the right section of the guide.

## Testing the parser
```bash
curl -s "https://www.poewiki.net/w/api.php?action=parse&page=Guide:Analysis_of_unique_item_tiers&prop=wikitext&format=json&formatversion=2" -o tiers.json
node -e "const {parseTierWikitext}=require('./poe-unique-tiers.user.js'); const r=parseTierWikitext(require('./tiers.json').parse.wikitext); console.log(Object.keys(r).length, r[\"Kaom's Primacy\"])"
```
