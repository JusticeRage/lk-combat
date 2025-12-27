export const ITEMS = [
  { id: "brooch", name: "Brooch", modifiers: { charisma: 1 } },
  { id: "prybar", name: "Prybar", modifiers: {} },
  { id: "iron_sceptre", name: "Iron Sceptre", modifiers: {} },
  { id: "fine_boots", name: "Fine Boots", modifiers: { stealth: 2 } },
  { id: "shield", name: "Shield", modifiers: { armour: 2 }, hands: 1 },
  { id: "iron_shortsword", name: "Iron Shortsword", modifiers: { fighting: 1 }, hands: 1, type: "weapon" },
  { id: "crude_blade", name: "Crude Blade", modifiers: { fighting: 1 }, hands: 1, type: "weapon" },
  { id: "maul", name: "Maul", modifiers: { fighting: 1 }, hands: 2, type: "weapon" },
  { id: "hide_armour", name: "Hide Armor", modifiers: { armour: 1 } },
  { id: "reference_book", name: "Reference book", modifiers: { lore: 1 } },
  { id: "talisman_saint_elias", name: "Talisman of Saint Elias", modifiers: {} },
  { id: "engagement_ring", name: "Engagement Ring", modifiers: {} },
  { id: "glittering_necklace", name: "Glittering Necklace", modifiers: { charisma: 2 } },
  { id: "troglodyte_heads", name: "Troglodyte heads", modifiers: {}, countable: true },
  { id: "incense", name: "Incense", modifiers: {} },
  { id: "dragon_head", name: "Dragon head", modifiers: {} },
  { id: "steel_longsword", name: "Steel Longsword", modifiers: { fighting: 2 }, hands: 1, type: "weapon" },
];

export function getItemById(id) {
  return ITEMS.find(i => i.id === id) || null;
}
