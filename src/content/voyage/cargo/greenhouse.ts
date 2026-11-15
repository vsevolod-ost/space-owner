import type { CargoDef } from '@/core/voyage/types';

/**
 * A greenhouse: the plants make all the oxygen the crew breathes and most of the water and
 * food, while they have light. They die for good once power runs out.
 */
export const greenhouse: CargoDef = {
  // OWNER: script
  label: { en: 'Greenhouse', uk: 'Оранжерея', max: 14 },
  line: {
    en: 'Air, water and food while the lamps are on.',
    uk: 'Повітря, вода й їжа, поки горять лампи.',
    max: 60,
  },
  // OWNER: physics - grow modules, lamps and the hydroponics' water and plants.
  dryMassKg: 4_000,
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 6,
  // OWNER: physics - per day: oxygen for the crew (+1), three quarters of the water and food
  // (GDD `act1-loadout` says half; 3/4 with the base's 160 days, 640 days at a quarter a day,
  // reaches Mars without supplies), the lamps use a quarter day of power. Mass: the stocks
  // weigh days times kg per day (plan variable-mass D4), so what the crew uses leaves the ship
  // and what the plants make appears from nothing - a simplification: in fact both stay aboard
  // as waste and biomass, a closed loop of constant mass.
  flows: () => ({ oxygen: 1, water: 0.75, food: 0.75, power: -0.25 }),
  needsPower: true,
  // OWNER: design
  colony: { life: 2 },
};
