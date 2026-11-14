import type { CargoCatalog } from '@/core/voyage/types';

/**
 * Mass of one day of each life-support stock for the one person aboard, kg (plan
 * variable-mass D4: the stocks stay in days, their mass is days times this). Power and heat
 * weigh nothing: they are stored energy, not matter; fuel gets its own mass (plan S3).
 * OWNER: physics - plausible numbers (NASA life-support baselines, one crew member), kept by
 * plan S9: the 160-280 days of stocks a ship starts with weigh 0.9-1.6 t, about 1 % of it, so
 * the cargo's dry mass and the fuel decide the flight. After a change run `npm run balance`.
 */
export const stockMass: CargoCatalog['kgPerDay'] = {
  // Metabolic oxygen of an average crew member (NASA: about 0.84 kg/day).
  oxygen: 0.84,
  // Drinking water and water to rehydrate food, no recycling (NASA: about 2.5-3.5 kg/day).
  water: 3,
  // Food with its packaging (ISS: about 1.8 kg/day).
  food: 1.8,
};
