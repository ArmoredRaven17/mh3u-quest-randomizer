"use strict";
/* MH3U Quest Randomizer — all app logic (IIFE, no modules). Ported from the MHGU Quest Randomizer;
   the quest data comes from MH3U's own quest files via scripts/build_data.py, and the result card
   is drawn by card.js, which the stream pop-out shares. */
(function () {
  const DATA = window.MH3U_RANDOMIZER_DATA || { quests: [], monsters: [], weaponIcons: {}, icons: [] };
  const CARD = window.MH3U_CARD;
  const $ = (id) => document.getElementById(id);
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  // Every user-supplied string goes in through textContent/.value, never innerHTML.
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ── Static config ────────────────────────────────────────────────────────
  // The game's twelve weapon classes, named and ordered as the build script read them. 3U has
  // no styles, Hunter Arts or Prowler, so a hunt's loadout is the weapon class alone.
  const WEAPONS = Object.keys(DATA.weaponIcons || {});

  // Boards and their star ranges are the game's own: Village 1-9★, Port 1-8★, and the Arena,
  // whose twelve Grudge Matches are filed under stars 1-8 too. ALL mode ranges over one
  // unified rank: each board's stars laid end to end, Village first.
  const BOARDS = [["Village", 9], ["Port", 8], ["Arena", 8]];
  const OFFSET = {};
  const LEVELS = { ALL: [] };
  let RANK_COUNT = 0;
  for (const [type, n] of BOARDS) {
    OFFSET[type] = RANK_COUNT;
    LEVELS[type] = [];
    for (let s = 1; s <= n; s++) {
      LEVELS[type].push([s + "★", s]);
      LEVELS.ALL.push([type + " " + s + "★", RANK_COUNT + s - 1]);
    }
    RANK_COUNT += n;
  }
  const allRank = (q) => q.Type in OFFSET ? OFFSET[q.Type] + q.Level - 1 : -1;
  const typeValToAllRank = (type, val) => type === "ALL" ? val : type in OFFSET ? OFFSET[type] + val - 1 : -1;
  const questRank = (q) => q.Type ? q.Type + " " + q.Level + "★" : "";

  // Large monsters, grouped by class for the Monsters filter. The class table is hand-kept in
  // the build script; the game names the classes but has no table assigning them.
  const LARGE = new Set((DATA.monsters || []).map(m => m.Name));
  const largeTargets = (q) => (q.Monsters || []).filter(m => LARGE.has(m));
  // "Slay all large monsters" with two listed, or a count of 2+ of one monster.
  const isMultiMonster = (q) => largeTargets(q).length > 1 || (q.LgMonster && /\b[2-9]\b/.test(q.Main || ""));

  const DEFAULT_CHALLENGES = [
    { text: "No Armor",         chance: 10, checked: false },
    { text: "No Items",         chance: 10, checked: false },
    { text: "No Active Skills", chance: 10, checked: false },
    { text: "Use Joke Weapon",  chance: 10, checked: false },
  ];
  let challenges = DEFAULT_CHALLENGES.map(c => Object.assign({}, c));
  let chaosMode = false;

  // Theme palette: identical across the MH3U apps (the Hunting Log's copy). Same 31 hexes as
  // the MHGU family — each one clears the white-text / white-checkbox contrast line, so don't
  // add one without checking it (the MHGU Quest Randomizer's app.js carries the reasoning).
  const COLORS = [
    ["Volvidon", "#570B0B"], ["Rathalos", "#b51717"],
    ["R. Duramboros", "#783E0F", "Rust Duramboros"], ["Agnaktor", "#C7620E"],
    ["Uragaan", "#74631D"], ["G. Rathian", "#9C8328", "Gold Rathian"],
    ["G. Nargacuga", "#436713", "Green Nargacuga"], ["G. Plesioth", "#67922E", "Green Plesioth"],
    ["Deviljho", "#0B570F"], ["Rathian", "#39993E"],
    ["S. Uragaan", "#14503d", "Steel Uragaan"], ["Zinogre", "#279773"],
    ["A. Lagiacrus", "#0C5D68", "Abyssal Lagiacrus"], ["G. Agnaktor", "#118898", "Glacial Agnaktor"],
    ["Nargacuga", "#005984"], ["Plesioth", "#0080c1"],
    ["Brachydios", "#0B2757"], ["Lagiacrus", "#0b3f97"],
    ["Great Wroggi", "#1F0B57"], ["Great Jaggi", "#4e2fa2"],
    ["H. Jhen Mohran", "#62008f", "Hallowed Jhen Mohran"], ["P. Ludroth", "#8e50ab", "Purple Ludroth"],
    ["P. Rathian", "#D4358C", "Pink Rathian"], ["Qurupeco", "#C8679D"],
    ["Duramboros", "#5a411f"], ["Diablos", "#997c54"],
    ["Barroth", "#835A32"], ["Bullfango", "#B17A47"],
    ["S. Rathalos", "#505358", "Silver Rathalos"], ["Barioth", "#7C879B"],
    ["Forbidden", "#1E2025", "Question Mark"],
  ];
  // Retired hexes remap on read (a saved theme is a bare hex). Kept identical to the other apps.
  const LEGACY_HEX = {
    "#C8A319": "#74631D", "#57470B": "#74631D", "#5E4D0C": "#74631D",
    "#574916": "#74631D", "#68581A": "#74631D",
    "#F1D364": "#9C8328", "#B59417": "#9C8328", "#C39F19": "#9C8328",
    "#BEA031": "#9C8328",
    "#C65900": "#783E0F", "#FC933E": "#C7620E",
    "#68360D": "#783E0F", "#B5590D": "#C7620E",
    "#3A9B3F": "#39993E", "#2DAE85": "#279773",
    "#D84696": "#D4358C", "#CE79A8": "#C8679D",
    "#B57C45": "#835A32", "#CFAA87": "#B17A47",
    "#AEB5C1": "#7C879B",
  };
  const migrateHex = (h) => (h && LEGACY_HEX[h.toUpperCase()]) || h;
  const COLORS_HEX = Object.fromEntries(COLORS.map(([name, hex]) => [hex.toUpperCase(), name]));
  const COLORS_ICON = Object.fromEntries(COLORS.filter(c => c[2]).map(([name, , icon]) => [name, icon]));

  // ── Icon path helpers ────────────────────────────────────────────────────
  // The game's own icons, cut by the build script, which also lists what it wrote — so an
  // unknown name falls back to the "?" deliberately rather than via a 404.
  const FALLBACK_ICON = "assets/MonsterIcons/MH3U-Question_Mark_Icon.png";
  const HAS_ICON = new Set(DATA.icons || []);
  const monsterIcon = (name) => {
    const stem = (name || "").replace(/ /g, "_");
    return HAS_ICON.has(stem) ? "assets/MonsterIcons/MH3U-" + stem + "_Icon.png" : FALLBACK_ICON;
  };
  const weaponIcon = (w) => (DATA.weaponIcons || {})[w] ? "assets/WeaponIcons/icon_" + DATA.weaponIcons[w] + ".png" : "";

  function questPills(q) {
    const p = [];
    if (q.Urgent) p.push(["Urgent", "pill-urgent"]);
    if (q.Key) p.push(["Key", "pill-key"]);
    if (q.LgMonster && !q.Capture && !q.Repel) p.push(["Hunt", "pill-hunt"]);
    if (q.Capture) p.push(["Capture", "pill-capture"]);
    if (q.Repel) p.push(["Repel", "pill-repel"]);
    if (q.SmMonsters) p.push(["Small Monsters", "pill-sm"]);
    if (q.Delivery) p.push(["Delivery", "pill-gathering"]);
    if (q.Harvest) p.push(["Harvest Tour", "pill-egg"]);
    if (q.Type === "Arena") p.push(["Arena", "pill-arena"]);
    return p;
  }

  // ── Generic checkbox tree (quest levels, monsters) ───────────────────────
  // A group head (twist, checkbox, name) over leaf checkboxes. Clicking the name or twist
  // opens/closes; the checkbox selects. Returns the leaf inputs.
  function treeGroup(tree, label, groupId, leaves, onChange) {
    const wrap = el("div", "agrp");
    const head = el("div", "ahead");
    const tw = el("span", "twist", "▸");
    const grpInput = el("input");
    grpInput.type = "checkbox";
    if (groupId) grpInput.id = groupId;
    const nameEl = el("span", "grp-name", label);
    const toggleOpen = () => { wrap.classList.toggle("open"); tw.textContent = wrap.classList.contains("open") ? "▾" : "▸"; };
    tw.addEventListener("click", toggleOpen);
    nameEl.addEventListener("click", toggleOpen);
    head.append(tw, grpInput, nameEl);
    const kids = el("div", "akids");
    const inputs = [];
    const sync = () => {
      const n = inputs.filter(i => i.checked).length;
      grpInput.checked = n === inputs.length;
      grpInput.indeterminate = n > 0 && n < inputs.length;
    };
    for (const lf of leaves) {
      const lbl = el("label", "chk");
      const input = el("input");
      input.type = "checkbox";
      input.checked = lf.on;
      if (lf.id) input.id = lf.id;
      if (lf.name) input.dataset.name = lf.name;
      lbl.appendChild(input);
      if (lf.icon) {
        const img = el("img", "wicon");
        img.src = lf.icon;
        img.alt = "";
        lbl.appendChild(img);
      }
      lbl.appendChild(document.createTextNode(lf.label));
      input.addEventListener("change", () => { sync(); onChange(); });
      inputs.push(input);
      kids.appendChild(lbl);
    }
    grpInput.addEventListener("change", () => {
      inputs.forEach(i => i.checked = grpInput.checked);
      grpInput.indeterminate = false;
      onChange();
    });
    sync();
    wrap.append(head, kids);
    tree.appendChild(wrap);
    return inputs;
  }
  // Recompute every group checkbox in a tree from its leaves (after a load or reset).
  function refreshGroups(treeId) {
    document.querySelectorAll("#" + treeId + " .agrp").forEach(g => {
      const leaves = [...g.querySelectorAll(".akids input")];
      const n = leaves.filter(i => i.checked).length;
      const gc = g.querySelector(":scope>.ahead>input");
      if (gc) { gc.checked = n === leaves.length; gc.indeterminate = n > 0 && n < leaves.length; }
    });
  }
  function setTreeOpen(treeId, open) {
    document.querySelectorAll("#" + treeId + " .agrp").forEach(g => {
      g.classList.toggle("open", open);
      const tw = g.querySelector(":scope>.ahead>.twist");
      if (tw) tw.textContent = open ? "▾" : "▸";
    });
  }

  // ── DOM build: quest levels / monsters / weapons ─────────────────────────
  // Arena is off by default, as in the GU randomizer: its loaner sets replace your own gear.
  const LEVEL_DEFAULT_ON = (rank) => rank < OFFSET.Arena;
  for (const [type] of BOARDS) {
    treeGroup($("allTypeTree"), type, "f_all_grp_" + type.toLowerCase(),
      LEVELS[type].map(([lbl, val]) => {
        const rank = typeValToAllRank(type, val);
        return { label: type + " " + lbl, id: "f_all_lv_" + rank, on: LEVEL_DEFAULT_ON(rank) };
      }),
      () => { syncTypeOptions(); fillLevels(); });
  }

  const monsterChecks = [];   // {input, name}
  (function buildMonsterTree() {
    const byClass = new Map();
    for (const m of DATA.monsters || []) {
      if (!byClass.has(m.Class)) byClass.set(m.Class, []);
      byClass.get(m.Class).push(m.Name);
    }
    for (const [cls, names] of byClass) {
      const inputs = treeGroup($("monsterTree"), cls, null,
        names.map(n => ({ label: n, name: n, on: true, icon: monsterIcon(n) })), refreshPool);
      inputs.forEach((input, i) => monsterChecks.push({ input, name: names[i] }));
    }
  })();
  const includedMonsters = () => new Set(monsterChecks.filter(m => m.input.checked).map(m => m.name));

  WEAPONS.forEach((w, i) => {
    const lbl = el("label", "chk");
    const input = el("input");
    input.type = "checkbox";
    input.id = "w_" + i;
    input.dataset.name = w;
    input.checked = true;
    const img = el("img", "wicon");
    img.src = weaponIcon(w);
    img.alt = "";
    lbl.append(input, img, document.createTextNode(w));
    $("weaponList").appendChild(lbl);
  });
  const checkedWeapons = () => [...document.querySelectorAll("#weaponList input")].filter(i => i.checked).map(i => i.dataset.name);

  // ── Challenges ───────────────────────────────────────────────────────────
  // Custom conditions ({ text, chance, checked }) rolled alongside the quest, as in the GU app.
  function renderChallenges() {
    const list = $("chList");
    list.replaceChildren();
    if (!challenges.length) {
      list.appendChild(el("p", "hint", "No conditions added yet."));
      return;
    }
    challenges.forEach((c, i) => {
      const row = el("div", "bl-tag");
      const chk = el("label", "chk");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = c.checked !== false;
      cb.disabled = chaosMode;
      chk.appendChild(cb);
      const txt = el("input", "ch-edit-text");
      txt.type = "text";
      txt.value = c.text;
      txt.maxLength = 21;
      if (c.checked === false) txt.style.opacity = ".45";
      const num = el("input", "ch-edit-chance");
      num.type = "number";
      num.value = c.chance;
      num.min = 1;
      num.max = 100;
      const btn = el("button", null, "×");
      btn.title = "Remove";
      btn.setAttribute("aria-label", "Remove");

      cb.addEventListener("change", function () {
        challenges[i].checked = this.checked;
        txt.style.opacity = this.checked ? "" : ".45";
        saveFilters();
      });
      txt.addEventListener("change", function () {
        const v = this.value.trim();
        if (v) { challenges[i].text = v; saveFilters(); }
        else this.value = challenges[i].text;
      });
      num.addEventListener("change", function () {
        const v = clampChance(this.value, 1);
        this.value = v;
        challenges[i].chance = v;
        saveFilters();
      });
      btn.addEventListener("click", () => { challenges.splice(i, 1); renderChallenges(); saveFilters(); });
      row.append(chk, txt, num, el("span", "ch-pct", "%"), btn);
      list.appendChild(row);
    });
  }
  const clampChance = (v, dflt) => Math.min(100, Math.max(1, parseInt(v, 10) || dflt));
  // Challenges come back from storage and from imported files, so their shape is checked.
  const cleanChallenges = (arr) => Array.isArray(arr)
    ? arr.filter(c => c && typeof c.text === "string" && c.text.trim())
         .map(c => ({ text: c.text.trim().slice(0, 21), chance: clampChance(c.chance, 10), checked: c.checked === true }))
    : null;
  $("chAdd").addEventListener("click", () => {
    const text = $("chText").value.trim();
    if (!text) return;
    challenges.push({ checked: false, text, chance: clampChance($("chChance").value, 10) });
    renderChallenges();
    saveFilters();
    $("chText").value = "";
  });
  $("chText").addEventListener("keydown", e => { if (e.key === "Enter") $("chAdd").click(); });
  $("chChaosMode").addEventListener("change", function () {
    chaosMode = this.checked;
    renderChallenges();
    saveFilters();
  });
  // Rolls each enabled challenge against its own chance, then keeps a random subset capped at
  // the "roll up to N" count. In Chaos Mode a hidden -20..+20% base roll, blended into each
  // condition's chance, decides whether it's on for this roll instead of its checkbox; it still
  // has to pass its own chance roll on top.
  function rollChallenges() {
    if (!challenges.length) return [];
    const count = Math.min(8, Math.max(1, parseInt($("challengeCount").value, 10) || 1));
    let eligible;
    if (chaosMode) {
      const baseChaos = Math.random() * 40 - 20;
      const on = challenges.map(c => Math.random() * 100 < Math.max(0, Math.min(100, baseChaos + c.chance)));
      syncChaosCheckboxes(on);
      eligible = challenges.filter((c, i) => on[i] && Math.random() * 100 < c.chance);
    } else {
      eligible = challenges.filter(c => c.checked === true && Math.random() * 100 < c.chance);
    }
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    return eligible.slice(0, count).map(c => c.text);
  }
  // Chaos Mode's visual preview of this roll's decision. Never writes challenges[i].checked or
  // saves — the user's own on/off choices stay untouched underneath.
  function syncChaosCheckboxes(on) {
    $("chList").querySelectorAll(".bl-tag").forEach((row, i) => {
      if (i >= on.length) return;
      row.querySelector(".chk input").checked = on[i];
      row.querySelector(".ch-edit-text").style.opacity = on[i] ? "" : ".45";
    });
  }

  // ── Level dropdowns ──────────────────────────────────────────────────────
  const levelOn = (rank) => { const cb = $("f_all_lv_" + rank); return !!cb && cb.checked; };
  function fillLevels() {
    const type = $("questType").value;
    const opts = (LEVELS[type] || []).filter(([, val]) => levelOn(typeValToAllRank(type, val)));
    const from = $("fromLevel"), to = $("toLevel");
    from.replaceChildren();
    to.replaceChildren();
    opts.forEach(([lbl, val]) => { from.add(new Option(lbl, val)); to.add(new Option(lbl, val)); });
    from.selectedIndex = 0;
    to.selectedIndex = Math.max(0, opts.length - 1);
    refreshPool();
  }
  // Hide quest types with no level left on; drop to ALL if the selected one just went.
  function syncTypeOptions() {
    const qt = $("questType");
    for (const opt of qt.options) {
      if (opt.value === "ALL") continue;
      opt.hidden = !(LEVELS[opt.value] || []).some(([, val]) => levelOn(typeValToAllRank(opt.value, val)));
    }
    if (qt.selectedOptions[0] && qt.selectedOptions[0].hidden) qt.value = "ALL";
  }
  // Keep From ≤ To (compared by list position; both lists hold the same options).
  function syncLevels(changed) {
    const from = $("fromLevel"), to = $("toLevel");
    if (from.selectedIndex >= 0 && to.selectedIndex >= 0) {
      if (changed === "from" && from.selectedIndex > to.selectedIndex) to.selectedIndex = from.selectedIndex;
      if (changed === "to" && to.selectedIndex < from.selectedIndex) from.selectedIndex = to.selectedIndex;
    }
    refreshPool();
  }

  // ── Quest pool ───────────────────────────────────────────────────────────
  // Every quest carries at least one category flag, and each flag is a gate: a quest is in the
  // pool only if every category it belongs to is switched on. Capture, Multi Monster and Repel
  // sit under Large Monsters, so turning that off takes them with it.
  function buildPool() {
    const type = $("questType").value;
    if ($("toLevel").value === "") return [];
    const toLv = parseInt($("toLevel").value, 10);
    const fromLv = $("fromLevel").value !== "" ? parseInt($("fromLevel").value, 10) : toLv;
    const on = (id) => $(id).checked;
    const inc = includedMonsters();
    const anyFiltered = inc.size < monsterChecks.length;
    return DATA.quests.filter(q => {
      const rank = allRank(q);
      if (rank < 0 || !levelOn(rank)) return false;
      if (type === "ALL") {
        if (rank < fromLv || rank > toLv) return false;
      } else if (q.Type !== type || q.Level < fromLv || q.Level > toLv) return false;

      if (on("f_keysOnly") && !q.Key) return false;
      if (q.Urgent && !on("f_urgent")) return false;
      if (q.LgMonster && !on("f_large")) return false;
      if (q.Capture && !on("f_capture")) return false;
      if (q.Repel && !on("f_repel")) return false;
      if (isMultiMonster(q) && !on("f_multi")) return false;
      if (q.SmMonsters && !on("f_small")) return false;
      if (q.Delivery && !on("f_delivery")) return false;
      if (q.Harvest && !on("f_harvest")) return false;

      if (anyFiltered) {
        const lg = largeTargets(q);
        if (lg.length && !lg.every(m => inc.has(m))) return false;
      }
      return true;
    });
  }
  // A pool that holds only Arena quests needs no weapons checked: the loaner set is the loadout.
  function refreshPool() {
    const pool = buildPool();
    const needWeapon = pool.some(q => q.Type !== "Arena");
    const noWeapon = needWeapon && !checkedWeapons().length;
    $("rollBtn").disabled = !pool.length || noWeapon;
    $("poolCount").textContent = !pool.length ? "No quests match these filters."
      : noWeapon ? "Check at least one weapon."
      : pool.length + (pool.length === 1 ? " quest" : " quests") + " in the pool";
  }

  // ── Randomize ────────────────────────────────────────────────────────────
  let lastResult = null;
  const RESULT_KEY = "mh3u-randomizer-last-result";
  function randomize() {
    const pool = buildPool();
    if (!pool.length) return;
    const q = pick(pool);
    const r = {
      rank: questRank(q), name: q.Name, pills: questPills(q), icon: monsterIcon(q.Icon),
      main: q.Main, locale: q.Locale, monsters: (q.Monsters || []).join(", "),
      weapon: "", weaponIcon: "", loaner: "", weaponName: "", challenges: rollChallenges(),
    };
    // Arena: you fight in one of the quest's loaner sets, so roll the set rather than a class.
    if (q.ArenaSets && q.ArenaSets.length) {
      const k = rand(q.ArenaSets.length);
      const s = q.ArenaSets[k];
      r.loaner = "Loaner Set " + (k + 1) + " of " + q.ArenaSets.length;
      r.weapon = s.Weapon;
      r.weaponName = s.Name;
    } else {
      r.weapon = pick(checkedWeapons());
    }
    r.weaponIcon = weaponIcon(r.weapon);
    lastResult = r;
    CARD.render($("card"), r);
    $("copyResultBtn").disabled = false;
    try { localStorage.setItem(RESULT_KEY, JSON.stringify(r)); } catch (e) {}
  }

  // "Quest: Port 7★ / Infernal Overlord |" — one line per field, as the GU randomizer copies.
  $("copyResultBtn").addEventListener("click", () => {
    const r = lastResult;
    if (!r) return;
    const lines = ["Quest: " + r.rank + " / " + r.name];
    if (r.monsters) lines.push("Monster: " + r.monsters);
    lines.push("Locale: " + r.locale);
    lines.push("Weapon: " + r.weapon + (r.weaponName ? " (" + r.loaner + ": " + r.weaponName + ")" : ""));
    if (r.challenges.length) lines.push("Challenges: " + r.challenges.join(", "));
    const btn = $("copyResultBtn");
    navigator.clipboard.writeText(lines.join(" |\n")).then(() => {
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy to Clipboard"; }, 1500);
    });
  });

  // ── Theme ────────────────────────────────────────────────────────────────
  const hexRgb = (h) => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const rgbToHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
            : max === g ? ((b - r) / d + 2) / 6
            :             ((r - g) / d + 4) / 6;
    return [h, s, l];
  };
  const hslToRgb = ([h, s, l]) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = l - c / 2;
    const hi = Math.floor(h * 6) % 6;
    const [r, g, b] = hi === 0 ? [c, x, 0] : hi === 1 ? [x, c, 0] : hi === 2 ? [0, c, x] : hi === 3 ? [0, x, c] : hi === 4 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map(v => clamp(v * 255));
  };
  // darken/lighten only move lightness, so every derived shade keeps the theme's hue and
  // saturation. The factors are the Hunting Log's, so a theme looks like itself in every app.
  const darken = (rgb, f) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l * f)]); };
  const lighten = (rgb, b) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l + (1 - l) * b)]); };
  const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  const THEME_KEY = "mh3u-randomizer-theme";
  // The derived variables are stored as well, for the stream pop-out: it styles its card from
  // them without carrying a copy of this colour math.
  const THEME_VARS_KEY = "mh3u-randomizer-theme-vars";
  function applyTheme(hex) {
    const c = hexRgb(hex);
    const vars = {
      "--bg": css(darken(c, .70)), "--bg1": css(darken(c, .80)),
      "--content-bg": css(darken(c, .55)), "--panel-bg": css(darken(c, .40)),
      "--input-bg": css(darken(c, .35)), "--bg2": css(darken(c, .95)),
      "--hover": css(darken(c, .30)), "--accent": css(darken(c, .7)),
      "--accent-hover": css(lighten(c, .4)),
    };
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
    try {
      localStorage.setItem(THEME_KEY, hex);
      localStorage.setItem(THEME_VARS_KEY, JSON.stringify(vars));
    } catch (e) {}
    document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("sel", s.dataset.hex === hex));
    const name = COLORS_HEX[hex.toUpperCase()];
    $("titleIcon").src = name ? monsterIcon(COLORS_ICON[name] || name) : FALLBACK_ICON;
  }
  for (const [name, hex] of COLORS) {
    const d = el("div", "swatch");
    d.dataset.hex = hex;
    d.style.background = hex;
    d.title = name;
    const img = el("img", "swatch-icon");
    img.src = monsterIcon(COLORS_ICON[name] || name);
    img.alt = "";
    d.append(img, el("span", null, name));
    d.addEventListener("click", () => applyTheme(hex));
    $("swatches").appendChild(d);
  }
  const DEFAULT_THEME = "#1E2025";
  let savedTheme = DEFAULT_THEME;
  try { savedTheme = migrateHex(localStorage.getItem(THEME_KEY)) || savedTheme; } catch (e) {}
  if (!COLORS_HEX[String(savedTheme).toUpperCase()]) savedTheme = DEFAULT_THEME;
  applyTheme(savedTheme);

  // Flat backdrops behind the card for chroma-keying the app itself on stream (the GU app's
  // Digital Blue / Digital Green). The GU Guild Card photos are MHGU's, so they don't come along.
  const BG_KEY = "mh3u-randomizer-bg";
  const SOLID_BG = [["None", ""], ["Digital Blue", "#0000FF"], ["Digital Green", "#00FF00"]];
  function applyBg(value) {
    if (!SOLID_BG.some(([, v]) => v === value)) value = "";
    $("content").style.background = value;
    try { localStorage.setItem(BG_KEY, value); } catch (e) {}
    document.querySelectorAll(".bg-thumb").forEach(t => t.classList.toggle("sel", t.dataset.value === value));
  }
  for (const [name, value] of SOLID_BG) {
    const d = el("div", "bg-thumb" + (value ? "" : " none-thumb"), value ? null : name);
    d.dataset.value = value;
    d.title = name;
    if (value) d.style.background = value;
    d.addEventListener("click", () => applyBg(value));
    $("bgGrid").appendChild(d);
  }
  let savedBg = "";
  try { savedBg = localStorage.getItem(BG_KEY) || ""; } catch (e) {}
  applyBg(savedBg);

  // ── Filter persistence ───────────────────────────────────────────────────
  // Unchecked names are stored rather than checked ones, so anything new in the data
  // defaults to included.
  const FILTER_KEY = "mh3u-randomizer-filters";
  const TOGGLES = { keysOnly: "f_keysOnly", urgent: "f_urgent", large: "f_large", capture: "f_capture",
    repel: "f_repel", multi: "f_multi", small: "f_small", delivery: "f_delivery", harvest: "f_harvest" };
  const TOGGLE_DEFAULT = { keysOnly: false };   // everything else defaults on
  function filterState() {
    const t = {};
    for (const [k, id] of Object.entries(TOGGLES)) t[k] = $(id).checked;
    t.chaosMode = chaosMode;
    t.allLevels = Array.from({ length: RANK_COUNT }, (_, i) => i).filter(i => !levelOn(i));
    return {
      weapons: [...document.querySelectorAll("#weaponList input")].filter(i => !i.checked).map(i => i.dataset.name),
      monsters: monsterChecks.filter(m => !m.input.checked).map(m => m.name),
      challenges: challenges.slice(),
      challengeCount: Math.min(8, Math.max(1, parseInt($("challengeCount").value, 10) || 1)),
      t,
    };
  }
  function saveFilters() {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filterState())); } catch (e) {}
  }
  // Applies a saved or imported state over the defaults. Read as untrusted shape: an imported
  // file can hold anything.
  function applyFilters(d) {
    resetControls();
    if (d && typeof d === "object") applyState(d);
    syncControls();
  }
  function applyState(d) {
    const off = (arr) => new Set(Array.isArray(arr) ? arr : []);
    const w = off(d.weapons);
    document.querySelectorAll("#weaponList input").forEach(i => { i.checked = !w.has(i.dataset.name); });
    const m = off(d.monsters);
    monsterChecks.forEach(x => { x.input.checked = !m.has(x.name); });
    const t = d.t && typeof d.t === "object" ? d.t : {};
    for (const [k, id] of Object.entries(TOGGLES)) {
      if (typeof t[k] === "boolean") $(id).checked = t[k];
    }
    chaosMode = t.chaosMode === true;
    if (Array.isArray(t.allLevels)) {
      const lv = new Set(t.allLevels);
      for (let i = 0; i < RANK_COUNT; i++) $("f_all_lv_" + i).checked = !lv.has(i);
    }
    const ch = cleanChallenges(d.challenges);
    if (ch) challenges = ch;
    if (d.challengeCount) $("challengeCount").value = Math.min(8, Math.max(1, parseInt(d.challengeCount, 10) || 1));
  }
  // Defaults for everything Reset Filters covers. Challenges are the user's own writing and
  // survive a reset, as in the GU app; only Chaos Mode switches off.
  function resetControls() {
    for (const [k, id] of Object.entries(TOGGLES)) $(id).checked = TOGGLE_DEFAULT[k] !== false;
    for (let i = 0; i < RANK_COUNT; i++) $("f_all_lv_" + i).checked = LEVEL_DEFAULT_ON(i);
    document.querySelectorAll("#weaponList input").forEach(i => i.checked = true);
    monsterChecks.forEach(m => m.input.checked = true);
    chaosMode = false;
    $("challengeCount").value = 1;
  }
  function syncControls() {
    $("chChaosMode").checked = chaosMode;
    refreshGroups("allTypeTree");
    refreshGroups("monsterTree");
    syncSubToggles();
    renderChallenges();
    syncTypeOptions();
    fillLevels();
  }
  // Capture / Multi Monster / Repel only mean something while Large Monsters is on.
  function syncSubToggles() {
    const on = $("f_large").checked;
    ["f_capture", "f_multi", "f_repel"].forEach(id => $(id).disabled = !on);
  }

  // ── Wiring ───────────────────────────────────────────────────────────────
  // Sidebar panels are an accordion: opening one closes the rest.
  document.querySelectorAll(".panel-head").forEach(h => h.addEventListener("click", () => {
    const p = h.parentElement;
    const opening = p.dataset.open !== "true";
    document.querySelectorAll(".panel").forEach(x => x.dataset.open = "false");
    p.dataset.open = opening ? "true" : "false";
  }));
  // Every sidebar change saves and re-counts the pool (delegated, so trees are covered).
  document.querySelector(".sidebar").addEventListener("change", () => { refreshPool(); saveFilters(); });
  $("f_large").addEventListener("change", syncSubToggles);
  $("questType").addEventListener("change", fillLevels);
  $("fromLevel").addEventListener("change", () => syncLevels("from"));
  $("toLevel").addEventListener("change", () => syncLevels("to"));
  $("rollBtn").addEventListener("click", randomize);
  $("allExpand").addEventListener("click", () => setTreeOpen("allTypeTree", true));
  $("allCollapse").addEventListener("click", () => setTreeOpen("allTypeTree", false));
  $("monExpand").addEventListener("click", () => setTreeOpen("monsterTree", true));
  $("monCollapse").addEventListener("click", () => setTreeOpen("monsterTree", false));

  const modal = (btnId, modalId, closeId) => {
    if (btnId) $(btnId).addEventListener("click", () => $(modalId).classList.remove("hidden"));
    $(closeId).addEventListener("click", () => $(modalId).classList.add("hidden"));
    $(modalId).addEventListener("click", (e) => { if (e.target.id === modalId) $(modalId).classList.add("hidden"); });
  };
  modal("helpBtn", "helpModal", "helpClose");
  modal("linksBtn", "linksModal", "linksClose");
  modal("aboutBtn", "aboutModal", "aboutClose");
  modal("themeBtn", "themeModal", "themeClose");
  modal("resetBtn", "resetConfirmModal", "resetConfirmCancel");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal:not(.hidden)").forEach(m => m.classList.add("hidden"));
  });
  $("resetConfirmOk").addEventListener("click", () => {
    $("resetConfirmModal").classList.add("hidden");
    resetControls();
    syncControls();
    saveFilters();
  });
  // A fixed window name, so clicking again refocuses the open pop-out instead of adding one.
  $("streamViewBtn").addEventListener("click", () => {
    window.open("stream-view.html?v=1", "mh3uStreamView", "width=640,height=560,menubar=no,toolbar=no,location=no,status=no");
  });

  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(filterState(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = "mh3u-randomizer-filters.json";
    a.click();
    URL.revokeObjectURL(url);
  });
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", function () {
    const file = this.files[0];
    this.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      let d = null;
      try { d = JSON.parse(e.target.result); } catch (err) {}
      if (!d || typeof d !== "object" || !d.t) {
        const btn = $("importBtn");
        btn.textContent = "Invalid file!";
        setTimeout(() => { btn.textContent = "Import"; }, 2000);
        return;
      }
      applyFilters(d);
      saveFilters();
    };
    reader.readAsText(file);
  });

  // ── Boot ─────────────────────────────────────────────────────────────────
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(FILTER_KEY) || "null"); } catch (e) {}
  applyFilters(saved);
  CARD.placeholder($("card"), "Pick a quest type and level range, then press Randomize.");

  // Force a repaint once the MHFU font loads, so select text isn't clipped.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      document.querySelectorAll("select").forEach(s => { s.style.display = "none"; s.offsetHeight; s.style.display = ""; });
    });
  }
})();
