import { calculateTeamScore } from "../../lib/scoring";
import type { Player } from "../../lib/game";
function lineupWith(picked: Player[], candidate: Player): Player[] {
  return [
    ...picked.filter((player) => player.role !== candidate.role),
    candidate,
  ];
}
export function teamScoreGain(picked: Player[], candidate: Player): number {
  return (
    calculateTeamScore(lineupWith(picked, candidate)) -
    calculateTeamScore(picked)
  );
}
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export const REROLL_CARDS = 15;
export const REROLL_SAMPLES = 60;

export function signedGain(gain: number): string {
  return `${gain >= 0 ? "+" : "−"}${Math.abs(gain).toFixed(1)}`;
}
