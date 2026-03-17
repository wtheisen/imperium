import { UnitStats } from '../entities/Unit';

export const ENEMY_GRUNT: UnitStats = {
  maxHp: 30,
  speed: 1.5,
  attackDamage: 5,
  attackRange: 1,
  attackCooldown: 1200,
  isRanged: false,
};

export const ENEMY_ARCHER: UnitStats = {
  maxHp: 20,
  speed: 1.5,
  attackDamage: 4,
  attackRange: 3,
  attackCooldown: 1500,
  isRanged: true,
};

export const ENEMY_BRUTE: UnitStats = {
  maxHp: 80,
  speed: 1,
  attackDamage: 15,
  attackRange: 1,
  attackCooldown: 1500,
  isRanged: false,
};

export const ENEMY_BOSS: UnitStats = {
  maxHp: 200,
  speed: 0.8,
  attackDamage: 25,
  attackRange: 1,
  attackCooldown: 1800,
  isRanged: false,
};
