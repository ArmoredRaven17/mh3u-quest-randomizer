# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A static single-page web app: a quest randomizer for Monster Hunter 3 Ultimate, ported from the
[MHGU Quest Randomizer](../MHGU%20Quest%20Randomizer) (`C:\Coding Repos\MHGU Quest Randomizer`).
The user narrows the quest pool with filters, presses Randomize, and gets a quest, a weapon class
and any custom challenges that rolled.

No build step for the app, no framework, no modules. `docs/app.js` is one IIFE, `docs/card.js`
draws the result card, `docs/styles.css` is hand-written, `docs/data.js` is generated.

GitHub Pages serves `docs/` through the "Deploy Pages" Actions workflow on push to `master`, like
the other MH3U apps.

## Relationship to the GU Quest Randomizer

A port, not a fork that tracks it. The filter panels, level trees, challenges (with Chaos Mode),
export/import, reset, theme and stream pop-out are the GU app's. What changed for 3U:

- **Quest data** comes from the game via `scripts/build_data.py`, not Kiranico's JSON. The quest
  decode is the [MH3U Hunting Log](../mh3u-hunting-log)'s; its build script header is the long
  reference. The two `data.js` files agree field for field on every quest they share.
- **Loadout is the weapon class alone.** 3U has no styles, Hunter Arts or Prowler, so the
  Styles, Hunter Arts, Restrictions (weapon + style blacklist) and Prowler panels are gone.
- **Arena quests roll a loaner set** (`q.ArenaSets`, five per quest, decoded from the quest
  files), as GU rolls `ArenaWeapons`. A pool of only Arena quests needs no weapon checked.
- **Boards** are Village 1-9★, Port 1-8★, Arena 1-8★. ALL lays them end to end as one rank
  (`OFFSET` in app.js), 25 levels. Arena starts switched off, as in GU.
- **Quest filters are all gates**: a quest is in the pool only if every category flag it carries
  is on (Urgent, Large Monsters → Capture / Multi Monster / Repel, Small Monsters, Delivery,
  Harvest Tours), plus Keys Only. GU mixes "include" and "gate" flags; here every quest has at
  least one flag, so gates alone are enough.
- **Monsters tree** groups the 50 large monsters by class. The classes are hand-kept
  (`MONSTER_CLASS` in the build script, which explains why) and the script stops if a large
  monster has none — the GU app had silent drop-outs from exactly that (Old Fatalis).
- **Result card** is built by `card.js` from the shared textures. GU's card is a screenshot of
  MHGU's own quest card, so it doesn't carry over. The stream pop-out draws the same card from
  the same object (`mh3u-randomizer-last-result`) and takes the theme from
  `mh3u-randomizer-theme-vars`, so it has no copy of the colour math.
- **Dropped:** Twitch login/bot sync (its Worker backend reads MHGU data), the Possible
  Combinations modal (replaced by a live pool count under the pickers), the Guild Card
  backgrounds (MHGU's; the flat chroma-key colours stay), and the Gypceros/Khezu joke (neither
  is in 3U, and the palette has no white).
- Storage keys are `mh3u-randomizer-*`. The theme palette and LEGACY_HEX are the MH3U apps'
  shared copy.

## Data

`python scripts/build_data.py "C:\MH3U-Extract"` rewrites `docs/data.js`
(`window.MH3U_RANDOMIZER_DATA = { quests, monsters, weaponIcons, icons }`) and the icon folders.
The script header documents the file layout, including the Arena loaner block. Worth knowing:

- Arena loaner sets: only the weapon is used. Several armor numbers in the sets land on "DUMMY"
  text, so the armor side isn't trusted. Kiranico doesn't list the Arena quests, so the sets
  were not checked against anything outside the game.
- `Key` is the Hunting Log's derivation (63 of Kiranico's 65 Key badges; the differences are
  explained there). Don't "fix" it toward Kiranico.

## Critical: cache busting

Bump the `?v=N` on `styles.css`, `data.js`, `card.js` or `app.js` in `docs/index.html` whenever
that file changes (and on `styles.css` / `card.js` in `docs/stream-view.html`).

## Conventions

All user text goes into the DOM via `textContent`/`.value` — never `innerHTML`. Saved filters,
imported files and the stream pop-out's stored result are read back as untrusted shape
(`applyState`, `cleanChallenges`, card.js's `str`/`list` guards).
