# MH3U Quest Randomizer

A quest randomizer for **Monster Hunter 3 Ultimate**. Narrow the pool, hit Randomize, and get a
quest and a weapon to take on it, plus any challenges of your own that rolled. A port of the
[MHGU Quest Randomizer](https://github.com/ArmoredRaven17/MHGU-Quest-Randomizer), with its quest
data read from the game itself.

```
Quest: Port 7★ / Infernal Overlord |
Monster: Stygian Zinogre |
Locale: Tundra |
Weapon: Switch Axe |
Challenges: No Items
```

That's what **Copy to Clipboard** produces.

## Features

- **The whole cartridge** — all 342 quests (122 Village, 208 Port, 12 Arena), by board and star.
- **Filters** — by category (Urgent, Large Monsters with Capture / Multi Monster / Repel, Small
  Monsters, Delivery, Harvest Tours), Keys Only, any individual star, any large monster
  (grouped by class) and any weapon class. A live count shows how many quests are left.
- **Arena loaner sets** — an Arena roll hands you one of the quest's five loaner sets, read
  from the quest file, instead of a weapon of your own.
- **Challenges** — your own conditions, each with a chance %, rolled alongside the quest, with
  the GU app's Chaos Mode.
- **Stream view** — pops the card out on a chroma-key green background, updating with every
  roll and theme change.
- **Themes, export/import, autosave** — the MH3U monster-icon themes shared with the other MH3U
  apps; filters and challenges are saved in the browser and can be exported to a file.

Downloadable Event and Challenge Quests aren't on the cartridge, so they aren't in the pool.

## Where the data comes from

[scripts/build_data.py](scripts/build_data.py) reads a local extract of a personally owned copy of
the game: the quest files (`romfs/quest/us/q_NNNNN.quest`), the English message files and two
tables in the executable. The quest decode is shared with the
[MH3U Hunting Log](https://github.com/ArmoredRaven17/mh3u-hunting-log); this repo adds the Arena
loaner sets. The monster classes in the Monsters filter are the one hand-kept table: the game
names the classes but has no table assigning them. The script header documents every field.

## Running it

No build step for the app. Serve `docs/`:

```
python -m http.server 5585 --directory docs
```

## Regenerating data

Needs the extract laid out like `C:\MH3U-Extract` (romfs unpacked, arcs extracted, `code.bin`
decompressed), Python 3.10+, Pillow and numpy:

```
python scripts/build_data.py "C:\MH3U-Extract"
```

This rewrites `docs/data.js`, `docs/assets/MonsterIcons/` and `docs/assets/WeaponIcons/`.

## Cache busting

GitHub Pages caches assets by full URL. When you change `styles.css`, `data.js`, `card.js` or
`app.js`, bump the `?v=N` query string on its tag in `docs/index.html` (and `docs/stream-view.html`).

## AI assistance

Most of this project — the port, the loaner-set decode and this README — was written with
[Claude Code](https://claude.com/claude-code), Anthropic's AI coding tool, working from the author's
direction and reviewed before landing.

## Licensing

Code is MIT (see [LICENSE](LICENSE)). Game data and icons are Capcom's — see [NOTICE.md](NOTICE.md).
Monster Hunter 3 Ultimate is © Capcom Co., Ltd.; this is an unofficial fan project.
