// One-off: writes seed clipboard fixtures. Items marked "EE2" are copied from
// Exiled-Exchange-2 renderer/specs/Parser/items.ts @ cca30662 (MIT); the rest were written by hand
// to match PoE 2's format. Replace with real copies captured in-game (dev hotkey) when available.
import { mkdir, writeFile } from 'node:fs/promises'

const dir = new URL('../tests/fixtures/clipboard/seed/', import.meta.url)
await mkdir(dir, { recursive: true })

const items = {
  'ee2-rare-ring.txt': `Item Class: Rings
Rarity: Rare
Rune Loop
Prismatic Ring
--------
Requires: Level 45
--------
Item Level: 79
--------
{ Implicit Modifier — Elemental, Fire, Cold, Lightning, Resistance }
+8(7-10)% to all Elemental Resistances
--------
{ Prefix Modifier "Vaporous" (Tier: 3) — Defences }
+143(124-151) to Evasion Rating
{ Suffix Modifier "of the Wrestler" (Tier: 7) — Attribute }
+12(9-12) to Strength
{ Suffix Modifier "of Warmth" (Tier: 3) — Mana }
8(8-12)% increased Mana Regeneration Rate
5% increased Light Radius
{ Suffix Modifier "of the Penguin" (Tier: 7) — Elemental, Cold, Resistance }
+15(11-15)% to Cold Resistance
`,
  'ee2-unique-focus.txt': `Item Class: Foci
Rarity: Unique
The Eternal Spark
Crystal Focus
--------
Energy Shield: 44 (augmented)
--------
Requires: Level 26, 43 (augmented) Int
--------
Item Level: 81
--------
{ Unique Modifier — Defences }
56(50-70)% increased Energy Shield
{ Unique Modifier — Mana }
40% increased Mana Regeneration Rate while stationary
{ Unique Modifier — Elemental, Lightning, Resistance }
+26(20-30)% to Lightning Resistance
{ Unique Modifier — Elemental, Lightning, Resistance }
+5% to Maximum Lightning Resistance
{ Unique Modifier — Mana }
40% increased Mana Regeneration Rate
--------
A flash of blue, a stormcloud's kiss,
her motionless dance the pulse of bliss
`,
  'ee2-rare-body-armour.txt': `Item Class: Body Armours
Rarity: Rare
Hate Pelt
Soldier Cuirass
--------
Quality: +20% (augmented)
Armour: 3075 (augmented)
--------
Requires: Level 65, 121 (unmet) Str
--------
Sockets: S S S
--------
Item Level: 80
--------
54% increased Armour, Evasion and Energy Shield (rune)
--------
{ Prefix Modifier "Impenetrable" (Tier: 1) — Defences }
103(101-110)% increased Armour
{ Prefix Modifier "Hardened" (Tier: 1) — Defences }
+70(70-86) to Armour
41(39-42)% increased Armour
{ Prefix Modifier "Unmoving" (Tier: 2) — Defences }
+256(226-256) to Armour (desecrated)
{ Suffix Modifier "of the Titan" (Tier: 1) — Attribute }
+32(31-33) to Strength
{ Suffix Modifier "of Allaying" (Tier: 3) — Physical, Ailment }
48(50-46)% reduced Duration of Bleeding on You
{ Suffix Modifier "of the Essence" (Tier: 1) }
Hits against you have 44(40-50)% reduced Critical Damage Bonus
--------
Note: ~b/o 10 divine
`,
  'ee2-rare-wand.txt': `Item Class: Wands
Rarity: Rare
Doom Bite
Withered Wand
--------
Requires: Level 90 (unmet), 125 (augmented) Int
--------
Item Level: 82
--------
Grants Skill: Level 20 Chaos Bolt
--------
{ Prefix Modifier "Malignant" (Tier: 4) — Damage, Chaos }
71(65-74)% increased Chaos Damage
{ Prefix Modifier "Frostbound" (Tier: 1) — Damage, Elemental, Cold }
Gain 28(28-30)% of Damage as Extra Cold Damage
{ Suffix Modifier "of the Hearth" (Tier: 1) — Mana }
22(18-22)% increased Mana Regeneration Rate
15% increased Light Radius
{ Suffix Modifier "of the Apt" (Tier: 4) }
20% reduced Attribute Requirements
--------
Note: ~b/o 5 exalted
`,
  'ee2-rare-belt.txt': `Item Class: Belts
Rarity: Rare
Corpse Snare
Ornate Belt
--------
Requires: Level 59
--------
Item Level: 80
--------
{ Implicit Modifier }
14(15-10)% reduced Charm Charges used
{ Implicit Modifier — Charm }
Has 2(1-3) Charm Slots
--------
{ Prefix Modifier "Transformative" (Tier: 4) }
11(10-15)% increased Charm Effect Duration
{ Prefix Modifier "Fecund" (Tier: 1) — Life }
+161(150-174) to maximum Life
{ Suffix Modifier "of the Volcano" (Tier: 3) — Elemental, Fire, Resistance }
+32(31-35)% to Fire Resistance
{ Suffix Modifier "of the Titan" (Tier: 2) — Attribute }
+33(31-33) to Strength
{ Suffix Modifier "of Steel Skin" (Tier: 6) }
+94(73-97) to Stun Threshold
`,
  'ee2-tablet-legacy-precursor.txt': `Item Class: Tablet
Rarity: Rare
Planar Challenge
Delirium Precursor Tablet
--------
Item Level: 84
--------
{ Implicit Modifier }
Adds a Mirror of Delirium to a Map
17 uses remaining
--------
{ Prefix Modifier "Breeding" }
7(4-10)% increased Pack Size in Map
{ Prefix Modifier "Teeming" }
Map has 16(25-70)% increased Magic Monsters
{ Suffix Modifier "of the Simulacrum" (Tier: 1) }
6(10-30)% increased Stack size of Simulacrum Splinters found in Map
{ Suffix Modifier "of Phobia" (Tier: 1) }
Delirium Encounters in Map are 5(10-30)% more likely to spawn Unique Bosses
--------
Can be used in a personal Map Device to add modifiers to a Map.
--------
Corrupted
--------
Note: ~b/o 1 exalted
`,
  'ee2-waystone-rare.txt': `Item Class: Waystones
Rarity: Rare
Desolate Route
Waystone (Tier 14)
--------
Revives Available: 2 (augmented)
Pack Size: +34% (augmented)
Rare Monsters: +28% (augmented)
Waystone Drop Chance: +75% (augmented)
--------
Item Level: 80
--------
{ Prefix Modifier "Shocking" (Tier: 1) }
Area has patches of Shocked Ground — Unscalable Value
{ Prefix Modifier "Painful" (Tier: 1) }
28(26-30)% increased Monster Damage
{ Suffix Modifier "of Splitting" (Tier: 2) }
Monsters fire 2 additional Projectiles
{ Suffix Modifier "of Destruction" (Tier: 1) }
Monsters have 293(260-300)% increased Critical Hit Chance
+26(26-30)% to Monster Critical Damage Bonus
--------
Can be used in a Map Device, allowing you to enter a Map. Waystones can only be used once.
`,
  'ee2-waystone-corrupted-all-props.txt': `Item Class: Waystones
Rarity: Rare
Blasted Control
Waystone (Tier 16)
--------
Revives Available: 0 (augmented)
Pack Size: +20% (augmented)
Magic Monsters: +30% (augmented)
Rare Monsters: +71% (augmented)
Waystone Drop Chance: +90% (augmented)
Item Rarity: +17% (augmented)
Monster Rarity: +32% (augmented)
Monster Effectiveness: +45% (augmented)
--------
Item Level: 79
--------
{ Prefix Modifier "Painful" (Tier: 1) }
30(26-30)% increased Monster Damage
{ Prefix Modifier "Enduring" (Tier: 1) }
Monsters are Armoured
{ Prefix Modifier "Slowing" (Tier: 1) }
Players are periodically Cursed with Temporal Chains — Unscalable Value
{ Suffix Modifier "of the Unwavering" (Tier: 1) }
Monsters have 71(70-79)% increased Ailment Threshold
Monsters have 72(70-79)% increased Stun Threshold
{ Suffix Modifier "of Drought" (Tier: 1) }
Players gain 33(35-30)% reduced Flask Charges
{ Suffix Modifier "of Shattering" (Tier: 1) }
Monsters Break Armour equal to 36(30-45)% of Physical Damage dealt
--------
Can be used in a Map Device, allowing you to enter a Map. Waystones can only be used once.
--------
Corrupted
`,
  'ee2-normal-shield.txt': `Item Class: Shields
Rarity: Normal
Polished Targe
--------
Block chance: 25%
Armour: 71
Evasion Rating: 64
--------
Requires: Level 54, 42 Str, 42 Dex
--------
Item Level: 54
--------
Grants Skill: Raise Shield
--------
Note: ~b/o 1 aug
`,
  'hand-currency-exalted.txt': `Item Class: Stackable Currency
Rarity: Currency
Exalted Orb
--------
Stack Size: 7/5000
--------
Augments a Rare item with a new random modifier
--------
Right click this item then left click a rare item to apply it. Rare items can have up to six random modifiers.
`,
  'hand-rune.txt': `Item Class: Socketable
Rarity: Currency
Greater Iron Rune
--------
Stack Size: 3/10
--------
Martial Weapons: 18% increased Physical Damage
Armour: 18% increased Armour, Evasion and Energy Shield
--------
Place into an empty Augment Socket in a Martial Weapon or Armour to apply its effect. Once socketed it cannot be removed.
`,
  'hand-essence.txt': `Item Class: Stackable Currency
Rarity: Currency
Greater Essence of Ice
--------
Stack Size: 2/10
--------
Upgrades a Magic item to a Rare item with a new random modifier
--------
Right click this item then left click a Magic item to apply it.
`,
  'hand-soul-core.txt': `Item Class: Socketable
Rarity: Currency
Soul Core of Tacati
--------
Stack Size: 1/10
--------
Martial Weapons: 15% chance to Poison on Hit
Armour: +11% to Chaos Resistance
--------
Place into an empty Augment Socket in a Martial Weapon or Armour to apply its effect.
`,
  'hand-unique-tablet.txt': `Item Class: Tablet
Rarity: Unique
Clear Skies
Delirium Tablet
--------
Item Level: 80
--------
{ Implicit Modifier }
Adds a Mirror of Delirium to a Map
10 uses remaining
--------
{ Unique Modifier }
Map has no Fog
--------
Can be used in a personal Map Device to add modifiers to a Map.
`,
  'hand-tablet-breach.txt': `Item Class: Tablet
Rarity: Magic
Breeding Breach Tablet
--------
Item Level: 81
--------
{ Implicit Modifier }
Adds Breaches to a Map
5 uses remaining
--------
{ Prefix Modifier "Breeding" (Tier: 1) }
9(4-10)% increased Pack Size in Map
--------
Can be used in a personal Map Device to add modifiers to a Map.
`,
}

for (const [name, text] of Object.entries(items)) await writeFile(new URL(name, dir), text)
console.log(`wrote ${Object.keys(items).length} seed fixtures`)
