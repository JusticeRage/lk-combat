export function clampInt(v, lo, hi, fallback = 0) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

export function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

export function rollD6(n) {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
}

export function fmtDice(arr) {
  return arr.length ? "[" + arr.join(", ") + "]" : "[]";
}

export function nowStamp() {
  return (new Date()).toLocaleString();
}

// --- Core mechanics ---
export function armourSaveRolls(armourScore, incomingDamage) {
  const dice = Math.min(armourScore, incomingDamage);
  if (dice <= 0) return { saved: 0, rolls: [], dice };
  const rolls = rollD6(dice);
  const saved = rolls.filter(r => r >= 4).length;
  return { saved, rolls, dice };
}

export function computeAttackHits(fightingDice, targetDef) {
  const rolls = rollD6(fightingDice);
  const hits = rolls.filter(r => r >= targetDef).length;
  return { rolls, hits };
}

export function computeEnemyHits(atkDice, atkTarget) {
  const rolls = rollD6(atkDice);
  const hits = rolls.filter(r => r >= atkTarget).length;
  return { rolls, hits };
}

// --- Buff handling (simple) ---
export function getEffectiveArmour(member) {
  const base = member.armour || 0;
  const buffs = Array.isArray(member.buffs) ? member.buffs : [];
  const add = buffs
    .filter(b => b.type === "armour" && (b.until === "battleEnd" || b.untilRound == null || b.untilRound >= 0))
    .reduce((s, b) => s + (b.amount || 0), 0);
  return base + add;
}

export function clearBattleBuffs(party) {
  for (const p of party) p.buffs = [];
}

export function addBattleArmourBuff(member, amount) {
  if (!member.buffs) member.buffs = [];
  member.buffs.push({ type: "armour", amount, until: "battleEnd" });
}
