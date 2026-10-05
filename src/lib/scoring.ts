import type { Player, Role, TeamOption } from "../types/game";

const roleWeights: Record<Role, number> = {
  TOP: 0.17,
  JUNGLE: 0.2,
  MID: 0.24,
  ADC: 0.23,
  SUPPORT: 0.16,
};

export function calculateTeamScore(players: Player[]): number {
  if (players.length === 0) return 0;

  const weight = players.reduce(
    (sum, player) => sum + roleWeights[player.role],
    0,
  );
  const total = players.reduce(
    (sum, player) => sum + player.score * roleWeights[player.role],
    0,
  );

  return Math.round((total / weight) * 10) / 10;
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
