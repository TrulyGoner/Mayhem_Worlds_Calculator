import type { Player, Role, TeamOption } from "./game";

const roleWeights: Record<Role, number> = {
  TOP: 0.17,
  JUNGLE: 0.2,
  MID: 0.24,
  ADC: 0.23,
  SUPPORT: 0.16,
};

// Ceilings stop one elite pick from carrying a lineup on its own, and stop a
// single weak pick from sinking it.
const CARRY_CAP = 2.5;
const WEAK_CAP = 2;

export type TeamScoreBreakdown = {
  power: number;
  base: number;
  carryBonus: number;
  weakPenalty: number;
  weakRole: Role | null;
};

const EMPTY: TeamScoreBreakdown = {
  power: 0,
  base: 0,
  carryBonus: 0,
  weakPenalty: 0,
  weakRole: null,
};

// Lineup strength = role-weighted average, plus two dispersion terms that look at
// the spread of the ratings rather than at who they belong to. Carry rewards
// ratings sitting above the lineup's own mean, the penalty punishes the bottom
// of it, and weakRole names that bottom. A role holds one player in a lineup but
// a roster can list a substitute (EDward Gaming 2016 MID = PawN/Scout), so the
// stronger entry per role wins.
export function scoreBreakdown(players: Player[]): TeamScoreBreakdown {
  const byRole = new Map<Role, Player>();
  for (const player of players) {
    if (!Number.isFinite(player.score)) continue;
    const held = byRole.get(player.role);
    if (held === undefined || player.score > held.score) {
      byRole.set(player.role, player);
    }
  }
  if (byRole.size === 0) return EMPTY;

  const ratings: number[] = [];
  let weighted = 0;
  let weight = 0;
  let weakRole: Role | null = null;
  for (const [role, player] of byRole) {
    ratings.push(player.score);
    weighted += player.score * roleWeights[role];
    weight += roleWeights[role];
    if (weakRole === null || player.score < byRole.get(weakRole)!.score) {
      weakRole = role;
    }
  }

  const base = weighted / weight;
  const sorted = [...ratings].sort((left, right) => right - left);
  const mean = ratings.reduce((sum, score) => sum + score, 0) / ratings.length;
  const aboveMean = (index: number) => sorted[index] - mean;

  const carryBonus = Math.min(
    CARRY_CAP,
    0.2 * Math.max(0, aboveMean(0)) +
      (sorted.length > 1 ? 0.12 * Math.max(0, aboveMean(1)) : 0) +
      (sorted.length > 2 ? 0.04 * Math.max(0, aboveMean(2)) : 0),
  );
  const weakPenalty = Math.min(
    WEAK_CAP,
    0.2 * Math.max(0, -aboveMean(sorted.length - 1)) +
      (sorted.length > 1
        ? 0.1 * Math.max(0, -aboveMean(sorted.length - 2))
        : 0),
  );

  return {
    power: base + carryBonus - weakPenalty,
    base,
    carryBonus,
    weakPenalty,
    weakRole,
  };
}

export function calculateTeamScore(players: Player[]): number {
  return Math.round(scoreBreakdown(players).power * 10) / 10;
}

export function withTeamScore(team: Omit<TeamOption, "score">): TeamOption {
  return { ...team, score: calculateTeamScore(team.players) };
}

export function getScoreTone(score: number): "elite" | "strong" | "average" {
  if (score >= 90) return "elite";
  if (score >= 80) return "strong";
  return "average";
}

// Cap a score-descending list without cutting through a tie group. Cutting at a
// fixed count would drop every entry that scores exactly what the last visible
// one scores, which makes the list look arbitrary right at the cutoff.
export function withTies<T>(
  list: T[],
  limit: number,
  score: (item: T) => number,
): T[] {
  const kept = list.slice(0, limit);
  if (kept.length < list.length) {
    const cutoff = score(kept[kept.length - 1]);
    return [
      ...kept,
      ...list.slice(limit).filter((item) => score(item) === cutoff),
    ];
  }
  return kept;
}
