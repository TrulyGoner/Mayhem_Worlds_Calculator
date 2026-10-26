import { scoreBreakdown } from "./scoring.ts";
import type { Placement, Player, Role } from "./game";

const ROLE_ORDER: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const STAGES = [
  { id: "QUARTERFINALIST", label: "ЧЕТВЕРТЬФИНАЛ", unlocks: "выход в четвертьфинал" },
  { id: "SEMIFINALIST", label: "ПОЛУФИНАЛ", unlocks: "выход в полуфинал" },
  { id: "FINALIST", label: "ФИНАЛ", unlocks: "выход в финал" },
  { id: "WINNER", label: "ЧЕМПИОН", unlocks: "титул чемпиона" },
] as const;

const PLACEMENT_RANK: Record<Placement, number> = {
  NONE: 0,
  QUARTERFINALIST: 1,
  SEMIFINALIST: 2,
  FINALIST: 3,
  WINNER: 4,
};

export type StageChance = {
  id: (typeof STAGES)[number]["id"];
  label: string;
  unlocks: string;
  chance: number;
  cutoff: number;
  margin: number;
};
function historicalLineups(players: Player[]): { power: number; rank: number }[] {
  const groups = new Map<string, Player[]>();
  for (const player of players) {
    if (player.placement === undefined) continue;
    const key = `${player.team}|${player.year}`;
    const group = groups.get(key);
    if (group) group.push(player);
    else groups.set(key, [player]);
  }

  const lineups: { power: number; rank: number }[] = [];
  for (const group of groups.values()) {
    const starters = new Map<Role, Player>();
    for (const player of group) {
      const held = starters.get(player.role);
      if (!held || player.score > held.score) starters.set(player.role, player);
    }
    if (starters.size < ROLE_ORDER.length) continue;
    const breakdown = scoreBreakdown([...starters.values()]);
    lineups.push({
      power: breakdown.power,
      rank: PLACEMENT_RANK[group[0].placement as Placement],
    });
  }
  return lineups;
}
function fitLogistic(
  powers: number[],
  cleared: number[],
): { b0: number; b1: number } {
  let b0 = 0;
  let b1 = 0;
  for (let step = 0; step < 100; step++) {
    let g0 = 0;
    let g1 = 0;
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;
    for (let i = 0; i < powers.length; i++) {
      const z = b0 + b1 * powers[i];
      const p = 1 / (1 + Math.exp(-z));
      const residual = cleared[i] - p;
      const weight = p * (1 - p);
      g0 += residual;
      g1 += residual * powers[i];
      h00 += weight;
      h01 += weight * powers[i];
      h11 += weight * powers[i] * powers[i];
    }
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-12) break;
    const d0 = (g0 * h11 - g1 * h01) / det;
    const d1 = (-g0 * h01 + g1 * h00) / det;
    b0 += d0;
    b1 += d1;
    if (Math.abs(d0) + Math.abs(d1) < 1e-11) break;
  }
  return { b0, b1 };
}

const EMPTY_CHANCES: StageChance[] = STAGES.map((stage) => ({
  id: stage.id,
  label: stage.label,
  unlocks: stage.unlocks,
  chance: 0,
  cutoff: 0,
  margin: 0,
}));

type StageModel = {
  id: (typeof STAGES)[number]["id"];
  label: string;
  unlocks: string;
  b0: number;
  b1: number;
  cutoff: number;
};

const modelCache = new WeakMap<Player[], StageModel[]>();

function getModels(players: Player[]): StageModel[] {
  const cached = modelCache.get(players);
  if (cached) return cached;

  const lineups = historicalLineups(players);
  if (lineups.length === 0) return [];

  const powers = lineups.map((lineup) => lineup.power);
  const models = STAGES.map((stage) => {
    const needed = PLACEMENT_RANK[stage.id];
    const cleared = lineups.map((lineup) => (lineup.rank >= needed ? 1 : 0));
    const { b0, b1 } = fitLogistic(powers, cleared);
    const cutoff = -b0 / b1;
    return {
      id: stage.id,
      label: stage.label,
      unlocks: stage.unlocks,
      b0,
      b1,
      cutoff,
    };
  }).sort((left, right) => right.cutoff - left.cutoff);

  modelCache.set(players, models);
  return models;
}
export function stageChances(
  players: Player[],
  power: number,
): StageChance[] {
  if (!Number.isFinite(power) || power <= 0) return EMPTY_CHANCES;
  const models = getModels(players);
  if (models.length === 0) return EMPTY_CHANCES;

  return models.map((model) => {
    const chance = 1 / (1 + Math.exp(-(model.b0 + model.b1 * power)));
    return {
      id: model.id,
      label: model.label,
      unlocks: model.unlocks,
      chance,
      cutoff: model.cutoff,
      margin: power - model.cutoff,
    };
  });
}
export function stageCeiling(chances: StageChance[]): StageChance | undefined {
  return chances.find((chance) => chance.chance >= 0.5);
}
