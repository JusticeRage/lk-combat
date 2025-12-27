export const SPELLS = [
  {
    id: "poison_stream",
    name: "Poison Stream",
    type: "combat",
    timing: "combat",
    oncePerBattle: true,
    recharge: 50,
    targetMode: "multiEnemyDistinct",
    targetCount: 2,
    steps: [
      { type: "attackFixed", fighting: 5, times: 2, mustBeDifferentTargets: true },
    ],
  },
  {
    id: "unfailing_strike",
    name: "Unfailing Strike",
    type: "combat",
    timing: "combat",
    oncePerBattle: true,
    recharge: 50,
    targetMode: "singleEnemy",
    steps: [
      { type: "damageFixed", amount: 3, bypassDefence: true },
    ],
  },
  {
    id: "armour_of_heaven",
    name: "Armour of Heaven",
    type: "combat",
    timing: "combat",
    oncePerBattle: true,
    recharge: 50,
    targetMode: "singleAlly",
    steps: [
      { type: "buffArmour", amount: 3, duration: "battle" },
    ],
  },
  {
    id: "ice_bolt",
    name: "Ice Bolt",
    type: "combat",
    timing: "combat",
    oncePerBattle: true,
    recharge: 50,
    targetMode: "singleEnemy",
    steps: [
      { type: "attackFixed", fighting: 8, times: 1 },
    ],
  },
  {
    id: "soothing_touch",
    name: "Soothing Touch",
    type: "combat",
    timing: "combatOrAdventure",
    oncePerBattle: true,
    recharge: 50,
    targetMode: "singleAlly",
    steps: [
      { type: "healFixed", amount: 5 },
    ],
  },
  {
    id: "animal_speech",
    name: "Animal Speech",
    type: "adventure",
    timing: "adventure",
    recharge: 50,
    targetMode: null,
    steps: [],
  },
  {
    id: "wolf_spirit",
    name: "Wolf Spirit",
    type: "adventure",
    timing: "adventure",
    recharge: 75,
    targetMode: null,
    steps: [],
  },
  {
    id: "magic_cabinet",
    name: "Magic Cabinet",
    type: "adventure",
    timing: "adventure",
    recharge: 100,
    targetMode: null,
    steps: [],
  },
];

export function getSpellById(id) {
  return SPELLS.find(s => s.id === id) || null;
}
