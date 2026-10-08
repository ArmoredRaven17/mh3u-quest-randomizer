r"""Build the randomizer's quest data and icons from a local MH3U extract.

    python scripts/build_data.py [C:\MH3U-Extract]

Reads only the game itself (plus the hand-kept MONSTER_CLASS table below) and writes:

    docs/data.js                          window.MH3U_RANDOMIZER_DATA = { quests, monsters, weaponIcons, icons, cardBackgrounds }
    docs/assets/MonsterIcons/MH3U-*.png   the game's monster and quest-type icons
    docs/assets/WeaponIcons/icon_*.png    the game's weapon-class icons
    docs/assets/GuildCardBG/card_NN.webp  the game's 49 Guild Card backgrounds, plus thumbs/card_NN.webp

The quest decode is the MH3U Hunting Log's (its scripts/build_data.py has the same header);
what is new here is the Arena loaner sets, the monster classes and the Guild Card backgrounds.

Sources, all in the extract:

  romfs/quest/us/q_NNNNN.quest   one file per quest (the cartridge's own; DLC quests are not on it).
      'QTDS', u32 language count (5), then length-prefixed UTF-8 strings, five languages each:
        name x5, u16 quest number, main objective x5, u8 star, u8 map, sub objective x5,
        u16 time limit (minutes), failure condition x5, 6 bytes, client x5, description x5,
      then a binary tail (442 bytes; the Arena quests append their loaner equipment). In the tail:
        +0x00  u8 x2         the quest's small monsters
        +0x0a  11 bytes x5   large monsters present: u16 monster number, ..., u8 count at +3
        +0x147 u32 x4        contract fee, reward, reward lost per faint, HRP
        +0x18f u32, u16      objective header; the u16 joins the records (0 one, 1 AND, 2 OR)
        +0x195 8 bytes x2    objective records: u8 kind, u8 flags, u16, u16 target, u16 count
               kind 0x01 hunt/slay, 0x81 capture, 0x02 deliver (target = item number),
               0x04 repel, 0x14/0x15 slay or repel
        +0x1a9 u64           unlock groups required   } the quest's unlock condition; the
        +0x1b1 u64           unlock groups it counts  } Hunting Log's header explains how the
        +0x1b9 u8            clears required          } game counts them (UNLOCKS there)
  Monster_eng.gmd    monster names by monster number.
  Item00_eng.gmd     item names by item number (delivery targets).
  <class>_eng.gmd    weapon names by weapon number, one file per class (CLASSES below).
  exefs/code.decompressed.bin
      0xb91572  u16 icon cell per monster number, 86 entries. READ 0x51b380: cell -> atlas
                (cell % 9 * 54, cell / 9 * 54) in td_icon_m_ID_eng.tex. Numbers 86-94 continue the
                table onto the atlas's quest-type cells 72-80.
      0xc43370  u16 quest numbers, 0xffff-terminated: the quests' board order.

ARENA LOANERS -- the block the Arena quests append, read off the end of the file:
    u32 0, u32 n, then n sets of 172 bytes. A set opens with u16 equipment type, u16 number:
    type 7 + class (the class numbers in CLASSES, the same offset the item-icon table uses at
    ICON_BY_TYPE + 7), number = index into that class's weapon text, whose entry 0 is "(None)".
    Then six (u16 type, u16 number) armor/talisman pairs, jewels and an item pouch, which the
    randomizer doesn't use: several armor numbers land on "DUMMY" text, so the armor side isn't
    trusted. All twelve Arena quests carry five sets, and the weapons climb with the star
    (Bone Smasher at 1*, Lacerator Blade and Deus Obelisk at 6*). Kiranico doesn't list the Arena
    quests, so there was nothing outside the game to check the sets against.

MONSTER CLASSES -- the game names eight large-monster classes (Monster text 128-135: BrdWyv,
FlyWyv, BrtWyv, PscWyv, Levthn, FngWyv, FngBst, EldDrg), but no table in the executable maps
monster numbers onto them (searched at strides 1-256, as the class index or as the message
number). So MONSTER_CLASS is kept by hand, spelled out in full. The script stops if a large
monster has no class, so a rebuild can't silently leave one out of the Monsters filter.

GUILD CARD BACKGROUNDS -- arc/ID/card/ID_card_NN.arc, NN = 01-49, one per background, each holding
GUI/Texture/guild_card/td_guild_cap_NN_ID.tex (512x256, opaque) and the card_upbg_NN.gui that
draws it at 512x256. Their names are the CardEdit text's background list, which comes in two runs
(21-59, then 81-90, with DUMMY padding between): 39 + 10 = 49, in file order. The art bears the
order out: 01-06 are the six hunting grounds, 07/08 Cha-Cha and Kayamba, 29/30 the Barroth and
Barioth Dossiers, 49 the Sliding doors. Written as lossless WebP, the game's pixels unchanged, with
192x96 thumbnails for the picker. The ID_lb arc's td_guild_c_01-08 are the card's own plates
(paper, wood, stone, ... gold), not backgrounds, and are left out.

Needs: Python 3.10+, Pillow, numpy; pica_tex.py from the extract decodes the icon atlases.
"""
import json, os, re, struct, sys

EXTRACT = sys.argv[1] if len(sys.argv) > 1 else r'C:\MH3U-Extract'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
sys.path.insert(0, EXTRACT)

CODE = open(os.path.join(EXTRACT, 'exefs', 'code.decompressed.bin'), 'rb').read()
BASE = 0x100000
QUEST_DIR = os.path.join(EXTRACT, 'romfs', 'quest', 'us')
FONT = os.path.join(EXTRACT, 'arcx', 'arc', 'ID', 'ID_lb_eng', 'GUI', 'font')
MONSTER_TEX = os.path.join(EXTRACT, 'arcx', 'arc', 'ID', 'ID_com_eng', 'GUI', 'Texture', 'common', 'td_icon_m_ID_eng.tex')
ITEM_TEX = os.path.join(EXTRACT, 'arcx', 'arc', 'ID', 'ID_lb_eng', 'GUI', 'Texture', 'common', 'td_icon_ID.tex')
CARD_DIR = os.path.join(EXTRACT, 'arcx', 'arc', 'ID', 'card')
CARD_BG_NAMES = list(range(21, 60)) + list(range(81, 91))   # CardEdit message ids, in file order

ICON_CELL = 0xb91572      # u16 per monster number (see above)
ICON_CELLS = 95           # 0-85 monsters, 86-94 the quest-type cells
QUEST_ORDER = 0xc43370
ICON_BY_TYPE = 0xb9154e   # READ 0x51d6cc: u8 item-icon index per item type; 22 px cells, 10 per row
LOANER_SET = 172          # bytes per Arena loaner set


def gmd(path):
    """GMD v0x010201 message table -> list of strings (index = message id)."""
    b = open(path, 'rb').read()
    nlab, nstr, labsz, strsz, namelen = struct.unpack_from('<5I', b, 12)
    o = 0x20 + namelen + 1 + 8 * nlab + labsz
    return [s.decode('utf-8', 'replace') for s in b[o:o + strsz].split(b'\0')[:nstr]]


def font(name):
    for dp, _, fns in os.walk(os.path.join(EXTRACT, 'arcx', 'arc', 'ID')):
        if name + '_eng.gmd' in fns and '_eng' in dp:
            return gmd(os.path.join(dp, name + '_eng.gmd'))
    raise FileNotFoundError(name)


MONSTERS = font('Monster')
ITEMS = font('Item00')
MENU = font('Menu')
CARD = font('CardEdit')
QMAP = font('QuestMap')

# map number -> locale (index = the u8 after the main objective)
LOCALES = {1: CARD[21], 2: CARD[22], 3: CARD[23], 4: CARD[25], 5: CARD[26], 13: CARD[24],
           6: re.search(r'(Great Desert)', CARD[116]).group(1)}
for m in (7, 8, 9, 10, 11, 12, 14, 15):
    LOCALES[m] = QMAP[m]

# Quest-type cells 72-80, named for what they show. Which quest the game puts each on is not
# read; delivery quests get one by the item delivered (delivery_icon below).
QUEST_ICONS = {72: 'Chest', 73: 'Cloth', 74: 'Mushroom', 75: 'Bone', 76: 'Fish', 77: 'Ore', 78: 'Egg', 80: 'Scroll'}

# Weapon classes in the GU apps' order: (class, slug, weapon-name message file). Label = Menu 236 + class.
CLASSES = [
    (0, 'great_sword', 'Lsword'), (7, 'long_sword', 'Lsword2'), (1, 'sword_and_shield', 'Sword'),
    (11, 'dual_blades', 'WSword'), (2, 'hammer', 'Hammer'), (12, 'hunting_horn', 'Pipe'),
    (3, 'lance', 'Lance'), (9, 'gunlance', 'Gunlance'), (8, 'switch_axe', 'Axe'),
    (6, 'light_bowgun', 'Lbg'), (4, 'heavy_bowgun', 'Hbg'), (10, 'bow', 'Bow'),
]

# Hand-kept (see MONSTER CLASSES above). Every large monster on the cartridge's quests.
MONSTER_CLASS = {
    'Bird Wyvern': ['Qurupeco', 'Crimson Qurupeco', 'Great Jaggi', 'Great Baggi', 'Great Wroggi'],
    'Flying Wyvern': ['Rathian', 'Pink Rathian', 'Gold Rathian', 'Rathalos', 'Azure Rathalos',
                      'Silver Rathalos', 'Gigginox', 'Baleful Gigginox', 'Barioth', 'Sand Barioth',
                      'Diablos', 'Black Diablos', 'Nargacuga', 'Green Nargacuga', 'Lucent Nargacuga'],
    'Brute Wyvern': ['Barroth', 'Jade Barroth', 'Uragaan', 'Steel Uragaan', 'Deviljho',
                     'Duramboros', 'Rust Duramboros', 'Brachydios'],
    'Piscine Wyvern': ['Plesioth', 'Green Plesioth'],
    'Leviathan': ['Royal Ludroth', 'Purple Ludroth', 'Gobul', 'Lagiacrus', 'Ivory Lagiacrus',
                  'Abyssal Lagiacrus', 'Agnaktor', 'Glacial Agnaktor', 'Nibelsnarf'],
    'Fanged Wyvern': ['Zinogre', 'Stygian Zinogre'],
    'Fanged Beast': ['Arzuros', 'Lagombi', 'Volvidon'],
    'Elder Dragon': ['Ceadeus', 'Goldbeard Ceadeus', 'Jhen Mohran', 'Hallowed Jhen Mohran',
                     'Alatreon', 'Dire Miralis'],
}


def u16(va): return struct.unpack_from('<H', CODE, va - BASE)[0]


def strings(b, o):
    out = []
    for _ in range(5):
        n = struct.unpack_from('<I', b, o)[0]
        out.append(b[o + 4:o + 4 + n].decode('utf-8'))
        o += 4 + n
    return out[0], o


def one_line(s):
    return re.sub(r'\s+', ' ', s).strip()


def loaners(b):
    """The Arena loaner block at the end of the file -> [(equipment type, weapon number)], or []."""
    for n in range(1, 12):
        s = len(b) - 8 - n * LOANER_SET
        if s > 0 and struct.unpack_from('<II', b, s) == (0, n):
            return [struct.unpack_from('<HH', b, s + 8 + k * LOANER_SET) for k in range(n)]
    return []


def read_quest(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'QTDS' and struct.unpack_from('<I', b, 4)[0] == 5, path
    name, o = strings(b, 8)
    qid = struct.unpack_from('<H', b, o)[0]
    main, o = strings(b, o + 2)
    star, mapno = b[o], b[o + 1]
    _, o = strings(b, o + 2)                       # sub objective (empty on every quest)
    _, o = strings(b, o + 2)                       # failure condition (after the u16 time limit)
    _, o = strings(b, o + 6)                       # client
    _, o = strings(b, o)                           # description
    t = b[o:]
    large = []
    for k in range(5):
        r = t[0x0a + 11 * k:0x15 + 11 * k]
        em = r[0] | r[1] << 8
        if em:
            large.append(em)
    objs = []
    for k in range(2):
        kind, flags, _, target, count = struct.unpack_from('<BBHHH', t, 0x195 + 8 * k)
        if kind:
            objs.append((kind, target, count))
    need_mask, count_mask = struct.unpack_from('<QQ', t, 0x1a9)
    return dict(id=qid, name=one_line(name), main=one_line(main), star=star, map=mapno,
                large=large, objs=objs, need_mask=need_mask, count_mask=count_mask, need=t[0x1b9],
                loaners=loaners(b) if qid >= 60000 else [])


def category(qid):
    """Quest number ranges: 0xxxx Village, 1xxxx Port, 6xxxx Arena; x2xxx are the Urgent Quests."""
    if qid >= 60000:
        return 'Arena', False
    return ('Port' if qid >= 10000 else 'Village'), (qid // 1000) % 10 == 2


def monster_name(em, main):
    """Sharq are monster number 32, which the game's monster list calls just "Fish"; the
    objective names them ("Slay 30 Sharq"), so take the name from there."""
    m = re.match(r'Slay \d+ (.+)$', main)
    return m.group(1) if MONSTERS[em] == 'Fish' and m else MONSTERS[em]


def delivery_icon(item):
    n = item.lower()
    if 'mushroom' in n: return 'Mushroom'
    if 'fish' in n: return 'Fish'
    if 'egg' in n: return 'Egg'
    if 'stone' in n or 'ore' in n: return 'Ore'
    if 'ticket' in n: return 'Chest'               # Harvest Tours: survive, or hand in a Paw Pass Ticket
    return 'Bone'                                  # monster parts: guts, horns, bones, oils, antlers


def main():
    order = {}
    va = QUEST_ORDER
    while u16(va) != 0xffff:
        order.setdefault(u16(va), len(order))
        va += 2
    cells = [u16(ICON_CELL + 2 * i) for i in range(ICON_CELLS)]
    by_class = {cls: (MENU[236 + cls], gmd(os.path.join(FONT, msg + '_eng.gmd'))) for cls, _, msg in CLASSES}

    raw = []
    for fn in sorted(os.listdir(QUEST_DIR)):
        if fn.endswith('.quest'):
            q = read_quest(os.path.join(QUEST_DIR, fn))
            if q['id'] >= 1000:                    # below are the dev stubs ("Moga Quest 1", "Tutorial 1")
                raw.append(q)
    large_ems = {em for q in raw for em in q['large']}
    large_names = {MONSTERS[em] for em in large_ems}

    classed = {n for ns in MONSTER_CLASS.values() for n in ns}
    unclassed = sorted(large_names - classed)
    if unclassed:
        sys.exit('No MONSTER_CLASS entry for large monster(s): %s' % ', '.join(unclassed))

    quests, used_icons = [], set()
    for q in sorted(raw, key=lambda q: (order.get(q['id'], 1 << 20), q['id'])):
        typ, urgent = category(q['id'])
        obj_mons = [monster_name(t, q['main']) for k, t, _ in q['objs'] if k != 0x02 and t < 86]
        targets = list(obj_mons)
        if 'all large monsters' in q['main']:
            targets += [MONSTERS[em] for em in q['large']]
        targets = list(dict.fromkeys(targets))
        delivered = [ITEMS[t] for k, t, _ in q['objs'] if k == 0x02]
        if obj_mons:
            icon = MONSTERS[next(t for k, t, _ in q['objs'] if k != 0x02 and t < 86)]
        elif targets:
            icon = targets[0]
        elif delivered:
            icon = delivery_icon(delivered[0]) + '_Quest'
        else:
            icon = 'Scroll_Quest'
        used_icons.add(icon)
        kinds = {k for k, _, _ in q['objs']}
        target_ems = [t for k, t, _ in q['objs'] if k != 0x02 and t < 86]
        entry = {
            'Id': q['id'], 'Type': typ, 'Level': q['star'], 'Name': q['name'], 'Main': q['main'],
            'Locale': LOCALES.get(q['map'], ''), 'Monsters': targets, 'Icon': icon,
            'Urgent': urgent,
            'Capture': 0x81 in kinds,
            'Repel': bool(kinds & {0x04, 0x14, 0x15}),
            'LgMonster': any(em in large_ems for em in target_ems) or 'all large monsters' in q['main'],
            'SmMonsters': any(em not in large_ems for em in target_ems),
            'Delivery': any(d != 'Paw Pass Ticket' for d in delivered),
            'Harvest': 'Paw Pass Ticket' in delivered,
        }
        if q['loaners']:
            sets = []
            for typ_no, num in q['loaners']:
                label, names = by_class[typ_no - 7]
                assert 0 < num < len(names) and names[num] not in ('', 'DUMMY', '(None)'), (q['id'], typ_no, num)
                sets.append({'Weapon': label, 'Name': names[num]})
            entry['ArenaSets'] = sets
        elif typ == 'Arena':
            print('WARNING: no loaner sets on Arena quest', q['id'])
        quests.append(entry)
    # 2906 repeats Urgent 2902 word for word, beside 1814 and 1913, the repeatable copies of
    # Urgents 2801 and 2901. Only the first copy of a quest is the Urgent one.
    seen = set()
    for q in quests:
        sig = (q['Type'], q['Name'], q['Main'])
        if sig in seen:
            q['Urgent'] = False
        seen.add(sig)
    add_keys(quests, {q['id']: q for q in raw})

    icons = write_monster_icons(cells)
    for name in sorted(used_icons - set(icons)):
        print('WARNING: no icon file for', name)
    write_weapon_icons()
    backgrounds = write_card_backgrounds()

    monsters = [{'Name': n, 'Class': c} for c, ns in MONSTER_CLASS.items() for n in ns if n in large_names]
    data = {'quests': quests, 'monsters': monsters,
            'weaponIcons': {MENU[236 + c]: s for c, s, _ in CLASSES},
            'icons': sorted(n.replace(' ', '_') for n in icons),
            'cardBackgrounds': backgrounds}
    with open(os.path.join(DOCS, 'data.js'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Generated by scripts/build_data.py from the game itself. Do not edit by hand.\n')
        fh.write('window.MH3U_RANDOMIZER_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    from collections import Counter
    print(len(quests), 'quests', dict(Counter((q['Type'], q['Urgent']) for q in quests)),
          len(monsters), 'large monsters,', sum(len(q.get('ArenaSets', [])) for q in quests), 'loaner sets,',
          len(icons), 'icons,', len(backgrounds), 'Guild Card backgrounds')


def add_keys(quests, raw):
    """Key = True on quests an Urgent cannot appear without. The Hunting Log's add_unlocks, less
    the Unlock / KeyFor detail the randomizer doesn't show."""
    info = {q['Id']: q for q in quests}
    port = lambda i: i >= 10000

    def pool(u):
        r = raw[u]
        return [i for i in info if i != u and raw[i]['count_mask'] & r['need_mask'] and port(i) == port(u)
                and info[i]['Level'] <= info[u]['Level'] and info[i]['Type'] == info[u]['Type']]

    def mandatory(u):
        p = pool(u)
        return p if raw[u]['need'] and len(p) <= raw[u]['need'] else []

    def walk(u, seen):
        for m in mandatory(u):
            if m in seen:
                continue
            seen.add(m)
            if not info[m]['Urgent']:
                info[m]['Key'] = True
                walk(m, seen)

    for q in quests:
        q['Key'] = False
    for q in quests:
        if q['Urgent']:
            walk(q['Id'], set())
    print(sum(q['Key'] for q in quests), 'key quests')


def square(cell):
    """Trim to the drawn pixels, then centre on a square so every icon scales alike."""
    from PIL import Image
    box = cell.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    cell = cell.crop(box)
    side = max(cell.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(cell, ((side - cell.width) // 2, (side - cell.height) // 2))
    return sq


def write_monster_icons(cells):
    """One file per monster name the icon table covers, plus the quest-type cells, plus the "?"
    (cell 35) as the fallback. Returns the icon names written."""
    from PIL import Image
    import pica_tex
    img, _ = pica_tex.decode(open(MONSTER_TEX, 'rb').read())
    atlas = Image.fromarray(img).convert('RGBA')
    out = os.path.join(DOCS, 'assets', 'MonsterIcons')
    os.makedirs(out, exist_ok=True)
    named = {}
    for em in range(86):
        n = MONSTERS[em]
        if n in ('NO_DATA', 'Rock', 'Giggi Sac') or n in named:
            continue
        named[n] = cells[em]
    for c, n in QUEST_ICONS.items():
        named[n + '_Quest'] = c
    named['Question_Mark'] = 35
    for n, c in named.items():
        r, k = divmod(c, 9)
        cell = atlas.crop((k * 54, r * 54, k * 54 + 54, r * 54 + 54))
        square(cell).save(os.path.join(out, 'MH3U-%s_Icon.png' % n.replace(' ', '_')), optimize=True)
    return list(named)


def write_weapon_icons():
    """The game's weapon-class icons (the grey masks it tints by rarity), at 2x."""
    from PIL import Image
    import pica_tex
    img, _ = pica_tex.decode(open(ITEM_TEX, 'rb').read())
    out = os.path.join(DOCS, 'assets', 'WeaponIcons')
    os.makedirs(out, exist_ok=True)
    for cls, slug, _ in CLASSES:
        idx = CODE[ICON_BY_TYPE - BASE + 7 + cls]
        x, y = idx % 10 * 22, idx // 10 * 22
        Image.fromarray(img[y:y + 22, x:x + 22]).resize((44, 44), Image.NEAREST).save(
            os.path.join(out, 'icon_%s.png' % slug), optimize=True)


def write_card_backgrounds():
    """The Guild Card backgrounds (see GUILD CARD BACKGROUNDS above). Returns [{File, Name}]."""
    from PIL import Image
    import pica_tex
    arcs = sorted(d for d in os.listdir(CARD_DIR) if re.fullmatch(r'ID_card_\d\d', d))
    names = [CARD[i] for i in CARD_BG_NAMES]
    assert len(arcs) == len(names) and not any(n in ('', 'DUMMY', 'HARDUMMY') for n in names), (len(arcs), names)
    out = os.path.join(DOCS, 'assets', 'GuildCardBG')
    os.makedirs(os.path.join(out, 'thumbs'), exist_ok=True)
    backgrounds = []
    for d, name in zip(arcs, names):
        nn = d[-2:]
        tex = os.path.join(CARD_DIR, d, 'GUI', 'Texture', 'guild_card', 'td_guild_cap_%s_ID.tex' % nn)
        img, _ = pica_tex.decode(open(tex, 'rb').read())
        im = Image.fromarray(img).convert('RGB')    # opaque: every alpha is 255
        stem = 'card_' + nn
        im.save(os.path.join(out, stem + '.webp'), lossless=True, method=6)
        im.resize((192, 96), Image.LANCZOS).save(os.path.join(out, 'thumbs', stem + '.webp'), quality=80)
        backgrounds.append({'File': stem, 'Name': name})
    return backgrounds


if __name__ == '__main__':
    main()
