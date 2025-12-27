export const SPELLS = [
  {
    id: "poison_stream",
    name: "Poison Stream",
    timing: "combat",
    oncePerBattle: true,
    targetMode: "multiEnemyDistinct",
    targetCount: 2,
    steps: [
      { type: "attackFixed", fighting: 5, times: 2, mustBeDifferentTargets: true },
    ],
  },
  {
    id: "unfailing_strike",
    name: "Unfailing Strike",
    timing: "combat",
    oncePerBattle: true,
    targetMode: "singleEnemy",
    steps: [
      { type: "damageFixed", amount: 3, bypassDefence: true },
    ],
  },
  {
    id: "armour_of_heaven",
    name: "Armour of Heaven",
    timing: "combat",
    oncePerBattle: true,
    targetMode: "singleAlly",
    steps: [
      { type: "buffArmour", amount: 3, duration: "battle" },
    ],
  },
  {
    id: "ice_bolt",
    name: "Ice Bolt",
    timing: "combat",
    oncePerBattle: true,
    targetMode: "singleEnemy",
    steps: [
      { type: "attackFixed", fighting: 8, times: 1 },
    ],
  },
  {
    id: "soothing_touch",
    name: "Soothing Touch",
    timing: "combatOrAdventure",
    oncePerBattle: true,
    targetMode: "singleAlly",
    steps: [
      { type: "healFixed", amount: 5 },
    ],
  },
];

export function getSpellById(id) {
  return SPELLS.find(s => s.id === id) || null;
}
