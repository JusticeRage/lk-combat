import { SPELLS, getSpellById } from "./spells.js";
import { ITEMS, getItemById } from "./items.js";
import {
  clampInt, deepClone, fmtDice, nowStamp,
  computeAttackHits, computeEnemyHits,
  armourSaveRolls, getEffectiveArmour,
  clearBattleBuffs, addBattleArmourBuff,
  rollD6
} from "./engine.js";

const HERO_NAMES = [
  "Sar Jessica Dayne",
  "Lord Ti’quon",
  "Tasha",
  "Amelia Pass-Dayne",
  "Akihiro of Chalice",
  "Brash",
];

const HERO_DEFAULT_STATS = {
  "Sar Jessica Dayne": { fighting: 5, survival: 2, stealth: 1, charisma: 4, lore: 3, health: 8, maxHealth: 8 },
  "Lord Ti’quon": { fighting: 1, survival: 1, stealth: 2, charisma: 2, lore: 5, health: 6, maxHealth: 6 },
  "Tasha": { fighting: 3, survival: 3, stealth: 5, charisma: 3, lore: 1, health: 8, maxHealth: 8 },
  "Amelia Pass-Dayne": { fighting: 3, survival: 3, stealth: 2, charisma: 1, lore: 2, health: 6, maxHealth: 6 },
  "Akihiro of Chalice": { fighting: 4, survival: 5, stealth: 3, charisma: 1, lore: 2, health: 8, maxHealth: 8 },
  "Brash": { fighting: 2, survival: 1, stealth: 4, charisma: 5, lore: 3, health: 8, maxHealth: 8 },
};

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

const CODE_BOOKS = [
  { key: "A", title: "The Valley of Bones" },
  { key: "B", title: "Crown and Tower" },
  { key: "C", title: "Pirates of the Splintered Isles" },
  { key: "D", title: "The Gilded Throne" },
  { key: "E", title: "The Savage Lands" },
  { key: "F", title: "Drakehallow" },
];

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

const SKILL_OPTIONS = [
  { key: "fighting", label: STAT_LABELS.fighting },
  { key: "stealth", label: STAT_LABELS.stealth },
  { key: "lore", label: STAT_LABELS.lore },
  { key: "survival", label: STAT_LABELS.survival },
  { key: "charisma", label: STAT_LABELS.charisma },
];

const DEFAULT_SKILL_CHECK = {
  name: "Sneak past the goblin",
  type: "team", // team | individual
  skill: "stealth",
  dc: 4,
  requiredSuccesses: 4,
  participants: [], // hero names
  latestRoll: { groups: [], totalSuccesses: 0 },
  lastResult: null,
};

const $ = (id) => document.getElementById(id);

function formatStatLabel(key) {
  const label = STAT_LABELS[key] || key;
  const icon = STAT_ICONS[key];
  return icon ? `${icon} ${label}` : label;
}

function skillLabelForKey(key) {
  const found = SKILL_OPTIONS.find(o => o.key === key);
  return found?.label || formatStatLabel(key);
}

function findSkillKeyFromName(name) {
  if (!name) return "";
  const norm = String(name).trim().toLowerCase();
  const found = SKILL_OPTIONS.find(o => o.key === norm || o.label?.toLowerCase() === norm);
  if (found) return found.key;
  const fuzzy = SKILL_OPTIONS.find(o => norm.includes(o.label?.toLowerCase()));
  return fuzzy?.key || "";
}

function normalizeSkillCheck(raw) {
  const base = { ...DEFAULT_SKILL_CHECK, participants: [...DEFAULT_SKILL_CHECK.participants] };
  if (!raw || typeof raw !== "object") return base;

  const participants = Array.isArray(raw.participants)
    ? raw.participants.filter(Boolean).slice(0, 2)
    : [];

  const lastResult = (raw.lastResult && typeof raw.lastResult === "object") ? {
    success: !!raw.lastResult.success,
    successes: clampInt(raw.lastResult.successes, 0, 999, 0),
    required: clampInt(raw.lastResult.required, 1, 999, base.requiredSuccesses),
    diceUsed: clampInt(raw.lastResult.diceUsed, 0, 999, 0),
    rawDice: clampInt(raw.lastResult.rawDice, 0, 999, 0),
    capped: !!raw.lastResult.capped,
    participants: Array.isArray(raw.lastResult.participants)
      ? raw.lastResult.participants.filter(Boolean).slice(0, 2)
      : [],
  } : null;

  return {
    ...base,
    name: typeof raw.name === "string" ? raw.name : base.name,
    type: raw.type === "team" ? "team" : "individual",
    skill: SKILL_OPTIONS.some(o => o.key === raw.skill) ? raw.skill : base.skill,
    dc: clampInt(raw.dc, 2, 6, base.dc),
    requiredSuccesses: clampInt(raw.requiredSuccesses, 1, 99, base.requiredSuccesses),
    participants,
    latestRoll: buildLatestRoll(raw.latestRoll?.groups || []),
    lastResult,
  };
}

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
              <label class="form-label small text-secondary mb-1" for="statFighting">⚔️ Fighting</label>
              <input type="number" min="0" max="50" id="statFighting" class="form-control">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statStealth">🥷🏻 Stealth</label>
              <input type="number" min="0" max="50" id="statStealth" class="form-control">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statLore">📚 Lore</label>
              <input type="number" min="0" max="50" id="statLore" class="form-control">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statSurvival">🏕️ Survival</label>
              <input type="number" min="0" max="50" id="statSurvival" class="form-control">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statCharisma">💬 Charisma</label>
              <input type="number" min="0" max="50" id="statCharisma" class="form-control">
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small text-secondary mb-1" for="statArmour">🛡️ Armour</label>
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

function summarizeSpellEffect(spell) {
  if (!spell?.steps?.length) return "No spell effect details available.";
  const describeStep = (step) => {
    if (!step || typeof step !== "object") return "Mystical energies swirl.";
    if (step.type === "attackFixed") {
      const times = clampInt(step.times, 1, 99, 1);
      const attacks = times === 1 ? "an attack" : `${times} attacks`;
      const targetNote = step.mustBeDifferentTargets ? " at different targets" : "";
      return `Make ${attacks} at Fighting ${step.fighting || 0}${targetNote}.`;
    }
    if (step.type === "damageFixed") {
      const bypass = step.bypassDefence ? " (ignores defence)" : "";
      return `Deal ${step.amount || 0} damage${bypass}.`;
    }
    if (step.type === "buffArmour") {
      const duration = step.duration === "battle" ? " for this battle" : "";
      return `Grant +${step.amount || 0} Armour${duration}.`;
    }
    if (step.type === "healFixed") {
      return `Heal ${step.amount || 0} HP.`;
    }
    return "A strange magical effect occurs.";
  };
  return spell.steps.map(describeStep).join(" ");
}

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

const createEmptyCodes = () => Object.fromEntries(CODE_BOOKS.map(book => [book.key, Array(100).fill(false)]));

function normalizeCodes(raw) {
  const base = createEmptyCodes();
  if (!raw || typeof raw !== "object") return base;
  for (const book of CODE_BOOKS) {
    const arr = Array.isArray(raw[book.key]) ? raw[book.key] : [];
    base[book.key] = Array.from({ length: 100 }, (_, idx) => Boolean(arr[idx]));
  }
  return base;
}

function normalizeBookKey(key) {
  const exists = CODE_BOOKS.some(book => book.key === key);
  return exists ? key : (CODE_BOOKS[0]?.key || "A");
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
  if (equipped === null) {
    equipped = item?.type === "weapon" ? true : false;
  }
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
    const requiresEquipped = item.type === "weapon" || !!item.hands;
    if (requiresEquipped && !entry.equipped) continue;
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
    const requiresHands = item?.hands && (item.type === "weapon" || entry.equipped);
    if (requiresHands) {
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
  return `${formatStatLabel(key)}: ${stat.base} (${stat.modified})`;
}

function formatCompactStat(stat) {
  return (stat?.modified === stat?.base)
    ? `${stat.modified}`
    : `${stat.base} (${stat.modified})`;
}

function renderHpBlock(entity) {
  const current = Math.max(0, entity?.health ?? 0);
  const max = Math.max(1, entity?.maxHealth ?? 1);
  const pct = Math.min(100, Math.max(0, (current / max) * 100));
  const hpClass = getHpBarClass(pct);
  return `
    <div class="lk-hp" aria-label="Hit points">
      <div class="lk-hp-head">
        <span class="lk-hp-title">HP</span>
        <span class="lk-hp-num">${current}/${max}</span>
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${current}" aria-valuemin="0" aria-valuemax="${max}">
        <div class="progress-bar${hpClass ? ` ${hpClass}` : ""}" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

function renderPortraitHp(hero) {
  const current = Math.max(0, hero?.health ?? 0);
  const max = Math.max(1, hero?.maxHealth ?? 1);
  const pct = Math.min(100, Math.max(0, (current / max) * 100));
  const hpClass = getHpBarClass(pct);
  return `
    <div class="lk-portrait-hp" aria-label="Hit points">
      <div class="lk-portrait-hp-head">
        <span class="lk-portrait-hp-title">HP</span>
        <span class="lk-portrait-hp-num">${current}/${max}</span>
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${current}" aria-valuemin="0" aria-valuemax="${max}">
        <div class="progress-bar${hpClass ? ` ${hpClass}` : ""}" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

function getHpBarClass(pct) {
  if (pct < 25) return "bg-danger";
  if (pct < 50) return "bg-warning";
  return "";
}

function renderStatGrid(hero) {
  const stats = computeDisplayedStats(hero);
  const order = ["fighting", "armour", "stealth", "lore", "survival", "charisma"];
  return `
    <div class="lk-stat-grid">
      ${order.map(key => `
        <div class="lk-stat-label">${formatStatLabel(key)}</div>
        <div class="lk-stat-value">${escapeHtml(formatCompactStat(stats[key]))}</div>
      `).join("")}
    </div>
  `;
}

function describeItem(item, entry) {
  if (!item) return "No item";
  const details = [];
  const mods = Object.entries(item.modifiers || {}).filter(([, v]) => v);
  if (mods.length) {
    details.push(mods.map(([k, v]) => `${formatStatLabel(k)}${v >= 0 ? "+" : ""}${v}`).join(", "));
  }
  if (item.hands) details.push(item.hands === 2 ? "Two-handed" : "One-handed");
  if (item.type === "weapon") details.push("Weapon");
  if (item.type === "weapon" || item.hands) details.push(entry?.equipped ? "Equipped" : "Unequipped");
  if (item.countable) details.push(`Count: ${entry?.count || 1}`);
  return details.join(" • ");
}

function normalizeVaultItems(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(entry => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function saveSetupToStorage(state) {
  state.codes = normalizeCodes(state.codes);
  state.selectedCodeBook = normalizeBookKey(state.selectedCodeBook);
  state.vault = normalizeVaultItems(state.vault);
  state.missionNotes = typeof state.missionNotes === "string" ? state.missionNotes : "";
  const payload = {
    silverCoins: state.silverCoins || 0,
    vault: state.vault,
    missionNotes: state.missionNotes,
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
    })),
    codes: state.codes,
    selectedCodeBook: state.selectedCodeBook,
    skillCheck: {
      name: state.skillCheck.name,
      type: state.skillCheck.type,
      skill: state.skillCheck.skill,
      dc: state.skillCheck.dc,
      requiredSuccesses: state.skillCheck.requiredSuccesses,
      participants: state.skillCheck.participants,
      latestRoll: state.skillCheck.latestRoll,
      lastResult: state.skillCheck.lastResult,
    },
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch {}
}

function loadSetupFromStorage(state) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return false;

    state.codes = normalizeCodes(obj.codes);
    state.selectedCodeBook = normalizeBookKey(obj.selectedCodeBook);

    state.silverCoins = clampInt(obj.silverCoins, 0, 999999, 0);
    state.vault = normalizeVaultItems(obj.vault);
    state.missionNotes = typeof obj.missionNotes === "string" ? obj.missionNotes : "";

    if (Array.isArray(obj.party)) {
      const seen = new Set();
      state.party = obj.party
        .filter(p => p && HERO_NAMES.includes(p.name) && !seen.has(p.name) && (seen.add(p.name), true))
        .slice(0, 4)
        .map(p => newMember(p.name, p));
      state.selectedPartyIndex = 0;
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

    state.skillCheck = normalizeSkillCheck(obj.skillCheck);

    return true;
  } catch {
    return false;
  }
}

function newMember(name, seed = null) {
  const defaults = HERO_DEFAULT_STATS[name] || {};
  const base = {
    name,
    fighting: defaults.fighting ?? 3,
    stealth: defaults.stealth ?? 0,
    lore: defaults.lore ?? 0,
    survival: defaults.survival ?? 0,
    charisma: defaults.charisma ?? 0,
    armour: defaults.armour ?? 0,
    health: defaults.health ?? 8,
    maxHealth: defaults.maxHealth ?? defaults.health ?? 8,
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

// --- Skill checks ---
function getSkillValueFor(member, skillKey) {
  if (!member || !skillKey) return 0;
  return Math.max(0, getEffectiveStat(member, skillKey));
}

function computeSkillDice(skillKey, heroes) {
  const rawDice = (heroes || []).reduce((sum, h) => sum + getSkillValueFor(h, skillKey), 0);
  return { rawDice, dice: Math.min(rawDice, 20), capped: rawDice > 20 };
}

function parseSkillCheckImport(text) {
  const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) throw new Error("Need at least 3 lines (name, skill, successes).");

  const titleLine = lines[0];
  const titleMatch = titleLine.match(/^(.*)\((Individual|Team)\s+check\)\s*$/i);
  if (!titleMatch) throw new Error("First line should include '(Individual check)' or '(Team check)'.");
  const name = titleMatch[1].trim();
  const type = titleMatch[2].toLowerCase().startsWith("team") ? "team" : "individual";

  const skillLine = lines.find(l => /^skill\s*and\s*dc/i.test(l)) || lines[1];
  const skillMatch = skillLine?.match(/skill\s*and\s*dc:\s*(.+?)\s*\(\s*([2-6])\s*\+\s*\)\s*$/i);
  if (!skillMatch) throw new Error("Could not read the 'Skill and DC' line.");
  const skillKey = findSkillKeyFromName(skillMatch[1]);
  if (!skillKey) throw new Error(`Unknown skill: ${skillMatch[1]}`);
  const dc = Number(skillMatch[2]);

  const successLine = lines.find(l => /^successes\s+required/i.test(l)) || lines[2];
  const successMatch = successLine?.match(/successes\s+required:\s*(\d+)/i);
  if (!successMatch) throw new Error("Could not read the required successes.");
  const requiredSuccesses = Number(successMatch[1]);

  return normalizeSkillCheck({ name, type, skill: skillKey, dc, requiredSuccesses, participants: [] });
}

// --- State ---
const state = {
  phase: "setup", // setup | combat | ended
  round: 1,
  turn: "party", // party | enemies
  party: [],
  silverCoins: 0,
  vault: [],
  missionNotes: "",
  mobs: [],
  enemyIndex: 0,
  log: [],
  history: [],
  battleSeed: null,   // snapshot for restart
  selectedPartyIndex: 0,
  codes: createEmptyCodes(),
  selectedCodeBook: CODE_BOOKS[0]?.key || "A",
  latestRoll: { groups: [], totalSuccesses: 0 },
  skillCheck: normalizeSkillCheck(DEFAULT_SKILL_CHECK),
};

function buildLatestRoll(groups) {
  const norm = Array.isArray(groups) ? groups : [];
  const built = norm.map(entry => {
    const rolls = Array.isArray(entry?.rolls) ? entry.rolls : [];
    let successMask = Array.isArray(entry?.successMask) ? entry.successMask.map(Boolean) : [];

    if (successMask.length !== rolls.length) {
      successMask = rolls.map((r, idx) => entry?.successPredicate
        ? entry.successPredicate(r, idx)
        : (entry?.target != null ? r >= entry.target : false));
    }

    return {
      rolls: [...rolls],
      successes: successMask.filter(Boolean).length,
      successMask,
      label: entry?.label ? String(entry.label) : "",
    };
  });

  return {
    groups: built,
    totalSuccesses: built.reduce((sum, g) => sum + (g.successes || 0), 0),
  };
}

function recordLatestRoll(entry) {
  state.latestRoll = buildLatestRoll([entry]);
}

function recordLatestRollGroups(groups) {
  state.latestRoll = buildLatestRoll(groups);
}

function pushLog(line) {
  state.log.push(line);
  renderLog();
}

function renderLog() {
  const el = $("log");
  el.textContent = state.log.join("\n");
  el.scrollTop = el.scrollHeight;
}

function renderRollDisplay(opts) {
  const wrap = $(opts?.wrapId);
  const title = opts?.titleId ? $(opts.titleId) : null;
  if (!wrap) return;
  const lr = opts?.roll || { groups: [], totalSuccesses: 0 };
  const groups = Array.isArray(lr.groups) ? lr.groups : [];
  const hasRolls = groups.some(g => Array.isArray(g.rolls) && g.rolls.length > 0);
  const required = Number.isFinite(opts?.requiredSuccesses) ? opts.requiredSuccesses : null;

  const groupHtml = groups.map(group => {
    const rolls = Array.isArray(group.rolls) ? group.rolls : [];
    const mask = Array.isArray(group.successMask) ? group.successMask : [];
    const diceHtml = rolls.map((r, idx) => {
      const face = Math.min(6, Math.max(1, Number(r) || 1));
      const isSuccess = !!mask[idx];
      const cls = `lk-die${isSuccess ? " is-success" : ""}`;
      return `<div class="${cls}"><img src="./img/dice_${face}.svg" alt="Die showing ${face}"></div>`;
    }).join("");

    const label = group.label ? `<div class="lk-roll-label">${escapeHtml(group.label)}</div>` : "";

    return `<div class="lk-roll-group">${label}<div class="lk-dice-row">${diceHtml}</div></div>`;
  }).join("");

  if (title) title.textContent = hasRolls
    ? (required != null ? `Latest roll: ${lr.totalSuccesses || 0}/${required} 💥` : `Latest roll: ${lr.totalSuccesses || 0} 💥`)
    : (opts?.emptyTitle || "Latest roll");

  wrap.innerHTML = hasRolls
    ? groupHtml
    : `<div class="text-body-secondary small">${opts?.emptyText || "No rolls yet."}</div>`;
}

function renderLatestRoll() {
  renderRollDisplay({ wrapId: "latestRoll", titleId: "latestRollTitle", roll: state.latestRoll, emptyText: "No rolls yet." });
}

function snapshot() {
  state.history.push(deepClone({
    phase: state.phase, round: state.round, turn: state.turn,
    party: state.party, mobs: state.mobs, enemyIndex: state.enemyIndex,
    log: state.log, battleSeed: state.battleSeed, selectedPartyIndex: state.selectedPartyIndex,
    latestRoll: state.latestRoll,
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
  state.selectedPartyIndex = Number.isInteger(last.selectedPartyIndex) ? last.selectedPartyIndex : 0;
  state.latestRoll = last.latestRoll || { groups: [], totalSuccesses: 0 };
  clampSelectedPartyIndex();
  renderAll();
}

const livingParty = () => state.party.filter(p => !p.dead && p.health > 0);
const livingMobs = () => state.mobs.filter(m => !m.dead && m.health > 0);

function clampEnemyIndex() {
  while (state.enemyIndex < state.mobs.length && (state.mobs[state.enemyIndex].dead || state.mobs[state.enemyIndex].health <= 0)) {
    state.enemyIndex++;
  }

  if (state.enemyIndex >= state.mobs.length) {
    const next = state.mobs.findIndex(m => !m.dead && m.health > 0);
    state.enemyIndex = next >= 0 ? next : 0;
  }
}

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
  clampSelectedPartyIndex();
  state.mobs = deepClone(state.battleSeed.mobs).map(m => ({ ...m, dead: false, health: m.maxHealth }));
  state.log = [];
  state.latestRoll = { groups: [], totalSuccesses: 0 };
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

    clampEnemyIndex();
    if (state.enemyIndex >= state.mobs.length || (state.mobs[state.enemyIndex]?.dead || state.mobs[state.enemyIndex]?.health <= 0)) {
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
  recordLatestRoll({ rolls, target: target.defTarget });

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

  clampEnemyIndex();
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
    recordLatestRollGroups([
      { rolls, target: mob.atkTarget, label: `${mob.name} attack` },
      { rolls: save.rolls, target: 4, label: `${victim.name} armour save` },
    ]);
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

    clampEnemyIndex();
    if (state.enemyIndex >= state.mobs.length || (state.mobs[state.enemyIndex]?.dead || state.mobs[state.enemyIndex]?.health <= 0)) {
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
        recordLatestRoll({ rolls, target: mob.defTarget });
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
function clampSelectedPartyIndex() {
  if (!Array.isArray(state.party) || state.party.length === 0) {
    state.selectedPartyIndex = 0;
    return;
  }
  const current = Number.isInteger(state.selectedPartyIndex) ? state.selectedPartyIndex : 0;
  state.selectedPartyIndex = Math.min(Math.max(current, 0), state.party.length - 1);
}

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
      <div class="lk-resource-icon" aria-hidden="true">👛</div>
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

  clampSelectedPartyIndex();

  const layout = document.createElement("div");
  layout.className = "lk-party-shell";

  const rail = document.createElement("div");
  rail.className = "lk-portrait-rail";

  state.party.forEach((p, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `lk-portrait-tab${idx === state.selectedPartyIndex ? " is-active" : ""}`;
    btn.setAttribute("data-hero-tab", String(idx));
    btn.setAttribute("aria-pressed", idx === state.selectedPartyIndex ? "true" : "false");
    btn.innerHTML = `
      <img src="${getHeroImage(p.name)}" alt="${escapeHtml(p.name)} portrait" class="lk-portrait-thumb">
      <div class="text-start">
        <p class="lk-portrait-name mb-1">${escapeHtml(p.name)}</p>
        ${renderPortraitHp(p)}
      </div>
    `;
    rail.appendChild(btn);
  });

  if (!state.party.length) {
    rail.innerHTML = `<div class="lk-empty-sheet">No party portraits yet.</div>`;
  }

  layout.appendChild(rail);

  const detailArea = document.createElement("div");

  if (!state.party.length) {
    detailArea.innerHTML = `<div class="lk-empty-sheet">Add up to four heroes to start managing their sheets.</div>`;
  } else {
    const p = state.party[state.selectedPartyIndex];
    enforceWeaponHandLimit(p);
    const equipment = normalizeEquipmentList(p.equipment, { keepEmpty: true });

    const equipmentRows = equipment.map((eqRaw, slot) => {
      const eq = normalizeEquipmentEntry(eqRaw);
      const item = getEquipmentItem(eq);
      const isWeapon = item?.type === "weapon";
      const requiresEquipped = isWeapon || !!item?.hands;
      const itemLabel = escapeHtml(item?.name || eq.custom || "");
      const detailText = item ? describeItem(item, eq) : (eq.custom ? "Custom item" : "No item");
      const spells = Array.isArray(eq.spells) ? eq.spells.filter(Boolean) : [];
      const equippedId = `equip-${state.selectedPartyIndex}-${slot}`;
      const spellBadge = spells.length ? `<span class="badge text-bg-info lk-badge">Spell ×${spells.length}</span>` : "";
      const spellDetails = spells.length ? `
        <tr class="lk-details">
          <td colspan="3">
            <details class="lk-details__inner">
              <summary>Spells (${spells.length})</summary>
              <div class="lk-details__body">
                ${spells.map((sp, idx) => `<div class="lk-details__row">${escapeHtml(typeof sp === "string" ? sp : sp?.name || sp?.id || `Spell ${idx + 1}`)}</div>`).join("")}
              </div>
            </details>
          </td>
        </tr>
      ` : "";

      return `
        <tr>
          <td>
            <div class="d-flex flex-column gap-2">
              <div class="d-flex flex-wrap align-items-center gap-2">
                <input type="text" class="form-control form-control-sm" list="itemOptions" data-k="equipment" data-field="name" data-ei="${slot}" data-i="${state.selectedPartyIndex}" value="${itemLabel}" placeholder="Item name" aria-label="Item name">
                ${spellBadge}
              </div>
              ${item?.countable ? `
                <div class="d-flex align-items-center gap-2">
                  <label class="form-label small mb-0" for="count-${state.selectedPartyIndex}-${slot}">Count</label>
                  <input id="count-${state.selectedPartyIndex}-${slot}" type="number" class="form-control form-control-sm w-auto" min="1" max="999" data-k="equipment" data-field="count" data-ei="${slot}" data-i="${state.selectedPartyIndex}" value="${eq.count || 1}">
                </div>
              ` : ""}
              ${detailText ? `<div class="text-body-secondary small">${escapeHtml(detailText)}</div>` : ""}
            </div>
          </td>
          <td class="text-center">
            ${requiresEquipped ? `
              <div class="form-check form-switch lk-equip-switch">
                <input class="form-check-input" type="checkbox" data-k="equipment" data-field="equipped" data-ei="${slot}" data-i="${state.selectedPartyIndex}" ${eq.equipped ? "checked" : ""} id="${equippedId}">
                <label class="form-check-label" for="${equippedId}">Equipped</label>
              </div>
            ` : `<span class="text-body-secondary small">—</span>`}
          </td>
          <td class="lk-actions-col">
            <div class="lk-actions">
              <button class="btn btn-outline-danger btn-sm lk-icon-btn" data-del-equipment="${slot}" data-i="${state.selectedPartyIndex}" aria-label="Remove item">
                <i class="bi bi-trash" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>
        ${spellDetails}
      `;
    }).join("");

    const equipmentMeta = `
      <div class="d-flex justify-content-between align-items-center equipment-meta">
        <div class="text-body-secondary small">${equipment.length}/${EQUIPMENT_SLOTS} slots used</div>
        <button class="btn btn-outline-primary btn-sm" data-add-equipment="${state.selectedPartyIndex}" ${equipment.length >= EQUIPMENT_SLOTS ? "disabled" : ""}>Add slot</button>
      </div>
    `;

    const isCaster = isSpellcaster(p.name);
    const spellRows = [];
    if (isCaster) {
      const knownSpells = Array.isArray(p.spells)
        ? Array.from({ length: SPELL_SLOTS }, (_, i) => p.spells[i] || { id: "", status: "ready" })
        : [];
      for (let i = 0; i < SPELL_SLOTS; i++) {
        const entry = knownSpells[i] || { id: "", status: "ready" };
        const selectId = `spell-${state.selectedPartyIndex}-${i}-select`;
        const chargedId = `spell-${state.selectedPartyIndex}-${i}-charged`;
        spellRows.push(`
          <div class="spell-row">
            <div>
              <label class="form-label mb-1" for="${selectId}">Spell ${i + 1}</label>
              <select id="${selectId}" data-k="spellId" data-si="${i}" data-i="${state.selectedPartyIndex}" class="form-select form-select-sm">
                <option value="">— None —</option>
                ${SPELLS.map(sp => `<option value="${sp.id}" ${entry.id === sp.id ? "selected" : ""}>${escapeHtml(formatSpellOptionLabel(sp))}</option>`).join("")}
              </select>
            </div>
            <div class="form-check mb-0 align-self-end">
              <input class="form-check-input" type="checkbox" data-k="spellStatus" data-si="${i}" data-i="${state.selectedPartyIndex}" ${entry.status !== "exhausted" ? "checked" : ""} id="${chargedId}">
              <label class="form-check-label" for="${chargedId}">Charged</label>
            </div>
          </div>
        `);
      }
    }

    const notesSection = `
      <div class="lk-section">
        <div class="lk-section-heading">
          <p class="lk-section-title mb-0">Notes</p>
          <span class="text-secondary small">Reminders for this hero</span>
        </div>
        <textarea data-k="notes" data-i="${state.selectedPartyIndex}" spellcheck="false" class="form-control lk-notes">${escapeHtml(p.notes || "")}</textarea>
      </div>
    `;

    const spellsSection = isCaster ? `
      <div class="lk-section lk-section--wide">
        <div class="lk-section-heading">
          <p class="lk-section-title mb-0">Spells</p>
          <span class="text-secondary small">${spellRows.length} slots</span>
        </div>
        <div class="spell-card">
          <div class="spell-body">${spellRows.join("")}</div>
        </div>
      </div>
    ` : "";

    const sheet = document.createElement("div");
    sheet.className = "lk-party-sheet";
    sheet.innerHTML = `
      <div class="lk-sheet__header">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div class="d-flex flex-column flex-grow-1 gap-3">
            ${renderHpBlock(p)}
            ${renderStatGrid(p)}
          </div>
          <div class="lk-sheet__cta">
            <button class="btn btn-outline-secondary btn-sm lk-icon-btn" data-edit-stats="${state.selectedPartyIndex}" aria-label="Edit stats">
              <i class="bi bi-pencil" aria-hidden="true"></i>
            </button>
            <button class="btn btn-outline-danger btn-sm lk-icon-btn" data-del-party="${state.selectedPartyIndex}" aria-label="Remove hero">
              <i class="bi bi-trash" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>
      <div class="lk-sheet__body">
        <div class="lk-sheet__grid">
          <div class="lk-section">
            <div class="lk-section-heading">
              <p class="lk-section-title mb-0">Equipment</p>
              <span class="text-body-secondary small">Weapons, armour, and gear</span>
            </div>
            <div class="lk-table table-responsive">
              <table class="table align-middle mb-0">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col" class="text-center">Equipped</th>
                    <th scope="col" class="lk-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>${equipmentRows || `<tr><td colspan="3" class="text-body-secondary small">No equipment yet.</td></tr>`}</tbody>
              </table>
            </div>
            ${equipmentMeta}
          </div>
          ${notesSection}
        </div>
        ${spellsSection}
      </div>
    `;

    detailArea.appendChild(sheet);
  }

    layout.appendChild(detailArea);
    pe.appendChild(layout);
    renderVaultSection();
    renderMissionNotes();

    const me = $("mobEditor");
    me.innerHTML = "";
    state.mobs.forEach((m, idx) => {
      const div = document.createElement("div");
      const idPrefix = `mob-${idx}`;
      div.className = "card mb-3 shadow-sm";
      div.innerHTML = `
        <div class="card-body">
          <div class="row g-3 align-items-end">
            <div class="col-sm-6 col-lg-4">
              <label class="form-label mb-1" for="${idPrefix}-name">Name</label>
              <input id="${idPrefix}-name" type="text" class="form-control form-control-sm" data-mk="name" data-mi="${idx}" value="${escapeHtml(m.name)}">
            </div>
            <div class="col-6 col-md-4 col-lg-2">
              <label class="form-label mb-1" for="${idPrefix}-atkDice">🎲 Atk dice</label>
              <input id="${idPrefix}-atkDice" type="number" class="form-control form-control-sm" min="0" max="50" data-mk="atkDice" data-mi="${idx}" value="${m.atkDice}">
            </div>
            <div class="col-6 col-md-4 col-lg-2">
              <label class="form-label mb-1" for="${idPrefix}-atkTarget">⚔️ Atk target</label>
              <input id="${idPrefix}-atkTarget" type="number" class="form-control form-control-sm" min="2" max="6" data-mk="atkTarget" data-mi="${idx}" value="${m.atkTarget}">
            </div>
            <div class="col-6 col-md-4 col-lg-2">
              <label class="form-label mb-1" for="${idPrefix}-auto">Auto dmg</label>
              <input id="${idPrefix}-auto" type="number" class="form-control form-control-sm" min="0" max="50" data-mk="auto" data-mi="${idx}" value="${m.auto}">
            </div>
            <div class="col-6 col-md-4 col-lg-2">
              <label class="form-label mb-1" for="${idPrefix}-defTarget">🛡️ Def target</label>
              <input id="${idPrefix}-defTarget" type="number" class="form-control form-control-sm" min="2" max="6" data-mk="defTarget" data-mi="${idx}" value="${m.defTarget}">
            </div>
            <div class="col-6 col-md-4 col-lg-2">
              <label class="form-label mb-1" for="${idPrefix}-maxHealth">Max HP</label>
              <input id="${idPrefix}-maxHealth" type="number" class="form-control form-control-sm" min="1" max="999" data-mk="maxHealth" data-mi="${idx}" value="${m.maxHealth}">
            </div>
            <div class="col-6 col-md-4 col-lg-2">
              <label class="form-label mb-1" for="${idPrefix}-health">HP</label>
              <input id="${idPrefix}-health" type="number" class="form-control form-control-sm" min="0" max="999" data-mk="health" data-mi="${idx}" value="${m.health}">
            </div>
            <div class="col-12 col-md-auto ms-auto text-end">
              <button class="btn btn-outline-danger btn-sm lk-icon-btn" data-del-mob="${idx}" aria-label="Remove opponent">
                <i class="bi bi-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      `;
      me.appendChild(div);
    });

  pe.querySelectorAll("[data-hero-tab]").forEach(el => el.addEventListener("click", (e) => {
    const i = Number(el.getAttribute("data-hero-tab"));
    if (Number.isNaN(i)) return;
    state.selectedPartyIndex = i;
    renderAll();
  }));

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
    clampSelectedPartyIndex();
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

  function renderVaultSection() {
    const listEl = $("vaultList");
    const input = $("vaultInput");
    const addBtn = $("vaultAdd");
    state.vault = normalizeVaultItems(state.vault);

    if (input) {
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addVaultItem(input.value);
        }
      };
    }

    if (addBtn) addBtn.onclick = () => addVaultItem(input?.value || "");

    if (!listEl) return;

    if (!state.vault.length) {
      listEl.innerHTML = `<div class="lk-vault-empty">The vault is empty.</div>`;
      return;
    }

    listEl.innerHTML = state.vault.map((entry, idx) => `
      <div class="lk-vault-item">
        <div class="lk-vault-name">${escapeHtml(entry)}</div>
        <div class="lk-vault-actions">
          <button class="btn btn-outline-danger btn-sm lk-icon-btn" data-del-vault="${idx}" aria-label="Remove item">
            <i class="bi bi-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `).join("");

    listEl.querySelectorAll("[data-del-vault]").forEach(el => el.addEventListener("click", (e) => {
      const idx = Number(el.getAttribute("data-del-vault"));
      removeVaultItem(idx);
    }));
  }

  function renderMissionNotes() {
    const notes = $("missionNotes");
    if (!notes) return;
    notes.value = state.missionNotes || "";
    notes.oninput = (e) => {
      state.missionNotes = e.target.value || "";
      saveSetupToStorage(state);
    };
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
      const charged = (el.type === "checkbox") ? !!el.checked : el.value !== "exhausted";
      p.spells[slot] = { id, status: charged ? "ready" : "exhausted" };
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

function addVaultItem(raw) {
  const text = (raw || "").trim();
  if (!text) return;
  state.vault.push(text);
  state.battleSeed = null;
  saveSetupToStorage(state);
  const input = $("vaultInput");
  if (input) input.value = "";
  renderVaultSection();
}

function removeVaultItem(idx) {
  if (!Array.isArray(state.vault) || idx < 0 || idx >= state.vault.length) return;
  state.vault.splice(idx, 1);
  state.battleSeed = null;
  saveSetupToStorage(state);
  renderVaultSection();
}

function renderTables() {
  const pt = $("partyTable");
  if (!state.party.length) {
    pt.innerHTML = `<div class="text-body-secondary">No party members.</div>`;
  } else {
    const rows = state.party.map(p => {
      enforceWeaponHandLimit(p);
      const acted = (state.phase === "combat" && state.turn === "party")
        ? (p.actedThisRound ? `<span class="badge text-bg-secondary ms-2">Acted</span>` : `<span class="badge text-bg-success ms-2">Ready</span>`)
        : "";
      const stats = computeDisplayedStats(p);
      return `
        <tr class="${(p.dead||p.health<=0) ? "dead" : ""}">
          <td>
            <div class="d-flex flex-wrap align-items-center gap-2">
              <span>${escapeHtml(p.name)}</span>
              ${acted}
            </div>
          </td>
          <td class="lk-stat-value">${escapeHtml(formatCompactStat(stats.fighting))}</td>
          <td class="lk-stat-value">${escapeHtml(formatCompactStat(stats.armour))}</td>
          <td>${renderHpBlock(p)}</td>
        </tr>
      `;
    }).join("");
    pt.innerHTML = `
      <table class="table align-middle mb-0">
        <thead><tr><th>Hero</th><th>⚔️ Fight</th><th>🛡️ Arm</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  const mt = $("mobTable");
  if (!state.mobs.length) {
    mt.innerHTML = `<div class="text-body-secondary">No opponents.</div>`;
  } else {
    const rows = state.mobs.map((m, idx) => `
        <tr class="${(m.dead||m.health<=0) ? "dead" : ""}">
        <td>${m.name}</td>
        <td>🎲 ${m.atkDice} (⚔️ ${m.atkTarget}+ )${m.auto ? ` +${m.auto} Auto` : ""}</td>
        <td>🛡️ ${m.defTarget}+</td>
        <td>${renderHpBlock(m)}</td>
        <td class="text-body-secondary">${state.turn==="enemies" && idx===state.enemyIndex ? "← acting" : ""}</td>
      </tr>
    `).join("");
    mt.innerHTML = `
      <table class="table align-middle mb-0">
        <thead><tr><th>Name</th><th>Attack</th><th>🛡️ Def</th><th></th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
}

function updatePlayerActionControls() {
  const pa = $("playerAttacker");
  const inCombat = state.phase === "combat";
  const partyTurn = inCombat && state.turn === "party";

  const canPartyAct = partyTurn &&
    state.party.some(p => !p.dead && p.health > 0 && !p.actedThisRound) &&
    livingMobs().length > 0;

  const selectedAttacker = state.party[Number(pa?.value)];
  const selectedIsCaster = !!selectedAttacker && isSpellcaster(selectedAttacker.name);
  const canCastSelected = partyTurn && !!selectedAttacker &&
    !selectedAttacker.dead && selectedAttacker.health > 0 && !selectedAttacker.actedThisRound &&
    selectedIsCaster && livingMobs().length > 0;

  if ($("playerAttack")) $("playerAttack").disabled = !canPartyAct;
  if ($("playerSpell")) {
    $("playerSpell").style.display = selectedIsCaster ? "" : "none";
    $("playerSpell").disabled = !canCastSelected;
  }
  if ($("playerSkip")) $("playerSkip").disabled = !partyTurn;
}

function renderControls() {
  $("phasePill").textContent = `Phase: ${state.phase}`;
  $("roundPill").textContent = `Round: ${state.round}`;
  $("turnPill").textContent = `Turn: ${state.turn}`;

  clampEnemyIndex();

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

  if (!pa.value || pa.options[pa.selectedIndex]?.disabled) {
    const firstReady = [...pa.options].find(o => !o.disabled);
    if (firstReady) pa.value = firstReady.value;
  }

  for (let i = 0; i < state.mobs.length; i++) {
    const m = state.mobs[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${m.name}${(m.dead || m.health <= 0) ? " (dead)" : ""}`;
    opt.disabled = !!(m.dead || m.health <= 0);
    pt.appendChild(opt);
  }

  updatePlayerActionControls();

  // enemy controls
  const ec = $("enemyCurrent");
  ec.innerHTML = "";
  for (let i = 0; i < state.mobs.length; i++) {
    const m = state.mobs[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${m.name}${(m.dead || m.health <= 0) ? " (dead)" : ""}`;
    opt.disabled = !!(m.dead || m.health <= 0);
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

function renderCodes() {
  const tabArea = $("codeBookTabs");
  const gridArea = $("codeGrid");
  if (!tabArea || !gridArea) return;

  state.codes = normalizeCodes(state.codes);
  state.selectedCodeBook = normalizeBookKey(state.selectedCodeBook);
  const activeKey = state.selectedCodeBook;

  tabArea.innerHTML = CODE_BOOKS.map(book => `
    <button type="button" class="lk-code-tab${book.key === activeKey ? " is-active" : ""}" data-code-book="${book.key}" aria-pressed="${book.key === activeKey ? "true" : "false"}">
      <p class="lk-code-tab__title mb-0">${escapeHtml(`${book.title} (${book.key})`)}</p>
    </button>
  `).join("");

  const codes = state.codes[activeKey] || [];
  const cells = [];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const num = row + 1 + (col * 10);
      const idx = num - 1;
      const codeId = `${activeKey}${num}`;
      cells.push(`
        <label class="lk-code-cell form-check mb-0" for="code-${codeId}">
          <input class="form-check-input" type="checkbox" id="code-${codeId}" data-code-book="${activeKey}" data-code-index="${idx}" ${codes[idx] ? "checked" : ""}>
          <span class="lk-code-label">${escapeHtml(codeId)}</span>
        </label>
      `);
    }
  }

  gridArea.innerHTML = `<div class="lk-code-grid" role="grid">${cells.join("")}</div>`;

  tabArea.querySelectorAll("[data-code-book]").forEach(btn => btn.addEventListener("click", () => {
    state.selectedCodeBook = normalizeBookKey(btn.getAttribute("data-code-book"));
    saveSetupToStorage(state);
    renderCodes();
  }));

  gridArea.querySelectorAll("input[data-code-index]").forEach(input => input.addEventListener("change", onCodeToggle));
}

function onCodeToggle(e) {
  const book = e.target.getAttribute("data-code-book");
  const idx = Number(e.target.getAttribute("data-code-index"));
  if (!book || Number.isNaN(idx) || idx < 0 || idx >= 100) return;
  state.codes = normalizeCodes(state.codes);
  state.codes[book][idx] = !!e.target.checked;
  saveSetupToStorage(state);
}

function getSkillParticipants() {
  const sc = state.skillCheck || DEFAULT_SKILL_CHECK;
  const needed = sc.type === "team" ? 2 : 1;
  const names = Array.isArray(sc.participants) ? sc.participants.slice(0, needed) : [];
  const heroes = [];
  for (const name of names) {
    const h = state.party.find(p => p.name === name && !p.dead && p.health > 0);
    if (h && !heroes.includes(h)) heroes.push(h);
    if (heroes.length >= needed) break;
  }
  return heroes;
}

function renderSkillRoll() {
  renderRollDisplay({
    wrapId: "skillRollDisplay",
    titleId: "skillRollTitle",
    roll: state.skillCheck?.latestRoll,
    requiredSuccesses: state.skillCheck?.lastResult?.required,
    emptyTitle: "Latest roll",
    emptyText: "Roll to see the dice.",
  });
}

function renderSkillCheck() {
  const nameInput = $("skillName");
  const typeSelect = $("skillType");
  const skillSelect = $("skillStat");
  const dcInput = $("skillDc");
  const reqInput = $("skillRequired");
  const heroA = $("skillHeroA");
  const heroB = $("skillHeroB");
  const heroBWrap = $("skillHeroBWrap");
  const summary = $("skillDiceSummary");
  const note = $("skillDiceNote");
  const rollBtn = $("skillRoll");
  const outcome = $("skillOutcome");
  if (!nameInput || !typeSelect || !skillSelect || !dcInput || !reqInput || !heroA || !summary || !note || !rollBtn || !outcome) return;

  state.skillCheck = normalizeSkillCheck(state.skillCheck);
  const sc = state.skillCheck;

  // populate stat select
  skillSelect.innerHTML = SKILL_OPTIONS.map(o => `<option value="${o.key}">${escapeHtml(skillLabelForKey(o.key))}</option>`).join("");

  nameInput.value = sc.name;
  typeSelect.value = sc.type;
  skillSelect.value = sc.skill;
  dcInput.value = sc.dc;
  reqInput.value = sc.requiredSuccesses;

  if (heroBWrap) heroBWrap.style.display = sc.type === "team" ? "" : "none";

  const living = state.party.filter(p => !p.dead && p.health > 0);
  const populateHeroSelect = (sel, desired, banned) => {
    if (!sel) return "";
    sel.innerHTML = "";
    for (const p of living) {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = `${p.name} — ${skillLabelForKey(sc.skill)} ${getSkillValueFor(p, sc.skill)}`;
      opt.disabled = !!(banned && p.name === banned);
      sel.appendChild(opt);
    }
    if (!living.length) {
      const opt = document.createElement("option");
      opt.textContent = "Add a living hero";
      opt.disabled = true;
      sel.appendChild(opt);
      sel.disabled = true;
      return "";
    }
    sel.disabled = false;
    const candidates = living.map(p => p.name).filter(n => !banned || n !== banned);
    const chosen = candidates.includes(desired) ? desired : (candidates[0] || "");
    sel.value = chosen;
    return chosen;
  };

  const selA = populateHeroSelect(heroA, sc.participants[0], null);
  const selB = sc.type === "team" ? populateHeroSelect(heroB, sc.participants[1], selA) : "";

  const participants = (sc.type === "team")
    ? [selA, selB].filter(Boolean)
    : [selA].filter(Boolean);
  state.skillCheck.participants = participants;

  const heroes = getSkillParticipants();
  const diceInfo = computeSkillDice(sc.skill, heroes);
  const neededHeroes = sc.type === "team" ? 2 : 1;

  summary.textContent = heroes.length >= neededHeroes
    ? `${diceInfo.dice}d6 @ ${sc.dc}+ • Need ${sc.requiredSuccesses} successes${diceInfo.capped ? ` (capped from ${diceInfo.rawDice})` : ""}`
    : "Pick hero(s) to roll.";

  note.textContent = `You will roll ${diceInfo.dice} die${diceInfo.capped ? ` (capped from ${diceInfo.rawDice})` : ""}.`;

  rollBtn.disabled = !(heroes.length >= neededHeroes && diceInfo.dice > 0);

  if (sc.lastResult) {
    const alertCls = sc.lastResult.success ? "alert-success" : "alert-danger";
    const text = sc.lastResult.success ? "✅ Success" : "❌ Failure";
    outcome.innerHTML = `<div class="alert ${alertCls} text-center mb-0">${text}</div>`;
  } else {
    outcome.innerHTML = "";
  }

  renderSkillRoll();
}

function performSkillRoll() {
  state.skillCheck = normalizeSkillCheck(state.skillCheck);
  const sc = state.skillCheck;
  const heroes = getSkillParticipants();
  const needed = sc.type === "team" ? 2 : 1;
  if (heroes.length < needed) return;

  const diceInfo = computeSkillDice(sc.skill, heroes);
  if (diceInfo.dice <= 0) return;

  const rolls = rollD6(diceInfo.dice);
  const successes = rolls.filter(r => r >= sc.dc).length;
  const pass = successes >= sc.requiredSuccesses;
  const rollData = buildLatestRoll([{ rolls, target: sc.dc, label: "" }]);

  state.skillCheck.latestRoll = rollData;
  state.skillCheck.lastResult = {
    success: pass,
    successes,
    required: sc.requiredSuccesses,
    diceUsed: diceInfo.dice,
    rawDice: diceInfo.rawDice,
    capped: diceInfo.capped,
    participants: heroes.map(h => h.name),
  };
  state.latestRoll = rollData;
  saveSetupToStorage(state);
  renderSkillCheck();
  renderLatestRoll();
}

function renderAll() {
  clampEnemyIndex();
  renderEditors();
  renderTables();
  renderControls();
  renderCodes();
  renderSkillCheck();
  renderLatestRoll();
  renderSkillRoll();
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

  const selectedCasterIdx = Number($("playerAttacker")?.value);
  const selectedCaster = state.party[selectedCasterIdx];
  if (!selectedCaster || !isSpellcaster(selectedCaster.name) || selectedCaster.dead || selectedCaster.health <= 0 || selectedCaster.actedThisRound) {
    return;
  }

  // caster list: selected caster only
  const casterSel = $("spellCaster");
  casterSel.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = String(selectedCasterIdx);
  opt.textContent = selectedCaster.name;
  casterSel.appendChild(opt);
  casterSel.disabled = true;

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
      area.innerHTML = `<div class="alert alert-info mb-0">${caster ? "No prepared spells for this caster." : "Select a caster."}</div>`;
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

    if (!caster || !sp) {
      area.innerHTML = `<div class="alert alert-info mb-0">${caster ? "Select a prepared spell." : "Select a caster."}</div>`;
      return;
    }

    const chk = canCastSpell(caster, sp);
    if (!chk.ok) {
      area.innerHTML = `<div class="alert alert-warning mb-0">${chk.reason}</div>`;
      return;
    }

    const summaryCard = document.createElement("div");
    summaryCard.className = "card border-info-subtle mb-3";
    summaryCard.innerHTML = `
      <div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
          <div>
            <div class="text-uppercase text-secondary small fw-semibold mb-1">Spell effect</div>
            <div class="fw-semibold">${escapeHtml(sp.name)}</div>
            <div class="text-body-secondary small">${escapeHtml(formatSpellType(sp))} • Recharge ${sp.recharge}${sp.oncePerBattle ? " • Once per battle" : ""}</div>
          </div>
          <span class="badge text-bg-primary">${escapeHtml(formatSpellType(sp))}</span>
        </div>
        <p class="mb-0 mt-3 small">${escapeHtml(summarizeSpellEffect(sp))}</p>
      </div>
    `;
    area.appendChild(summaryCard);

    const targetCard = document.createElement("div");
    targetCard.className = "card shadow-sm";
    targetCard.innerHTML = `
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="card-title mb-0">Choose targets</h6>
          <span class="badge text-bg-secondary">${escapeHtml(sp.targetMode || "No target required")}</span>
        </div>
        <div class="row g-3" id="spellTargetRows"></div>
      </div>
    `;
    area.appendChild(targetCard);

    const targetRows = targetCard.querySelector("#spellTargetRows");
    const buildTargetGroup = (id, labelText, collection) => {
      const col = document.createElement("div");
      col.className = "col-12 col-md-6";
      col.innerHTML = `
        <label class="form-label" for="${id}">${labelText}</label>
        <select class="form-select" id="${id}"></select>
      `;
      const sel = col.querySelector("select");
      collection.forEach(([label, disabled]) => {
        const opt = document.createElement("option");
        opt.value = label.value;
        opt.textContent = label.text;
        opt.disabled = disabled;
        sel.appendChild(opt);
      });
      targetRows.appendChild(col);
      return sel;
    };

    if (sp.targetMode === "singleEnemy") {
      const options = state.mobs.map((m, i) => [{ value: String(i), text: `${m.name}${(m.dead||m.health<=0) ? " (dead)" : ""}` }, !!(m.dead || m.health<=0)]);
      buildTargetGroup("spellTargetEnemy0", "Target (enemy)", options);
    }

    if (sp.targetMode === "multiEnemyDistinct") {
      const n = sp.targetCount ?? 2;
      const sels = [];
      const options = state.mobs.map((m, i) => [{ value: String(i), text: `${m.name}${(m.dead||m.health<=0) ? " (dead)" : ""}` }, !!(m.dead || m.health<=0)]);
      for (let k = 0; k < n; k++) {
        const sel = buildTargetGroup(`spellTargetEnemy${k}`, `Target ${k+1} (enemy)`, options);
        sels.push(sel);
      }
      const enforceDistinct = () => {
        const chosen = new Set(sels.map(s => s.value));
        sels.forEach((sel) => {
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
      const options = state.party.map((p, i) => [{ value: String(i), text: `${p.name}${(p.dead||p.health<=0) ? " (dead)" : ""}` }, !!(p.dead || p.health<=0)]);
      buildTargetGroup("spellTargetAlly0", "Target (ally)", options);
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
  state.latestRoll = { groups: [], totalSuccesses: 0 };

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
  $("playerAttacker").addEventListener("change", updatePlayerActionControls);
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

  // Skill check
  $("skillName").addEventListener("input", (e) => {
    state.skillCheck.name = e.target.value;
    saveSetupToStorage(state);
    renderSkillCheck();
  });
  $("skillType").addEventListener("change", (e) => {
    state.skillCheck.type = e.target.value === "team" ? "team" : "individual";
    if (state.skillCheck.type === "individual") state.skillCheck.participants = state.skillCheck.participants.slice(0, 1);
    saveSetupToStorage(state);
    renderSkillCheck();
  });
  $("skillStat").addEventListener("change", (e) => {
    state.skillCheck.skill = e.target.value;
    saveSetupToStorage(state);
    renderSkillCheck();
  });
  $("skillDc").addEventListener("input", (e) => {
    state.skillCheck.dc = clampInt(e.target.value, 2, 6, state.skillCheck.dc);
    saveSetupToStorage(state);
    renderSkillCheck();
  });
  $("skillRequired").addEventListener("input", (e) => {
    state.skillCheck.requiredSuccesses = clampInt(e.target.value, 1, 99, state.skillCheck.requiredSuccesses);
    saveSetupToStorage(state);
    renderSkillCheck();
  });
  $("skillHeroA").addEventListener("change", (e) => {
    state.skillCheck.participants[0] = e.target.value;
    saveSetupToStorage(state);
    renderSkillCheck();
  });
  $("skillHeroB").addEventListener("change", (e) => {
    state.skillCheck.participants[1] = e.target.value;
    saveSetupToStorage(state);
    renderSkillCheck();
  });
  $("skillImportBtn").addEventListener("click", () => {
    $("skillImportError").style.display = "none";
    $("skillImportError").textContent = "";
    $("skillImportText").value = "";
    bsModalShow("skillImportDialog");
  });
  $("skillImportCancel").addEventListener("click", () => bsModalHide("skillImportDialog"));
  $("skillImportOk").addEventListener("click", () => {
    try {
      const parsed = parseSkillCheckImport($("skillImportText").value || "");
      parsed.latestRoll = { groups: [], totalSuccesses: 0 };
      parsed.lastResult = null;
      state.skillCheck = parsed;
      saveSetupToStorage(state);
      bsModalHide("skillImportDialog");
      renderSkillCheck();
    } catch (e) {
      $("skillImportError").textContent = String(e?.message || e);
      $("skillImportError").style.display = "";
    }
  });
  $("skillReset").addEventListener("click", () => {
    state.skillCheck = normalizeSkillCheck(DEFAULT_SKILL_CHECK);
    saveSetupToStorage(state);
    renderSkillCheck();
  });
  $("skillRoll").addEventListener("click", performSkillRoll);

  $("addMember").addEventListener("click", openHeroDialog);
  $("clearParty").addEventListener("click", () => {
    if (!confirm("Clear party setup and saved data?")) return;
    state.party = [];
    state.selectedPartyIndex = 0;
    state.vault = [];
    state.missionNotes = "";
    state.battleSeed = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      obj.party = [];
      obj.vault = [];
      obj.missionNotes = "";
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
    state.selectedPartyIndex = state.party.length - 1;
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
  const loaded = loadSetupFromStorage(state);
  state.codes = normalizeCodes(state.codes);
  state.selectedCodeBook = normalizeBookKey(state.selectedCodeBook);
  state.skillCheck = normalizeSkillCheck(state.skillCheck);
  if (!loaded) {
    const randomHero = HERO_NAMES[Math.floor(Math.random() * HERO_NAMES.length)];
    state.party = [ newMember(randomHero) ];
    state.selectedPartyIndex = 0;
    state.mobs = [ { name: "Goblin", atkDice: 4, atkTarget: 5, auto: 0, defTarget: 4, health: 6, maxHealth: 6, dead: false } ];
    state.silverCoins = 0;
    state.codes = createEmptyCodes();
    state.selectedCodeBook = CODE_BOOKS[0]?.key || "A";
    state.skillCheck = normalizeSkillCheck(DEFAULT_SKILL_CHECK);
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
  initState();
  initUI();

  renderAll();
})();
