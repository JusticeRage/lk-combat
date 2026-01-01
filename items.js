export const ITEMS = [

  // Stealth items
  { id: "soft_boots", name: "Soft Boots", modifiers: { stealth: 1 } },
  { id: "fine_boots", name: "Fine Boots", modifiers: { stealth: 2 } },

  // Survival items
  { id: "warm_cloak", name: "Warm cloak", modifiers: { survival: 1 } },
  { id: "rugged_cloak", name: "Rugged cloak", modifiers: { survival: 2 } },

  // Charisma items
  { id: "handsome_brooch", name: "Handsome brooch", modifiers: { charisma: 1 } },
  { id: "glittering_necklace", name: "Glittering Necklace", modifiers: { charisma: 2 } },

  // Lore items
  { id: "reference_book", name: "Reference book", modifiers: { lore: 1 } },
  { id: "tome_of_knowledge", name: "Tome of knowledge", modifiers: { lore: 2 } },

  // Shields
  { id: "shield", name: "Shield", modifiers: { armour: 2 }, hands: 1 },

  // One-handed weapons
  { id: "crude_blade", name: "Crude Blade", modifiers: { fighting: 0 }, hands: 1, type: "weapon" },
  { id: "iron_shortsword", name: "Iron Shortsword", modifiers: { fighting: 1 }, hands: 1, type: "weapon" },
  { id: "steel_longsword", name: "Steel Longsword", modifiers: { fighting: 2 }, hands: 1, type: "weapon" },
  { id: "steel_scimitar", name: "Steel Scimitar", modifiers: { fighting: 2 }, hands: 1, type: "weapon" },
  { id: "skallos_runeblade", name: "Skallos Runeblade", modifiers: { fighting: 3, lore: 2 }, hands: 1, type: "weapon" },

  // Two-handed weapons
  { id: "maul", name: "Maul", modifiers: { fighting: 1 }, hands: 2, type: "weapon" },
  { id: "iron_greataxe", name: "Iron Greataxe", modifiers: { fighting: 2 }, hands: 2, type: "weapon" },
  { id: "steel_greatsword", name: "Steel Greatsword", modifiers: { fighting: 3 }, hands: 2, type: "weapon" },

  // Armours
  { id: "hide_armour", name: "Hide Armour", modifiers: { armour: 1 }, type: "wearable" },
  { id: "bone_armour", name: "Bone Armour", modifiers: { armour: 2 }, type: "wearable" },
  { id: "bronze_armour", name: "Bronze Armour", modifiers: { armour: 4 }, type: "wearable" },
  { id: "black_plate_armour", name: "Black Plate Armour", modifiers: { armour: 3 }, type: "wearable" },
  { id: "amulet_of_defence", name: "Amulet of Defence", modifiers: { armour: 1 } },

  // Key items (alphabetical order)
  { id: "black_prism", name: "Black Prism", modifiers: {} },
  { id: "bluestone", name: "Bluestone", modifiers: {} },
  { id: "bronze_locket", name: "Bronze Locket", modifiers: {} },
  { id: "bronze_scorpion", name: "Bronze Scorpion", modifiers: {} },
  { id: "calligraphy_ink", name: "Calligraphy Ink", modifiers: {} },
  { id: "dragon_head", name: "Dragon Head", modifiers: {} },
  { id: "dragonyak_horn", name: "Dragonyak Horn", modifiers: {} },
  { id: "engagement_ring", name: "Engagement Ring", modifiers: {} },
  { id: "fairbrother_family_crest", name: "Fairbrother Family Crest", modifiers: {} },
  { id: "gold_portrait", name: "Gold Portrait", modifiers: {} },
  { id: "golden_candlestick", name: "Golden Candlestick", modifiers: {} },
  { id: "grey_talisman", name: "Grey Talisman", modifiers: {} },
  { id: "hygliph_flower", name: "Hygliph flower", modifiers: {} },
  { id: "incense", name: "Incense", modifiers: {} },
  { id: "iron_key", name: "Iron Key", modifiers: {} },
  { id: "iron_sceptre", name: "Iron Sceptre", modifiers: {} },
  { id: "jewellery_box", name: "Jewellery Box", modifiers: {} },
  { id: "lizard_hide", name: "Lizard Hide", modifiers: {} },
  { id: "precious_tomes", name: "Precious Tomes", modifiers: {} },
  { id: "prybar", name: "Prybar", modifiers: {} },
  { id: "quicksilver", name: "Quicksilver", modifiers: {} },
  { id: "silver_idol", name: "Silver Idol", modifiers: {} },
  { id: "talisman_saint_elias", name: "Talisman of Saint Elias", modifiers: {} },
  { id: "troglodyte_heads", name: "Troglodyte Heads", modifiers: {}, countable: true },
  { id: "vial_of_poison", name: "Vial of poison", modifiers: {} },
];

export function getItemById(id) {
  return ITEMS.find(i => i.id === id) || null;
}
