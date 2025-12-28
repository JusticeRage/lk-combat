import { SPELLS, getSpellById } from "./spells.js";
import { ITEMS, getItemById } from "./items.js";
import {
  clampInt, deepClone, fmtDice, nowStamp,
  computeAttackHits, computeEnemyHits,
  armourSaveRolls, getEffectiveArmour,
  clearBattleBuffs, addBattleArmourBuff
} from "./engine.js";

const HERO_NAMES = [
  "Sar Jessica Dayne",
  "Lord Ti’quon",
  "Tasha",
  "Amelia Pass-Dayne",
  "Akihiro of Chalice",
  "Brash",
];

const HERO_IMAGES = {
  "Sar Jessica Dayne": "./img/jessica.png",
  "Lord Ti’quon": "./img/tiquon.png",
  "Tasha": "./img/tasha.png",
  "Amelia Pass-Dayne": "./img/amelia.png",
  "Akihiro of Chalice": "./img/akihiro.png",
  "Brash": "./img/brash.png",
};

const SPELLCASTER_NAMES = new Set([
  "Amelia Pass-Dayne",
  "Lord Ti’quon",
]);

const EQUIPMENT_SLOTS = 10;
const SPELL_SLOTS = 6;

const LS_KEY = "lk_combat_tracker_v3";

const STAT_LABELS = {
  fighting: "Fighting",
  stealth: "Stealth",
  lore: "Lore",
  survival: "Survival",
  charisma: "Charisma",
  armour: "Armour",
};

const STAT_ICONS = {
  fighting: "⚔️",
  stealth: "🥷🏻",
  lore: "📚",
  survival: "🏕️",
  charisma: "💬",
  armour: "🛡️",
};

const $ = (id) => document.getElementById(id);

function bsModalShow(id) {
  const el = $(id);
  if (!el) return;
  const isBootstrapModal = el.classList?.contains("modal");
  if (isBootstrapModal && typeof bootstrap !== "undefined" && bootstrap.Modal) {
    bootstrap.Modal.getOrCreateInstance(el).show();
    return;
  }
  if (typeof el.showModal === "function") {
    el.showModal();
    return;
  }
  el.style.display = "";
}

function bsModalHide(id) {
  const el = $(id);
  if (!el) return;
  const isBootstrapModal = el.classList?.contains("modal");
  if (isBootstrapModal && typeof bootstrap !== "undefined" && bootstrap.Modal) {
    (bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance(el)).hide();
    return;
  }
  if (typeof el.close === "function") {
    el.close();
    return;
  }
  el.style.display = "none";
}

// Ensure stats modal exists even if HTML doesn't include it (for Bootstrap-only UI)
function ensureStatsModalExists() {
  const existing = $("statsDialog");
  if (existing) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div class="modal fade" id="statsDialog" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h5 class="modal-title">Edit hero stats</h5>
            <div id="statsDialogHero" class="text-secondary small"></div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statFighting">Fighting</label>
              <input type="number" min="0" max="50" id="statFighting" class="form-control">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statStealth">Stealth</label>
              <input type="number" min="0" max="50" id="statStealth" class="form-control">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statLore">Lore</label>
              <input type="number" min="0" max="50" id="statLore" class="form-control">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statSurvival">Survival</label>
              <input type="number" min="0" max="50" id="statSurvival" class="form-control">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statCharisma">Charisma</label>
              <input type="number" min="0" max="50" id="statCharisma" class="form-control">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statArmour">Armour</label>
              <input type="number" min="0" max="50" id="statArmour" class="form-control">
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label small text-secondary mb-1" for="statMaxHp">Max HP</label>
              <input type="number" min="1" max="999" id="statMaxHp" class="form-control">
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label small text-secondary mb-1" for="statHp">HP</label>
              <input type="number" min="0" max="999" id="statHp" class="form-control">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" id="statsCancel" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary" id="statsSave">Save</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
}

function syncPreferredTheme() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.setAttribute("data-bs-theme", media.matches ? "dark" : "light");
  apply();
  media.addEventListener("change", apply);
}

const formatSpellType = (spell) => {
  const raw = spell?.type || "combat";
  const label = String(raw).replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const formatSpellOptionLabel = (spell) => {
  const typeLabel = formatSpellType(spell);
  return `${spell.name} (${typeLabel} • Recharge ${spell.recharge})`;
};

const isSpellcaster = (name) => SPELLCASTER_NAMES.has(name);

const getHeroImage = (name) => HERO_IMAGES[name] || "https://via.placeholder.com/120x120?text=Hero";

const EMPTY_EQUIPMENT_ENTRY = { id: "", custom: "", count: 1, equipped: null };

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function matchItem(text) {
  if (!text) return { ...EMPTY_EQUIPMENT_ENTRY };
  const byId = getItemById(text);
  if (byId) return { id: byId.id, custom: "", count: 1, equipped: null };
  const byName = ITEMS.find(it => it.name.toLowerCase() === String(text).toLowerCase());
  if (byName) return { id: byName.id, custom: "", count: 1, equipped: null };
  return { id: "", custom: String(text), count: 1, equipped: null };
}

function normalizeEquipmentEntry(raw) {
  if (!raw) return { ...EMPTY_EQUIPMENT_ENTRY };
  if (typeof raw === "string") return matchItem(raw);
  const base = matchItem(raw.id || raw.name || raw.custom);
  const item = getItemById(base.id);
  let equipped = (raw.equipped === null || raw.equipped === undefined) ? null : !!raw.equipped;
  if (equipped === null) equipped = item?.type === "weapon" ? true : false;
  return {
    id: base.id,
    custom: typeof raw.custom === "string" ? raw.custom : base.custom,
    count: clampInt(raw.count ?? 1, 1, 999, 1),
    equipped,
  };
}

function normalizeEquipmentList(rawList, { keepEmpty = false } = {}) {
  if (!Array.isArray(rawList)) return [];
  const normalized = [];
  for (const raw of rawList) {
    const entry = normalizeEquipmentEntry(raw);
    if (!entry.id && !entry.custom && !keepEmpty) continue;
    normalized.push(entry);
    if (normalized.length >= EQUIPMENT_SLOTS) break;
  }
  return normalized;
}

function getEquipmentItem(entry) {
  const byId = getItemById(entry?.id);
  if (byId) return byId;
  if (!entry?.custom) return null;
  return ITEMS.find(it => it.name.toLowerCase() === entry.custom.toLowerCase()) || null;
}

function getEquipmentModifiers(member) {
  const mods = { fighting: 0, stealth: 0, lore: 0, survival: 0, charisma: 0, armour: 0 };
  const equipment = Array.isArray(member?.equipment) ? member.equipment : [];
  for (const raw of equipment) {
    const entry = normalizeEquipmentEntry(raw);
    const item = getEquipmentItem(entry);
    if (!item) continue;
    if (item.type === "weapon" && !entry.equipped) continue;
    const stack = item.countable ? Math.max(1, entry.count || 1) : 1;
    for (const [k, v] of Object.entries(item.modifiers || {})) {
      mods[k] = (mods[k] || 0) + (Number(v) || 0) * stack;
    }
  }
  return mods;
}

function enforceWeaponHandLimit(member) {
  if (!Array.isArray(member?.equipment)) return;
  let handsUsed = 0;
  member.equipment = member.equipment.map(raw => {
    const entry = normalizeEquipmentEntry(raw);
    const item = getEquipmentItem(entry);
    if (item?.type === "weapon") {
      const hands = item.hands === 2 ? 2 : 1;
      if (entry.equipped && handsUsed + hands > 2) {
        entry.equipped = false;
      } else if (entry.equipped) {
        handsUsed += hands;
      }
    }
    return entry;
  });
}

function hasEquippedWeapon(member) {
  const equipment = Array.isArray(member?.equipment) ? member.equipment : [];
  return equipment.some(raw => {
    const entry = normalizeEquipmentEntry(raw);
    const item = getEquipmentItem(entry);
    return item?.type === "weapon" && entry.equipped;
  });
}

function getEffectiveStat(member, key) {
  const base = member?.[key] || 0;
  const mods = getEquipmentModifiers(member);
  return base + (mods[key] || 0);
}

function getEffectiveArmourScore(member) {
  const mods = getEquipmentModifiers(member);
  return getEffectiveArmour(member, mods.armour || 0);
}

function getEffectiveFightingDice(member) {
  const fightStat = getEffectiveStat(member, "fighting");
  const hasWeapon = hasEquippedWeapon(member);
  const dice = hasWeapon ? fightStat : Math.max(0, fightStat - 1);
  return { dice, hasWeapon, fightStat };
}

function computeDisplayedStats(member) {
  const mods = getEquipmentModifiers(member);
  const stats = {};
  for (const key of ["fighting", "stealth", "lore", "survival", "charisma", "armour"]) {
    const base = member?.[key] || 0;
    let modified = base + (mods[key] || 0);
    if (key === "armour") modified = getEffectiveArmour(member, mods.armour || 0);
    if (key === "fighting") modified = hasEquippedWeapon(member) ? modified : Math.max(0, modified - 1);
    stats[key] = { base, modified };
  }
  return stats;
}

function formatStatBadge(key, stat) {
  const icon = STAT_ICONS[key] ? `${STAT_ICONS[key]} ` : "";
  const label = STAT_LABELS[key] || key;
  return `${icon}${label}: ${stat.base} (${stat.modified})`;
}

function describeItem(item, entry) {
  if (!item) return "No item";
  const details = [];
  const mods = Object.entries(item.modifiers || {}).filter(([, v]) => v);
  if (mods.length) {
    details.push(mods.map(([k, v]) => `${STAT_LABELS[k] || k}${v >= 0 ? "+" : ""}${v}`).join(", "));
  }
  if (item.hands) details.push(item.hands === 2 ? "Two-handed" : "One-handed");
  if (item.type === "weapon") details.push("Weapon");
  if (item.type === "weapon") details.push(entry?.equipped ? "Equipped" : "Unequipped");
  if (!mods.length && !item.hands && !item.type) details.push("No stat effect");
  if (item.countable) details.push(`Count: ${entry?.count || 1}`);
  return details.join(" • ");
}

function saveSetupToStorage(state) {
  const payload = {
    silverCoins: state.silverCoins || 0,
    party: state.party.map(p => ({
      name: p.name,
      fighting: p.fighting,
      stealth: p.stealth,
      lore: p.lore,
      survival: p.survival,
      charisma: p.charisma,
      armour: p.armour,
      health: p.health,
      maxHealth: p.maxHealth,
      equipment: p.equipment,
      notes: p.notes,
      spells: p.spells,
    })),
    mobs: state.mobs.map(m => ({
      name: m.name, atkDice: m.atkDice, atkTarget: m.atkTarget, auto: m.auto,
      defTarget: m.defTarget, health: m.health, maxHealth: m.maxHealth
    }))
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch {}
}

function loadSetupFromStorage(state) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return false;

    state.silverCoins = clampInt(obj.silverCoins, 0, 999999, 0);

    if (Array.isArray(obj.party)) {
      const seen = new Set();
      state.party = obj.party
        .filter(p => p && HERO_NAMES.includes(p.name) && !seen.has(p.name) && (seen.add(p.name), true))
        .slice(0, 4)
        .map(p => newMember(p.name, p));
    }

    if (Array.isArray(obj.mobs)) {
      state.mobs = obj.mobs.map(m => ({
        name: (m && m.name) ? String(m.name) : "Mob",
        atkDice: clampInt(m?.atkDice, 0, 99, 3),
        atkTarget: clampInt(m?.atkTarget, 2, 6, 4),
        auto: clampInt(m?.auto, 0, 99, 0),
        defTarget: clampInt(m?.defTarget, 2, 6, 4),
        health: clampInt(m?.health, 0, 999, 6),
        maxHealth: clampInt(m?.maxHealth, 1, 999, 6),
        dead: false
      }));
    }

    return true;
  } catch {
    return false;
  }
}

function newMember(name, seed = null) {
  const base = {
    name,
    fighting: 3,
    stealth: 0,
    lore: 0,
    survival: 0,
    charisma: 0,
    armour: 0,
    health: 8,
    maxHealth: 8,
    dead: false,
    actedThisRound: false,
    buffs: [],
    equipment: [],
    notes: "",
    spells: Array.from({ length: SPELL_SLOTS }, () => ({ id: "", status: "ready" })),
    // spell usage tracked per hero
    spellsUsed: {} // { spellId: true }
  };
  if (!seed) return base;
  const enriched = {
    ...base,
    fighting: clampInt(seed.fighting, 0, 99, 3),
    stealth: clampInt(seed.stealth, 0, 99, 0),
    lore: clampInt(seed.lore, 0, 99, 0),
    survival: clampInt(seed.survival, 0, 99, 0),
    charisma: clampInt(seed.charisma, 0, 99, 0),
    armour: clampInt(seed.armour, 0, 99, 0),
    health: clampInt(seed.health, 0, 999, 8),
    maxHealth: clampInt(seed.maxHealth, 1, 999, 8),
    equipment: normalizeEquipmentList(seed.equipment),
    notes: typeof seed.notes === "string" ? seed.notes : "",
    spells: Array.isArray(seed.spells)
      ? Array.from({ length: SPELL_SLOTS }, (_, i) => ({
        id: seed.spells[i]?.id || "",
        status: seed.spells[i]?.status === "exhausted" ? "exhausted" : "ready",
      }))
      : base.spells,
  };
  enforceWeaponHandLimit(enriched);
  return enriched;
}

function newMob() {
  return { name: "Goblin", atkDice: 4, atkTarget: 5, auto: 0, defTarget: 4, health: 6, maxHealth: 6, dead: false };
}

// --- Encounter import parsing ---
function parseEncounterText(text) {
  const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const mobs = [];
  let i = 0;

  const attackRe = /^(\d+)\s*\(\s*([2-6])\s*\+\s*\)\s*(?:\+\s*(\d+)\s*Auto\s*)?$/i;
  const defRe = /^([2-6])\s*\+\s*$/;
  const hpRe = /^(\d+)\s*$/;

  while (i < lines.length) {
    const name = lines[i++];
    const atkLine = lines[i++];
    const defLine = lines[i++];
    const hpLine = lines[i++];

    if (!name || !atkLine || !defLine || !hpLine) throw new Error("Incomplete block (need 4 lines per opponent).");

    const am = atkLine.match(attackRe);
    if (!am) throw new Error(`Bad attack line for "${name}": "${atkLine}"`);

    const dm = defLine.match(defRe);
    if (!dm) throw new Error(`Bad defence line for "${name}": "${defLine}"`);

    const hm = hpLine.match(hpRe);
    if (!hm) throw new Error(`Bad health line for "${name}": "${hpLine}"`);

    const atkDice = Number(am[1]);
    const atkTarget = Number(am[2]);
    const auto = am[3] ? Number(am[3]) : 0;
    const defTarget = Number(dm[1]);
    const hp = Number(hm[1]);

    mobs.push({ name, atkDice, atkTarget, auto, defTarget, health: hp, maxHealth: hp, dead: false });
  }

  if (!mobs.length) throw new Error("No opponents parsed.");
  return mobs;
}

// --- State ---
const state = {
  phase: "setup", // setup | combat | ended
  round: 1,
  turn: "party", // party | enemies
  party: [],
  silverCoins: 0,
  mobs: [],
  enemyIndex: 0,
  log: [],
  history: [],
  battleSeed: null,   // snapshot for restart
};

function pushLog(line) {
  state.log.push(line);
  renderLog();
}

function renderLog() {
  const el = $("log");
  el.textContent = state.log.join("\n");
  el.scrollTop = el.scrollHeight;
}

function snapshot() {
  state.history.push(deepClone({
    phase: state.phase, round: state.round, turn: state.turn,
    party: state.party, mobs: state.mobs, enemyIndex: state.enemyIndex,
    log: state.log, battleSeed: state.battleSeed
  }));
  if (state.history.length > 50) state.history.shift();
  $("undo").disabled = state.history.length === 0;
}

function undo() {
  const last = state.history.pop();
  if (!last) return;
  state.phase = last.phase;
  state.round = last.round;
  state.turn = last.turn;
  state.party = last.party;
  state.mobs = last.mobs;
  state.enemyIndex = last.enemyIndex;
  state.log = last.log;
  state.battleSeed = last.battleSeed;
  renderAll();
}

const livingParty = () => state.party.filter(p => !p.dead && p.health > 0);
const livingMobs = () => state.mobs.filter(m => !m.dead && m.health > 0);

function checkDeaths() {
  for (const p of state.party) {
    if (!p.dead && p.health <= 0) { p.dead = true; p.health = 0; pushLog(`☠ Party member defeated: ${p.name}`); }
  }
  for (const m of state.mobs) {
    if (!m.dead && m.health <= 0) { m.dead = true; m.health = 0; pushLog(`☠ Opponent defeated: ${m.name}`); }
  }
}

const findKnownSpell = (caster, spellId) => {
  if (!caster?.spells) return null;
  return caster.spells.find(s => s.id === spellId && s.id);
};

function checkEnd() {
  if (livingParty().length === 0) { state.phase = "ended"; pushLog("=== DEFEAT: entire party killed ==="); return true; }
  if (livingMobs().length === 0) { state.phase = "ended"; pushLog("=== VICTORY: all opponents defeated ==="); return true; }
  return false;
}

function resetPartyRoundFlags() {
  for (const p of state.party) p.actedThisRound = false;
}

function normalizeForCombat() {
  for (const p of state.party) {
    p.maxHealth = Math.max(1, clampInt(p.maxHealth, 1, 999, 8));
    p.health = Math.min(clampInt(p.health, 0, 999, p.maxHealth), p.maxHealth);
    p.dead = (p.health <= 0);
    p.fighting = clampInt(p.fighting, 0, 99, p.fighting);
    p.stealth = clampInt(p.stealth, 0, 99, p.stealth);
    p.lore = clampInt(p.lore, 0, 99, p.lore);
    p.survival = clampInt(p.survival, 0, 99, p.survival);
    p.charisma = clampInt(p.charisma, 0, 99, p.charisma);
    p.armour = clampInt(p.armour, 0, 99, p.armour);
    p.actedThisRound = false;
    p.buffs = [];
    p.spellsUsed = {};
    p.equipment = normalizeEquipmentList(p.equipment, { keepEmpty: true });
    enforceWeaponHandLimit(p);
    p.spells = Array.isArray(p.spells)
      ? Array.from({ length: SPELL_SLOTS }, (_, i) => ({
        id: p.spells[i]?.id || "",
        status: p.spells[i]?.status === "exhausted" ? "exhausted" : "ready",
      }))
      : Array.from({ length: SPELL_SLOTS }, () => ({ id: "", status: "ready" }));
  }
  for (const m of state.mobs) {
    m.maxHealth = Math.max(1, clampInt(m.maxHealth, 1, 999, 6));
    m.health = Math.min(clampInt(m.health, 0, 999, m.maxHealth), m.maxHealth);
    m.dead = (m.health <= 0);
    m.atkDice = clampInt(m.atkDice, 0, 99, m.atkDice);
    m.atkTarget = clampInt(m.atkTarget, 2, 6, m.atkTarget);
    m.auto = clampInt(m.auto, 0, 99, m.auto);
    m.defTarget = clampInt(m.defTarget, 2, 6, m.defTarget);
  }
}

function seedBattleState() {
  // capture initial state of combat (incl. spell usage cleared)
  state.battleSeed = deepClone({
    party: state.party.map(p => ({ ...p, dead: false, actedThisRound: false, buffs: [], spellsUsed: {} })),
    mobs: state.mobs.map(m => ({ ...m, dead: false })),
    round: 1, turn: "party", enemyIndex: 0
  });
}

function restoreFromSeed() {
  if (!state.battleSeed) return false;
  state.history = [];
  state.phase = "combat";
  state.round = 1;
  state.turn = "party";
  state.enemyIndex = 0;
  state.party = deepClone(state.battleSeed.party);
  state.mobs = deepClone(state.battleSeed.mobs);
  state.log = [];
  pushLog(`=== Combat restarted (${nowStamp()}) ===`);
  pushLog(`--- Round 1 (Party turn) ---`);
  return true;
}

function nextTurnIfNeeded() {
  if (state.phase !== "combat") return;

  if (state.turn === "party") {
    if (checkEnd()) return;

    const canStillAct = state.party.some(p => !p.dead && p.health > 0 && !p.actedThisRound);
    if (!canStillAct) {
      state.turn = "enemies";
      state.enemyIndex = 0;
      pushLog(`--- Enemies turn (Round ${state.round}) ---`);
    }
  } else {
    if (livingMobs().length === 0) { checkEnd(); return; }

    while (state.enemyIndex < state.mobs.length && (state.mobs[state.enemyIndex].dead || state.mobs[state.enemyIndex].health <= 0)) {
      state.enemyIndex++;
    }
    if (state.enemyIndex >= state.mobs.length) {
      state.turn = "party";
      state.round += 1;
      state.enemyIndex = 0;
      resetPartyRoundFlags();
      pushLog(`--- Round ${state.round} (Party turn) ---`);
    }
  }
}

// --- Party attack ---
function partyAttack(attackerIdx, targetIdx) {
  const attacker = state.party[attackerIdx];
  const target = state.mobs[targetIdx];
  if (!attacker || !target) return;
  if (state.phase !== "combat" || state.turn !== "party") return;
  if (attacker.dead || attacker.health <= 0 || attacker.actedThisRound) return;
  if (target.dead || target.health <= 0) return;

  snapshot();

  const { dice: diceCount } = getEffectiveFightingDice(attacker);

  const { rolls, hits } = computeAttackHits(diceCount, target.defTarget);

  pushLog(`[Party] ${attacker.name} attacks ${target.name} | dice=${diceCount} rolls=${fmtDice(rolls)} vs Def ${target.defTarget}+ => hits=${hits}`);
  if (hits > 0) {
    target.health -= hits;
    pushLog(`        ${target.name} takes ${hits} damage (HP ${Math.max(0, target.health)}/${target.maxHealth})`);
  } else {
    pushLog(`        No damage.`);
  }

  attacker.actedThisRound = true;

  checkDeaths();
  checkEnd();
  nextTurnIfNeeded();
  renderAll();
}

// --- Enemy attacks ---
function resolveOneEnemyAttack(victimIdx) {
  if (state.phase !== "combat" || state.turn !== "enemies") return;

  while (state.enemyIndex < state.mobs.length && (state.mobs[state.enemyIndex].dead || state.mobs[state.enemyIndex].health <= 0)) {
    state.enemyIndex++;
  }
  const mob = state.mobs[state.enemyIndex];
  if (!mob) {
    snapshot();
    nextTurnIfNeeded();
    renderAll();
    return;
  }

  const victim = state.party[victimIdx];
  if (!victim || victim.dead || victim.health <= 0) return;

  snapshot();

  const { rolls, hits } = computeEnemyHits(mob.atkDice, mob.atkTarget);
  const auto = mob.auto || 0;
  const raw = hits + auto;

  pushLog(`[Enemy] ${mob.name} attacks ${victim.name} | rolls=${fmtDice(rolls)} vs ${mob.atkTarget}+ => hits=${hits}${auto ? ` + auto=${auto}` : ""} => damage=${raw}`);

  if (raw > 0) {
    const effArmour = getEffectiveArmourScore(victim);
    const save = armourSaveRolls(effArmour, raw);
    const final = Math.max(0, raw - save.saved);

    if (save.rolls.length) {
      pushLog(`        Armour save (${save.dice}d6 @4+) rolls=${fmtDice(save.rolls)} => saved=${save.saved} => final=${final}`);
    } else {
      pushLog(`        No armour save. Final=${final}`);
    }

    victim.health -= final;
    pushLog(`        ${victim.name} HP ${Math.max(0, victim.health)}/${victim.maxHealth}`);
  } else {
    pushLog(`        No damage.`);
  }

  checkDeaths();
  if (checkEnd()) { renderAll(); return; }

  state.enemyIndex += 1;
  nextTurnIfNeeded();
  renderAll();
}

function resolveAllEnemyAttacks(victimIdx) {
  while (state.phase === "combat" && state.turn === "enemies") {
    let vidx = victimIdx;
    const v = state.party[vidx];
    if (!v || v.dead || v.health <= 0) {
      const live = livingParty();
      if (!live.length) break;
      vidx = state.party.indexOf(live[0]);
    }

    let tmp = state.enemyIndex;
    while (tmp < state.mobs.length && (state.mobs[tmp].dead || state.mobs[tmp].health <= 0)) tmp++;
    if (tmp >= state.mobs.length) {
      snapshot();
      nextTurnIfNeeded();
      renderAll();
      break;
    }

    resolveOneEnemyAttack(vidx);
  }
}

// --- Spell casting engine (small) ---
function canCastSpell(caster, spell) {
  if (state.phase !== "combat" || state.turn !== "party") return { ok: false, reason: "Not on party turn." };
  if (!isSpellcaster(caster.name)) return { ok: false, reason: "This hero cannot cast spells." };
  if (caster.dead || caster.health <= 0) return { ok: false, reason: "Caster is dead." };
  if (caster.actedThisRound) return { ok: false, reason: "Caster already acted this round." };
  const known = findKnownSpell(caster, spell.id);
  if (!known) return { ok: false, reason: "Spell is not prepared." };
  if (known.status === "exhausted") return { ok: false, reason: "Spell is exhausted." };
  if (spell.type !== "combat") return { ok: false, reason: "This spell cannot be cast in combat." };
  if (spell.oncePerBattle && caster.spellsUsed?.[spell.id]) return { ok: false, reason: "Spell already used this battle." };
  return { ok: true, reason: "" };
}

function castSpell({ casterIdx, spellId, targets }) {
  const caster = state.party[casterIdx];
  const spell = getSpellById(spellId);
  if (!caster || !spell) return;

  const chk = canCastSpell(caster, spell);
  if (!chk.ok) return;

  snapshot();

  pushLog(`[Spell] ${caster.name} casts ${spell.name}`);

  // Execute steps
  for (const step of spell.steps) {
    if (step.type === "attackFixed") {
      const times = step.times ?? 1;
      for (let k = 0; k < times; k++) {
        const mobIdx = targets.enemy?.[k];
        const mob = state.mobs[mobIdx];
        if (!mob || mob.dead || mob.health <= 0) {
          pushLog(`        (skipped) target ${k+1} invalid/dead`);
          continue;
        }
        const { rolls, hits } = computeAttackHits(step.fighting, mob.defTarget);
        pushLog(`        Attack ${k+1}: vs ${mob.name} | dice=${step.fighting} rolls=${fmtDice(rolls)} vs Def ${mob.defTarget}+ => hits=${hits}`);
        if (hits > 0) {
          mob.health -= hits;
          pushLog(`                 ${mob.name} takes ${hits} damage (HP ${Math.max(0, mob.health)}/${mob.maxHealth})`);
        } else {
          pushLog(`                 No damage.`);
        }
      }
    }

    if (step.type === "damageFixed") {
      const mobIdx = targets.enemy?.[0];
      const mob = state.mobs[mobIdx];
      if (!mob || mob.dead || mob.health <= 0) {
        pushLog(`        (skipped) invalid/dead target`);
      } else {
        mob.health -= step.amount;
        pushLog(`        ${mob.name} loses ${step.amount} Health (HP ${Math.max(0, mob.health)}/${mob.maxHealth})`);
      }
    }

    if (step.type === "buffArmour") {
      const allyIdx = targets.ally?.[0];
      const ally = state.party[allyIdx];
      if (!ally || ally.dead || ally.health <= 0) {
        pushLog(`        (skipped) invalid/dead ally`);
      } else {
        addBattleArmourBuff(ally, step.amount);
        pushLog(`        ${ally.name} gains +${step.amount} Armour until end of battle (effective armour now ${getEffectiveArmourScore(ally)})`);
      }
    }

    if (step.type === "healFixed") {
      const allyIdx = targets.ally?.[0];
      const ally = state.party[allyIdx];
      if (!ally || ally.dead || ally.health <= 0) {
        pushLog(`        (skipped) invalid/dead ally`);
      } else {
        const before = ally.health;
        ally.health = Math.min(ally.maxHealth, ally.health + step.amount);
        const healed = ally.health - before;
        pushLog(`        ${ally.name} restores ${healed} Health (HP ${ally.health}/${ally.maxHealth})`);
      }
    }
  }

  // Consume action + spell usage
  caster.actedThisRound = true;
  if (!caster.spellsUsed) caster.spellsUsed = {};
  caster.spellsUsed[spell.id] = true;
  const known = findKnownSpell(caster, spell.id);
  if (known) known.status = "exhausted";

  checkDeaths();
  checkEnd();
  nextTurnIfNeeded();
  renderAll();
}

// --- UI rendering ---
function renderEditors() {
  const pe = $("partyEditor");
  pe.innerHTML = "";
  const addMemberBtn = $("addMember");
  if (addMemberBtn) addMemberBtn.disabled = state.party.length >= 4;

  let itemList = document.getElementById("itemOptions");
  if (!itemList) {
    itemList = document.createElement("datalist");
    itemList.id = "itemOptions";
    document.body.appendChild(itemList);
  }
  itemList.innerHTML = ITEMS.map(it => `<option value="${escapeHtml(it.name)}"></option>`).join("");

  const partyMeta = document.createElement("div");
  partyMeta.className = "lk-party-resources";
  partyMeta.innerHTML = `
    <div class="lk-resource-card">
      <div class="lk-resource-icon" aria-hidden="true">🪙</div>
      <div class="flex-grow-1">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div class="text-uppercase small text-secondary fw-semibold">Party silver</div>
          <div class="text-secondary small">Shared pool</div>
        </div>
        <div class="input-group input-group-sm mt-2">
          <span class="input-group-text">Coins</span>
          <input type="number" class="form-control" min="0" max="999999" data-k="silverCoins" value="${state.silverCoins || 0}">
        </div>
      </div>
    </div>
  `;
  pe.appendChild(partyMeta);

  state.party.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "panel panel-default hero-card";
    enforceWeaponHandLimit(p);
    const equipment = normalizeEquipmentList(p.equipment, { keepEmpty: true });
    const statBadges = (() => {
      const stats = computeDisplayedStats(p);
      const statKeys = ["fighting", "stealth", "lore", "survival", "charisma", "armour"];
      const hpBadge = `<span class="pill stat-pill">HP: ${Math.max(0, p.health)}/${p.maxHealth}</span>`;
      return statKeys
        .map(k => `<span class="pill stat-pill">${escapeHtml(formatStatBadge(k, stats[k]))}</span>`)
        .join("") + hpBadge;
    })();

    const equipmentRows = equipment.map((eqRaw, slot) => {
      const eq = normalizeEquipmentEntry(eqRaw);
      const item = getEquipmentItem(eq);
      const isWeapon = item?.type === "weapon";
      const itemLabel = escapeHtml(item?.name || eq.custom || "");
      return `
      <div class="equip-row">
        <div class="row g-3 align-items-end">
          <div class="col-md-6">
            <label class="form-label small">Item</label>
            <input type="text" class="form-control form-control-sm" list="itemOptions" data-k="equipment" data-field="name" data-ei="${slot}" data-i="${idx}" value="${itemLabel}" placeholder="Item name">
          </div>
          ${item?.countable ? `
            <div class="col-md-2">
              <label class="form-label small">Count</label>
              <input type="number" class="form-control form-control-sm" min="1" max="999" data-k="equipment" data-field="count" data-ei="${slot}" data-i="${idx}" value="${eq.count || 1}">
            </div>
          ` : ""}
          ${isWeapon ? `
            <div class="col-md-2">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" data-k="equipment" data-field="equipped" data-ei="${slot}" data-i="${idx}" ${eq.equipped ? "checked" : ""} id="equip-${idx}-${slot}">
                <label class="form-check-label small" for="equip-${idx}-${slot}">Equipped</label>
              </div>
            </div>
          ` : ""}
          <div class="col-md-2 text-end">
            <button class="btn btn-outline-danger btn-sm" data-del-equipment="${slot}" data-i="${idx}">Remove</button>
          </div>
        </div>
        <div class="muted equip-help">${escapeHtml(item ? describeItem(item, eq) : (eq.custom ? "Custom item" : "No item"))}</div>
      </div>
    `;
    }).join("");

    const equipmentMeta = `
      <div class="d-flex justify-content-between align-items-center equipment-meta">
        <div class="muted small">${equipment.length}/${EQUIPMENT_SLOTS} slots used</div>
        <button class="btn btn-outline-primary btn-sm" data-add-equipment="${idx}" ${equipment.length >= EQUIPMENT_SLOTS ? "disabled" : ""}>Add slot</button>
      </div>
    `;

    const spellRows = [];
    if (isSpellcaster(p.name)) {
      const knownSpells = Array.isArray(p.spells)
        ? Array.from({ length: SPELL_SLOTS }, (_, i) => p.spells[i] || { id: "", status: "ready" })
        : [];
      for (let i = 0; i < SPELL_SLOTS; i++) {
        const entry = knownSpells[i] || { id: "", status: "ready" };
        spellRows.push(`
          <div class="row spell-row">
            <label>Spell ${i + 1}
              <select data-k="spellId" data-si="${i}" data-i="${idx}" class="form-control input-sm">
                <option value="">— None —</option>
                ${SPELLS.map(sp => `<option value="${sp.id}" ${entry.id === sp.id ? "selected" : ""}>${escapeHtml(formatSpellOptionLabel(sp))}</option>`).join("")}
              </select>
            </label>
            <label>Status
              <select data-k="spellStatus" data-si="${i}" data-i="${idx}" class="form-control input-sm">
                <option value="ready" ${entry.status !== "exhausted" ? "selected" : ""}>Charged</option>
                <option value="exhausted" ${entry.status === "exhausted" ? "selected" : ""}>Exhausted</option>
              </select>
            </label>
          </div>
        `);
      }
    }

    div.innerHTML = `
      <div class="panel-body">
        <div class="hero-heading">
          <img src="${getHeroImage(p.name)}" alt="${escapeHtml(p.name)} portrait" class="hero-avatar">
          <div style="flex:1;">
            <div class="row hero-top-row">
              <div class="col-sm-6">
                <label class="form-label">Name</label>
                <div class="form-control form-control-sm bg-body-secondary hero-name" aria-label="Character name">${escapeHtml(p.name)}</div>
              </div>
              <div class="col-sm-6">
                <div class="d-flex justify-content-end gap-2 flex-wrap">
                  <button class="btn btn-outline-secondary btn-sm" data-edit-stats="${idx}">Edit stats</button>
                  <button class="btn btn-default btn-sm" data-del-party="${idx}">Remove</button>
                </div>
              </div>
            </div>
            <div class="stat-summary">${statBadges}</div>
          </div>
        </div>
        <div class="equipment-stack">
          ${equipmentRows || `<div class="muted small">No equipment yet.</div>`}
          ${equipmentMeta}
        </div>
        <div class="row">
          <label class="notes">Notes
            <textarea data-k="notes" data-i="${idx}" spellcheck="false" class="form-control">${escapeHtml(p.notes || "")}</textarea>
          </label>
        </div>
        ${isSpellcaster(p.name) ? `
          <details class="spell-card">
            <summary>
              <span>Spells</span>
              <span class="spell-count text-secondary small">${spellRows.length} slots</span>
            </summary>
            <div class="spell-body">${spellRows.join("")}</div>
          </details>
        ` : ""}
      </div>
    `;
    pe.appendChild(div);
  });

  const me = $("mobEditor");
  me.innerHTML = "";
  state.mobs.forEach((m, idx) => {
    const div = document.createElement("div");
    div.className = "panel panel-default hero-card";
    div.innerHTML = `
      <div class="panel-body">
        <div class="row">
          <label>Name <input type="text" class="form-control input-sm" data-mk="name" data-mi="${idx}" value="${escapeHtml(m.name)}"></label>
          <label>Atk dice <input type="number" class="form-control input-sm" min="0" max="50" data-mk="atkDice" data-mi="${idx}" value="${m.atkDice}"></label>
          <label>Atk target <input type="number" class="form-control input-sm" min="2" max="6" data-mk="atkTarget" data-mi="${idx}" value="${m.atkTarget}"></label>
          <label>Auto dmg <input type="number" class="form-control input-sm" min="0" max="50" data-mk="auto" data-mi="${idx}" value="${m.auto}"></label>
          <label>Def target <input type="number" class="form-control input-sm" min="2" max="6" data-mk="defTarget" data-mi="${idx}" value="${m.defTarget}"></label>
          <label>Max HP <input type="number" class="form-control input-sm" min="1" max="999" data-mk="maxHealth" data-mi="${idx}" value="${m.maxHealth}"></label>
          <label>HP <input type="number" class="form-control input-sm" min="0" max="999" data-mk="health" data-mi="${idx}" value="${m.health}"></label>
          <button class="btn btn-default btn-sm" data-del-mob="${idx}">Remove</button>
        </div>
      </div>
    `;
    me.appendChild(div);
  });

  pe.querySelectorAll("[data-k]").forEach(el => el.addEventListener("change", onPartyEdit));
  pe.querySelectorAll("button[data-add-equipment]").forEach(el => el.addEventListener("click", (e) => {
    const i = Number(e.target.getAttribute("data-add-equipment"));
    const p = state.party[i];
    if (!p) return;
    p.equipment = normalizeEquipmentList(p.equipment, { keepEmpty: true });
    if (p.equipment.length >= EQUIPMENT_SLOTS) return;
    p.equipment.push({ ...EMPTY_EQUIPMENT_ENTRY });
    state.battleSeed = null;
    saveSetupToStorage(state);
    renderAll();
  }));
  pe.querySelectorAll("button[data-del-equipment]").forEach(el => el.addEventListener("click", (e) => {
    const i = Number(e.target.getAttribute("data-i"));
    const slot = Number(e.target.getAttribute("data-del-equipment"));
    const p = state.party[i];
    if (!p) return;
    p.equipment = normalizeEquipmentList(p.equipment, { keepEmpty: true });
    if (slot >=0 && slot < p.equipment.length) {
      p.equipment.splice(slot, 1);
    }
    state.battleSeed = null;
    saveSetupToStorage(state);
    renderAll();
  }));
  pe.querySelectorAll("button[data-edit-stats]").forEach(el => el.addEventListener("click", (e) => {
    const i = Number(e.target.getAttribute("data-edit-stats"));
    openStatsDialog(i);
  }));
  pe.querySelectorAll("button[data-del-party]").forEach(el => el.addEventListener("click", (e) => {
    const i = Number(e.target.getAttribute("data-del-party"));
    state.party.splice(i, 1);
    state.battleSeed = null;
    saveSetupToStorage(state);
    renderAll();
  }));

  me.querySelectorAll("input,select").forEach(el => el.addEventListener("change", onMobEdit));
  me.querySelectorAll("button[data-del-mob]").forEach(el => el.addEventListener("click", (e) => {
    const i = Number(e.target.getAttribute("data-del-mob"));
    state.mobs.splice(i, 1);
    state.battleSeed = null;
    saveSetupToStorage(state);
    renderAll();
  }));
}

function enforceUniquePartyNames() {
  const seen = new Set();
  for (const p of state.party) {
    if (!HERO_NAMES.includes(p.name) || seen.has(p.name)) {
      const unused = HERO_NAMES.find(n => !seen.has(n));
      p.name = unused || HERO_NAMES[0];
    }
    seen.add(p.name);
  }
}

function onPartyEdit(e) {
  const el = e.target;
  const k = el.getAttribute("data-k");

  if (k === "silverCoins") {
    state.silverCoins = clampInt(el.value, 0, 999999, state.silverCoins || 0);
    state.battleSeed = null;
    saveSetupToStorage(state);
    renderAll();
    return;
  }

  const i = Number(el.getAttribute("data-i"));
  if (i < 0 || i >= state.party.length) return;
  const p = state.party[i];
  p.equipment = normalizeEquipmentList(p.equipment, { keepEmpty: true });
  if (!Array.isArray(p.spells)) p.spells = Array.from({ length: SPELL_SLOTS }, () => ({ id: "", status: "ready" }));

  if (k === "fighting") p.fighting = clampInt(el.value, 0, 50, p.fighting);
  if (k === "stealth") p.stealth = clampInt(el.value, 0, 50, p.stealth);
  if (k === "lore") p.lore = clampInt(el.value, 0, 50, p.lore);
  if (k === "survival") p.survival = clampInt(el.value, 0, 50, p.survival);
  if (k === "charisma") p.charisma = clampInt(el.value, 0, 50, p.charisma);
  if (k === "armour") p.armour = clampInt(el.value, 0, 50, p.armour);
  if (k === "maxHealth") { p.maxHealth = clampInt(el.value, 1, 999, p.maxHealth); p.health = Math.min(p.health, p.maxHealth); }
  if (k === "health") p.health = clampInt(el.value, 0, 999, p.health);
  if (k === "equipment") {
    const slot = Number(el.getAttribute("data-ei"));
    if (slot >= 0 && slot < EQUIPMENT_SLOTS) {
      while (p.equipment.length <= slot) p.equipment.push({ ...EMPTY_EQUIPMENT_ENTRY });
      const current = normalizeEquipmentEntry(p.equipment[slot]);
      const field = el.getAttribute("data-field");
      if (field === "count") {
        current.count = clampInt(el.value, 1, 999, current.count || 1);
        p.equipment[slot] = current;
      } else if (field === "equipped") {
        current.equipped = !!el.checked;
        p.equipment[slot] = current;
      } else {
        const parsed = matchItem(el.value);
        const updated = normalizeEquipmentEntry({
          id: parsed.id,
          custom: parsed.custom,
          count: current.count,
        });
        p.equipment[slot] = updated;
      }
      p.equipment = normalizeEquipmentList(p.equipment, { keepEmpty: true });
      enforceWeaponHandLimit(p);
    }
  }
  if (k === "notes") p.notes = el.value || "";
  if (k === "spellId") {
    const slot = Number(el.getAttribute("data-si"));
    if (slot >= 0 && slot < SPELL_SLOTS) {
      const status = p.spells[slot]?.status || "ready";
      p.spells[slot] = { id: el.value, status: el.value ? status : "ready" };
    }
  }
  if (k === "spellStatus") {
    const slot = Number(el.getAttribute("data-si"));
    if (slot >= 0 && slot < SPELL_SLOTS) {
      const id = p.spells[slot]?.id || "";
      p.spells[slot] = { id, status: el.value === "exhausted" ? "exhausted" : "ready" };
    }
  }

  enforceUniquePartyNames();
  if (!isSpellcaster(p.name)) {
    p.spells = Array.from({ length: SPELL_SLOTS }, () => ({ id: "", status: "ready" }));
  }
  state.battleSeed = null;
  saveSetupToStorage(state);
  renderAll();
}

function onMobEdit(e) {
  const el = e.target;
  const i = Number(el.getAttribute("data-mi"));
  const k = el.getAttribute("data-mk");
  if (i < 0 || i >= state.mobs.length) return;
  const m = state.mobs[i];

  if (k === "name") m.name = el.value || "Mob";
  if (k === "atkDice") m.atkDice = clampInt(el.value, 0, 99, m.atkDice);
  if (k === "atkTarget") m.atkTarget = clampInt(el.value, 2, 6, m.atkTarget);
  if (k === "auto") m.auto = clampInt(el.value, 0, 99, m.auto);
  if (k === "defTarget") m.defTarget = clampInt(el.value, 2, 6, m.defTarget);
  if (k === "maxHealth") { m.maxHealth = clampInt(el.value, 1, 999, m.maxHealth); m.health = Math.min(m.health, m.maxHealth); }
  if (k === "health") m.health = clampInt(el.value, 0, 999, m.health);

  state.battleSeed = null;
  saveSetupToStorage(state);
  renderAll();
}

function renderTables() {
  const pt = $("partyTable");
  if (!state.party.length) {
    pt.innerHTML = `<div class="muted">No party members.</div>`;
  } else {
    const rows = state.party.map(p => {
      enforceWeaponHandLimit(p);
      const acted = (state.phase === "combat" && state.turn === "party")
        ? (p.actedThisRound ? `<span class="pill">Acted</span>` : `<span class="pill">Ready</span>`)
        : "";
      const stats = computeDisplayedStats(p);
      const statLine = ["fighting", "armour"]
        .map(k => `<span class="pill stat-pill">${escapeHtml(formatStatBadge(k, stats[k]))}</span>`)
        .join(" ");
      return `
        <tr class="${(p.dead||p.health<=0) ? "dead" : ""}">
          <td>${p.name} ${acted}</td>
          <td>${statLine}</td>
          <td>${Math.max(0,p.health)}/${p.maxHealth}</td>
        </tr>
      `;
    }).join("");
    pt.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Stats</th><th>HP</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  const mt = $("mobTable");
  if (!state.mobs.length) {
    mt.innerHTML = `<div class="muted">No opponents.</div>`;
  } else {
    const rows = state.mobs.map((m, idx) => `
      <tr class="${(m.dead||m.health<=0) ? "dead" : ""}">
        <td>${m.name}</td>
        <td>${m.atkDice} (${m.atkTarget}+ )${m.auto ? ` +${m.auto} Auto` : ""}</td>
        <td>${m.defTarget}+</td>
        <td>${Math.max(0,m.health)}/${m.maxHealth}</td>
        <td class="muted">${state.turn==="enemies" && idx===state.enemyIndex ? "← acting" : ""}</td>
      </tr>
    `).join("");
    mt.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Attack</th><th>Def</th><th>HP</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
}

function renderControls() {
  $("phasePill").textContent = `Phase: ${state.phase}`;
  $("roundPill").textContent = `Round: ${state.round}`;
  $("turnPill").textContent = `Turn: ${state.turn}`;

  const inCombat = (state.phase === "combat");
  const partyTurn = (inCombat && state.turn === "party");
  const enemyTurn = (inCombat && state.turn === "enemies");

  $("playerControls").style.display = partyTurn ? "" : "none";
  $("enemyControls").style.display = enemyTurn ? "" : "none";

  $("endCombat").disabled = !inCombat;
  $("undo").disabled = state.history.length === 0;

  // party selects
  const pa = $("playerAttacker");
  const pt = $("playerTarget");
  pa.innerHTML = "";
  pt.innerHTML = "";

  for (let i = 0; i < state.party.length; i++) {
    const p = state.party[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    const flags = [];
    if (p.dead || p.health <= 0) flags.push("dead");
    if (p.actedThisRound) flags.push("acted");
    opt.textContent = `${p.name}${flags.length ? " (" + flags.join(", ") + ")" : ""}`;
    opt.disabled = !!(p.dead || p.health <= 0 || p.actedThisRound);
    pa.appendChild(opt);
  }

  for (let i = 0; i < state.mobs.length; i++) {
    const m = state.mobs[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${m.name}${(m.dead || m.health <= 0) ? " (dead)" : ""}`;
    opt.disabled = !!(m.dead || m.health <= 0);
    pt.appendChild(opt);
  }

  const canPartyAct = partyTurn &&
    state.party.some(p => !p.dead && p.health > 0 && !p.actedThisRound) &&
    livingMobs().length > 0;

  $("playerAttack").disabled = !canPartyAct;
  $("playerSpell").disabled = !canPartyAct;
  $("playerSkip").disabled = !partyTurn;

  // enemy controls
  const ec = $("enemyCurrent");
  ec.innerHTML = "";
  for (let i = 0; i < state.mobs.length; i++) {
    const m = state.mobs[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${m.name}${(m.dead || m.health <= 0) ? " (dead)" : ""}`;
    ec.appendChild(opt);
  }
  ec.value = String(Math.min(state.enemyIndex, Math.max(0, state.mobs.length - 1)));

  const ev = $("enemyVictim");
  ev.innerHTML = "";
  for (let i = 0; i < state.party.length; i++) {
    const p = state.party[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${p.name}${(p.dead || p.health <= 0) ? " (dead)" : ""}`;
    opt.disabled = !!(p.dead || p.health <= 0);
    ev.appendChild(opt);
  }

  const canEnemyAct = enemyTurn && livingParty().length > 0 && livingMobs().length > 0;
  $("enemyResolveOne").disabled = !canEnemyAct;
  $("enemyResolveAll").disabled = !canEnemyAct;

  if (state.phase === "setup") $("turnHelp").textContent = "Add party + opponents, then Start.";
  else if (state.phase === "ended") $("turnHelp").textContent = "Combat ended. Start to run again.";
  else $("turnHelp").textContent = partyTurn
      ? "Pick an attacker. Heroes who already acted this round are disabled."
      : "Resolve enemies in order. Choose who takes the hits.";
}

function renderAll() {
  renderEditors();
  renderTables();
  renderControls();
  renderLog();
}

// --- Dialogs: hero picker ---
function openHeroDialog() {
  if (state.party.length >= 4) return;

  const used = new Set(state.party.map(p => p.name));
  const available = HERO_NAMES.filter(n => !used.has(n));

  const select = $("heroNameSelect");
  select.innerHTML = "";
  for (const n of available) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    select.appendChild(opt);
  }

  $("heroOk").disabled = available.length === 0;
  bsModalShow("heroDialog");
}

// --- Dialog: stat editor ---
function openStatsDialog(memberIdx) {
  ensureStatsModalExists();
  const member = state.party[memberIdx];
  if (!member) return;
  const dlg = $("statsDialog");
  dlg.dataset.index = String(memberIdx);
  $("statsDialogHero").textContent = member.name;
  $("statFighting").value = member.fighting ?? 0;
  $("statStealth").value = member.stealth ?? 0;
  $("statLore").value = member.lore ?? 0;
  $("statSurvival").value = member.survival ?? 0;
  $("statCharisma").value = member.charisma ?? 0;
  $("statArmour").value = member.armour ?? 0;
  $("statMaxHp").value = member.maxHealth ?? 1;
  $("statHp").value = member.health ?? 0;
  bsModalShow("statsDialog");
}

function saveStatsFromDialog() {
  const dlg = $("statsDialog");
  const idx = Number(dlg.dataset.index || -1);
  const member = state.party[idx];
  if (!member) return;

  member.fighting = clampInt($("statFighting").value, 0, 50, member.fighting);
  member.stealth = clampInt($("statStealth").value, 0, 50, member.stealth);
  member.lore = clampInt($("statLore").value, 0, 50, member.lore);
  member.survival = clampInt($("statSurvival").value, 0, 50, member.survival);
  member.charisma = clampInt($("statCharisma").value, 0, 50, member.charisma);
  member.armour = clampInt($("statArmour").value, 0, 50, member.armour);
  member.maxHealth = clampInt($("statMaxHp").value, 1, 999, member.maxHealth);
  member.health = clampInt($("statHp").value, 0, member.maxHealth, member.health);

  enforceWeaponHandLimit(member);
  state.battleSeed = null;
  saveSetupToStorage(state);
  renderAll();
  bsModalHide("statsDialog");
}

// --- Dialog: spell casting UI ---
function openSpellDialog() {
  if (!(state.phase === "combat" && state.turn === "party")) return;
  $("spellError").style.display = "none";
  $("spellError").textContent = "";

  // caster list: only living + not acted
  const casterSel = $("spellCaster");
  casterSel.innerHTML = "";
  state.party.forEach((p, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    const allowedCaster = isSpellcaster(p.name);
    const suffix = `${allowedCaster ? "" : " (cannot cast)"}${p.actedThisRound ? " (acted)" : ""}${(p.dead||p.health<=0) ? " (dead)" : ""}`;
    opt.textContent = `${p.name}${suffix}`;
    opt.disabled = !!(!allowedCaster || p.dead || p.health<=0 || p.actedThisRound);
    casterSel.appendChild(opt);
  });

  // spells list: disable if used by selected caster (updated on change)
  const spellSel = $("spellSelect");
    const renderSpellOptions = () => {
      spellSel.innerHTML = "";
      const cidx = Number(casterSel.value);
      const caster = state.party[cidx];
      const known = caster?.spells?.filter(s => {
        if (!s.id) return false;
        const sp = getSpellById(s.id);
        return sp?.type === "combat";
      }) || [];

      if (!known.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No combat spells prepared";
        opt.disabled = true;
        spellSel.appendChild(opt);
        spellSel.disabled = true;
      const area = $("spellTargetArea");
      area.innerHTML = `<div class="muted">${caster ? "No prepared spells for this caster." : "Select a caster."}</div>`;
      return;
    }

    spellSel.disabled = false;
    for (const entry of known) {
      const sp = getSpellById(entry.id);
      if (!sp) continue;
      const opt = document.createElement("option");
      const statusSuffix = entry.status === "exhausted" ? " (exhausted)" : "";
      opt.value = sp.id;
      opt.textContent = `${formatSpellOptionLabel(sp)}${statusSuffix}`;
      spellSel.appendChild(opt);
    }
  };

  const refreshSpellDisabled = () => {
    const cidx = Number(casterSel.value);
    const caster = state.party[cidx];
    for (const opt of [...spellSel.options]) {
      const sp = getSpellById(opt.value);
      if (!caster || !sp) { opt.disabled = true; continue; }
      const chk = canCastSpell(caster, sp);
      opt.disabled = !chk.ok;
    }
    const okBtn = $("spellOk");
    const hasEnabled = [...spellSel.options].some(o => !o.disabled);
    okBtn.disabled = spellSel.disabled || !hasEnabled;
    renderSpellTargetUI();
  };

  const renderSpellTargetUI = () => {
    const cidx = Number(casterSel.value);
    const caster = state.party[cidx];
    const sp = getSpellById(spellSel.value);
    const area = $("spellTargetArea");
    area.innerHTML = "";

    if (!caster || !sp) return;

    const chk = canCastSpell(caster, sp);
    if (!chk.ok) {
      area.innerHTML = `<div class="muted">${chk.reason}</div>`;
      return;
    }

    if (sp.targetMode === "singleEnemy") {
      area.innerHTML = `
        <div class="row">
          <label>Target (enemy)
            <select id="spellTargetEnemy0"></select>
          </label>
        </div>
      `;
      const sel = $("spellTargetEnemy0");
      state.mobs.forEach((m, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${m.name}${(m.dead||m.health<=0) ? " (dead)" : ""}`;
        opt.disabled = !!(m.dead || m.health<=0);
        sel.appendChild(opt);
      });
    }

    if (sp.targetMode === "multiEnemyDistinct") {
      const n = sp.targetCount ?? 2;
      const parts = [];
      for (let k = 0; k < n; k++) {
        parts.push(`
          <label>Target ${k+1} (enemy)
            <select id="spellTargetEnemy${k}"></select>
          </label>
        `);
      }
      area.innerHTML = `<div class="row">${parts.join("")}</div>`;

      // populate + enforce distinct by disabling chosen enemy in others
      const sels = [];
      for (let k = 0; k < n; k++) {
        const sel = $(`spellTargetEnemy${k}`);
        sels.push(sel);
        state.mobs.forEach((m, i) => {
          const opt = document.createElement("option");
          opt.value = String(i);
          opt.textContent = `${m.name}${(m.dead||m.health<=0) ? " (dead)" : ""}`;
          opt.disabled = !!(m.dead || m.health<=0);
          sel.appendChild(opt);
        });
      }
      const enforceDistinct = () => {
        const chosen = new Set(sels.map(s => s.value));
        sels.forEach((sel, idx) => {
          for (const opt of [...sel.options]) {
            const isDead = opt.textContent.includes("(dead)");
            const chosenElsewhere = chosen.has(opt.value) && sel.value !== opt.value;
            opt.disabled = isDead || chosenElsewhere;
          }
        });
      };
      sels.forEach(sel => sel.addEventListener("change", enforceDistinct));
      enforceDistinct();
    }

    if (sp.targetMode === "singleAlly") {
      area.innerHTML = `
        <div class="row">
          <label>Target (ally)
            <select id="spellTargetAlly0"></select>
          </label>
        </div>
      `;
      const sel = $("spellTargetAlly0");
      state.party.forEach((p, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${p.name}${(p.dead||p.health<=0) ? " (dead)" : ""}`;
        opt.disabled = !!(p.dead || p.health<=0);
        sel.appendChild(opt);
      });
    }
  };

  casterSel.onchange = () => { renderSpellOptions(); refreshSpellDisabled(); };
  spellSel.onchange = renderSpellTargetUI;

  renderSpellOptions();
  refreshSpellDisabled();
  bsModalShow("spellDialog");
}

function readSpellTargets(spell) {
  const targets = { enemy: [], ally: [] };
  if (spell.targetMode === "singleEnemy") {
    targets.enemy.push(Number($("spellTargetEnemy0").value));
  } else if (spell.targetMode === "multiEnemyDistinct") {
    const n = spell.targetCount ?? 2;
    for (let k = 0; k < n; k++) targets.enemy.push(Number($(`spellTargetEnemy${k}`).value));
    // validate distinct + alive handled in UI; double-check
    const set = new Set(targets.enemy);
    if (set.size !== targets.enemy.length) throw new Error("Targets must be different.");
  } else if (spell.targetMode === "singleAlly") {
    targets.ally.push(Number($("spellTargetAlly0").value));
  }
  return targets;
}

// --- Start / Restart ---
function startOrRestartCombat() {
  if (!state.party.length || !state.mobs.length) {
    pushLog("(!) Need at least 1 party member and 1 opponent to start.");
    return;
  }

  if (state.battleSeed && (state.phase === "combat" || state.phase === "ended")) {
    restoreFromSeed();
    renderAll();
    return;
  }

  state.history = [];
  state.phase = "combat";
  state.round = 1;
  state.turn = "party";
  state.enemyIndex = 0;

  normalizeForCombat();
  clearBattleBuffs(state.party);
  resetPartyRoundFlags();
  seedBattleState();

  state.log = [];
  pushLog(`=== Combat started (${nowStamp()}) ===`);
  pushLog(`--- Round 1 (Party turn) ---`);
  renderAll();
}

function endPartyTurnManual() {
  if (state.phase !== "combat" || state.turn !== "party") return;
  snapshot();
  state.turn = "enemies";
  state.enemyIndex = 0;
  pushLog(`--- Enemies turn (Round ${state.round}) ---`);
  renderAll();
}

function endCombatManual() {
  if (state.phase !== "combat") return;
  snapshot();
  state.phase = "ended";
  pushLog("=== Combat ended manually ===");
  renderAll();
}

// --- Wire UI ---
function initUI() {
  ensureStatsModalExists();
  // Buttons
  $("startCombat").addEventListener("click", startOrRestartCombat);
  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab-button").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === target));
    });
  });
  $("playerAttack").addEventListener("click", () => {
    partyAttack(Number($("playerAttacker").value), Number($("playerTarget").value));
  });
  $("playerSpell").addEventListener("click", openSpellDialog);
  $("playerSkip").addEventListener("click", () => {
    if (confirm("End the party's turn?")) endPartyTurnManual();
  });

  $("enemyResolveOne").addEventListener("click", () => resolveOneEnemyAttack(Number($("enemyVictim").value)));
  $("enemyResolveAll").addEventListener("click", () => resolveAllEnemyAttacks(Number($("enemyVictim").value)));

  $("undo").addEventListener("click", undo);
  $("endCombat").addEventListener("click", endCombatManual);

  $("clearLog").addEventListener("click", () => { state.log = []; renderLog(); });
  $("copyLog").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(state.log.join("\n")); pushLog("(log copied to clipboard)"); }
    catch { pushLog("(!) Could not copy log (clipboard permission blocked)."); }
  });

  $("addMember").addEventListener("click", openHeroDialog);
  $("clearParty").addEventListener("click", () => {
    if (!confirm("Clear party setup and saved data?")) return;
    state.party = [];
    state.battleSeed = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      obj.party = [];
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch {}
    saveSetupToStorage(state);
    renderAll();
  });
  $("addMob").addEventListener("click", () => {
    state.mobs.push(newMob());
    state.battleSeed = null;
    saveSetupToStorage(state);
    renderAll();
  });
  $("clearMobs").addEventListener("click", () => {
    if (!confirm("Clear opponents and saved data?")) return;
    state.mobs = [];
    state.battleSeed = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      obj.mobs = [];
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch {}
    saveSetupToStorage(state);
    renderAll();
  });

  // Encounter import
  $("importEncounter").addEventListener("click", () => {
    $("importError").style.display = "none";
    $("importError").textContent = "";
    $("importText").value = "";
    bsModalShow("importDialog");
  });
  $("importCancel").addEventListener("click", () => bsModalHide("importDialog"));
  $("importOk").addEventListener("click", () => {
    try {
      state.mobs = parseEncounterText($("importText").value || "");
      state.battleSeed = null;
      saveSetupToStorage(state);
      bsModalHide("importDialog");
      renderAll();
    } catch (e) {
      $("importError").textContent = String(e?.message || e);
      $("importError").style.display = "";
    }
  });

  // Hero dialog
  $("heroCancel").addEventListener("click", () => bsModalHide("heroDialog"));
  $("heroOk").addEventListener("click", () => {
    const name = $("heroNameSelect").value;
    if (!name) return;
    if (state.party.some(p => p.name === name)) return; // no duplicates

    state.party.push(newMember(name));
    state.battleSeed = null;
    saveSetupToStorage(state);
    bsModalHide("heroDialog");
    renderAll();
  });

  // Stat dialog
  $("statsCancel").addEventListener("click", () => bsModalHide("statsDialog"));
  $("statsSave").addEventListener("click", saveStatsFromDialog);

  // Spell dialog
  $("spellCancel").addEventListener("click", () => bsModalHide("spellDialog"));
  $("spellOk").addEventListener("click", () => {
    $("spellError").style.display = "none";
    $("spellError").textContent = "";

    try {
      const casterIdx = Number($("spellCaster").value);
      const spellId = $("spellSelect").value;
      const spell = getSpellById(spellId);
      if (!spell) throw new Error("Unknown spell.");
      const targets = readSpellTargets(spell);

      // final guard
      const caster = state.party[casterIdx];
      const chk = canCastSpell(caster, spell);
      if (!chk.ok) throw new Error(chk.reason);

      bsModalHide("spellDialog");
      castSpell({ casterIdx, spellId, targets });
    } catch (e) {
      $("spellError").textContent = String(e?.message || e);
      $("spellError").style.display = "";
    }
  });
}

// --- Init ---
function initState() {
  if (!loadSetupFromStorage(state)) {
    state.party = [ newMember("Akihiro of Chalice", { fighting: 4, armour: 0, health: 8, maxHealth: 8 }) ];
    state.mobs = [ { name: "Goblin", atkDice: 4, atkTarget: 5, auto: 0, defTarget: 4, health: 6, maxHealth: 6, dead: false } ];
    state.silverCoins = 0;
    saveSetupToStorage(state);
  }
}

function openHeroDialogPopulate() {
  const used = new Set(state.party.map(p => p.name));
  const available = HERO_NAMES.filter(n => !used.has(n));
  const select = $("heroNameSelect");
  select.innerHTML = "";
  for (const n of available) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    select.appendChild(opt);
  }
  $("heroOk").disabled = available.length === 0;
}

(function main() {
  syncPreferredTheme();
  initState();
  initUI();

  renderAll();
})();
