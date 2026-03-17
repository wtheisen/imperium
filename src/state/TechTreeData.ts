import { TechNode } from './TechTree';

export const TECH_TREES: Record<string, TechNode[]> = {
  marine: [
    {
      id: 'marine_tempered', unitType: 'marine', name: 'Tempered',
      description: '+10 HP', tier: 0, branch: 0, prerequisites: [], xpCost: 15,
      effect: { type: 'stat_boost', stat: 'maxHp', value: 10, mode: 'flat' },
    },
    // Tank branch (left)
    {
      id: 'marine_ironhide', unitType: 'marine', name: 'Ironhide',
      description: '+3 armor, +25% HP', tier: 1, branch: 1, prerequisites: ['marine_tempered'], xpCost: 30,
      effect: { type: 'stat_boost', stat: 'armor', value: 3, mode: 'flat' },
      bonusEffects: [{ type: 'stat_boost', stat: 'maxHp', value: 25, mode: 'percent' }],
    },
    {
      id: 'marine_shieldwall_active', unitType: 'marine', name: 'Shield Wall',
      description: 'Active: +50 armor 5s, immobile', tier: 2, branch: 1, prerequisites: ['marine_ironhide'], xpCost: 50,
      effect: { type: 'active', id: 'marine_shieldwall_active' },
    },
    {
      id: 'marine_fortress', unitType: 'marine', name: 'Fortress',
      description: 'Regen 1 HP/s out of combat', tier: 3, branch: 1, prerequisites: ['marine_shieldwall_active'], xpCost: 75,
      effect: { type: 'passive', id: 'marine_fortress' },
    },
    // Berserker branch (right)
    {
      id: 'marine_fury', unitType: 'marine', name: 'Fury',
      description: '+3 damage', tier: 1, branch: 2, prerequisites: ['marine_tempered'], xpCost: 30,
      effect: { type: 'stat_boost', stat: 'attackDamage', value: 3, mode: 'flat' },
    },
    {
      id: 'marine_warcry_active', unitType: 'marine', name: 'War Cry',
      description: 'Active: +3 ATK allies, slow enemies 6s', tier: 2, branch: 2, prerequisites: ['marine_fury'], xpCost: 50,
      effect: { type: 'active', id: 'marine_warcry_active' },
    },
    {
      id: 'marine_champion', unitType: 'marine', name: 'Champion',
      description: '-15% cooldown + on-kill AoE', tier: 3, branch: 2, prerequisites: ['marine_warcry_active'], xpCost: 75,
      effect: { type: 'stat_boost', stat: 'attackCooldown', value: 15, mode: 'percent' },
      bonusEffects: [{ type: 'triggered', id: 'marine_cleave', trigger: 'on-kill' }],
    },
  ],

  guardsman: [
    {
      id: 'guardsman_steady', unitType: 'guardsman', name: 'Steady Aim',
      description: '+1 range', tier: 0, branch: 0, prerequisites: [], xpCost: 15,
      effect: { type: 'stat_boost', stat: 'attackRange', value: 1, mode: 'flat' },
    },
    // Marksman branch (left)
    {
      id: 'guardsman_sniper', unitType: 'guardsman', name: 'Sniper',
      description: '+3 damage', tier: 1, branch: 1, prerequisites: ['guardsman_steady'], xpCost: 30,
      effect: { type: 'stat_boost', stat: 'attackDamage', value: 3, mode: 'flat' },
    },
    {
      id: 'guardsman_volley_active', unitType: 'guardsman', name: 'Volley',
      description: 'Active: Fire 3 shots at 50% dmg', tier: 2, branch: 1, prerequisites: ['guardsman_sniper'], xpCost: 50,
      effect: { type: 'active', id: 'guardsman_volley_active' },
    },
    {
      id: 'guardsman_headshot', unitType: 'guardsman', name: 'Headshot',
      description: '15% crit + ignore 3 armor', tier: 3, branch: 1, prerequisites: ['guardsman_volley_active'], xpCost: 75,
      effect: { type: 'triggered', id: 'guardsman_headshot', trigger: 'on-attack' },
      bonusEffects: [{ type: 'passive', id: 'guardsman_piercing' }],
    },
    // Rapid branch (right)
    {
      id: 'guardsman_rapidfire', unitType: 'guardsman', name: 'Rapid Fire',
      description: '-200ms cooldown', tier: 1, branch: 2, prerequisites: ['guardsman_steady'], xpCost: 30,
      effect: { type: 'stat_boost', stat: 'attackCooldown', value: 200, mode: 'flat' },
    },
    {
      id: 'guardsman_kite_active', unitType: 'guardsman', name: 'Kite',
      description: 'Active: Teleport away, +2 speed 3s', tier: 2, branch: 2, prerequisites: ['guardsman_rapidfire'], xpCost: 50,
      effect: { type: 'active', id: 'guardsman_kite_active' },
    },
    {
      id: 'guardsman_barrage', unitType: 'guardsman', name: 'Barrage',
      description: '-200ms cooldown + 5 HP', tier: 3, branch: 2, prerequisites: ['guardsman_kite_active'], xpCost: 75,
      effect: { type: 'stat_boost', stat: 'attackCooldown', value: 200, mode: 'flat' },
      bonusEffects: [{ type: 'stat_boost', stat: 'maxHp', value: 5, mode: 'flat' }],
    },
  ],

  servitor: [
    {
      id: 'servitor_efficient', unitType: 'servitor', name: 'Efficient',
      description: '+0.5 gather rate', tier: 0, branch: 0, prerequisites: [], xpCost: 10,
      effect: { type: 'stat_boost', stat: 'gatherRate', value: 0.5, mode: 'flat' },
    },
    // Economy branch (left)
    {
      id: 'servitor_prospector', unitType: 'servitor', name: 'Prospector',
      description: '+5 capacity, +0.5 gather', tier: 1, branch: 1, prerequisites: ['servitor_efficient'], xpCost: 25,
      effect: { type: 'stat_boost', stat: 'gatherCapacity', value: 5, mode: 'flat' },
      bonusEffects: [{ type: 'stat_boost', stat: 'gatherRate', value: 0.5, mode: 'flat' }],
    },
    {
      id: 'servitor_repair_active', unitType: 'servitor', name: 'Emergency Repair',
      description: 'Active: Heal 10 HP in 2 tiles', tier: 2, branch: 1, prerequisites: ['servitor_prospector'], xpCost: 40,
      effect: { type: 'active', id: 'servitor_repair_active' },
    },
    {
      id: 'servitor_golden', unitType: 'servitor', name: 'Golden Touch',
      description: '+2 bonus gold per drop', tier: 3, branch: 1, prerequisites: ['servitor_repair_active'], xpCost: 60,
      effect: { type: 'passive', id: 'servitor_golden' },
    },
    // Survivalist branch (right)
    {
      id: 'servitor_tough', unitType: 'servitor', name: 'Tough',
      description: '+15 HP, +4 damage', tier: 1, branch: 2, prerequisites: ['servitor_efficient'], xpCost: 25,
      effect: { type: 'stat_boost', stat: 'maxHp', value: 15, mode: 'flat' },
      bonusEffects: [{ type: 'stat_boost', stat: 'attackDamage', value: 4, mode: 'flat' }],
    },
    {
      id: 'servitor_fortify_active', unitType: 'servitor', name: 'Fortify',
      description: 'Active: +5 armor 5s, immobile', tier: 2, branch: 2, prerequisites: ['servitor_tough'], xpCost: 40,
      effect: { type: 'active', id: 'servitor_fortify_active' },
    },
    {
      id: 'servitor_resilient', unitType: 'servitor', name: 'Resilient',
      description: 'Regen 1 HP every 2s', tier: 3, branch: 2, prerequisites: ['servitor_fortify_active'], xpCost: 60,
      effect: { type: 'passive', id: 'servitor_resilient' },
    },
  ],

  scout: [
    {
      id: 'scout_swift', unitType: 'scout', name: 'Swift',
      description: '+1 speed', tier: 0, branch: 0, prerequisites: [], xpCost: 15,
      effect: { type: 'stat_boost', stat: 'speed', value: 1, mode: 'flat' },
    },
    // Assassin branch (left)
    {
      id: 'scout_ambush', unitType: 'scout', name: 'Ambush',
      description: '+5 damage', tier: 1, branch: 1, prerequisites: ['scout_swift'], xpCost: 30,
      effect: { type: 'stat_boost', stat: 'attackDamage', value: 5, mode: 'flat' },
    },
    {
      id: 'scout_sprint_active', unitType: 'scout', name: 'Sprint',
      description: 'Active: 2x speed for 4s', tier: 2, branch: 1, prerequisites: ['scout_ambush'], xpCost: 50,
      effect: { type: 'active', id: 'scout_sprint_active' },
    },
    {
      id: 'scout_assassin', unitType: 'scout', name: 'Assassin',
      description: '-300ms cooldown + 2x first hit', tier: 3, branch: 1, prerequisites: ['scout_sprint_active'], xpCost: 75,
      effect: { type: 'stat_boost', stat: 'attackCooldown', value: 300, mode: 'flat' },
      bonusEffects: [{ type: 'triggered', id: 'scout_backstab', trigger: 'on-attack' }],
    },
    // Recon branch (right)
    {
      id: 'scout_eyes', unitType: 'scout', name: 'Eagle Eyes',
      description: '+3 vision radius', tier: 1, branch: 2, prerequisites: ['scout_swift'], xpCost: 30,
      effect: { type: 'passive', id: 'scout_eyes' },
    },
    {
      id: 'scout_smoke_active', unitType: 'scout', name: 'Smoke Bomb',
      description: 'Active: Enemies lose target 3s', tier: 2, branch: 2, prerequisites: ['scout_eyes'], xpCost: 50,
      effect: { type: 'active', id: 'scout_smoke_active' },
    },
    {
      id: 'scout_phantom', unitType: 'scout', name: 'Phantom',
      description: '+2 speed + 20% dodge', tier: 3, branch: 2, prerequisites: ['scout_smoke_active'], xpCost: 75,
      effect: { type: 'stat_boost', stat: 'speed', value: 2, mode: 'flat' },
      bonusEffects: [{ type: 'passive', id: 'scout_evasion' }],
    },
  ],
};
