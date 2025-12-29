export const ITEMS = [
  { id: "handsome_brooch", name: "Handsome brooch", modifiers: { charisma: 1 } },
  { id: "prybar", name: "Prybar", modifiers: {} },
  { id: "iron_sceptre", name: "Iron Sceptre", modifiers: {} },
  { id: "fine_boots", name: "Fine Boots", modifiers: { stealth: 2 } },
  { id: "shield", name: "Shield", modifiers: { armour: 2 }, hands: 1 },
  { id: "iron_shortsword", name: "Iron Shortsword", modifiers: { fighting: 1 }, hands: 1, type: "weapon" },
  { id: "crude_blade", name: "Crude Blade", modifiers: { fighting: 0 }, hands: 1, type: "weapon" },
  { id: "maul", name: "Maul", modifiers: { fighting: 1 }, hands: 2, type: "weapon" },
  { id: "hide_armour", name: "Hide Armour", modifiers: { armour: 1 } },
  { id: "bone_armour", name: "Bone Armour", modifiers: { armour: 2 } },
  { id: "reference_book", name: "Reference book", modifiers: { lore: 1 } },
  { id: "warm_cloak", name: "Warm cloak", modifiers: { Survival: 1 } },
  { id: "tome_of_knowledge", name: "Tome of knowledge", modifiers: { lore: 2 } },
  { id: "talisman_saint_elias", name: "Talisman of Saint Elias", modifiers: {} },
  { id: "engagement_ring", name: "Engagement Ring", modifiers: {} },
  { id: "glittering_necklace", name: "Glittering Necklace", modifiers: { charisma: 2 } },
  { id: "troglodyte_heads", name: "Troglodyte heads", modifiers: {}, countable: true },
  { id: "incense", name: "Incense", modifiers: {} },
  { id: "dragon_head", name: "Dragon head", modifiers: {} },
  { id: "steel_longsword", name: "Steel Longsword", modifiers: { fighting: 2 }, hands: 1, type: "weapon" },
  { id: "vial_of_poison", name: "Vial of poison", modifiers: {} },
  { id: "iron_greataxe", name: "Iron Greataxe", modifiers: { fighting: 2 }, hands: 2, type: "weapon" },
  { id: "steel_scimitar", name: "Steel Scimitar", modifiers: { fighting: 2 }, hands: 1, type: "weapon" },
  { id: "soft_boots", name: "Soft Boots", modifiers: { stealth: 1 } },
  { id: "hygliph_flower", name: "Hygliph flower", modifiers: {} },
];

export function getItemById(id) {
  return ITEMS.find(i => i.id === id) || null;
}
