import { calculateTeamScore } from "../../lib/scoring";
import type { Player } from "../../lib/game";

// Same rule as togglePicked: a player never grows the lineup past 5, they take
// over their own role.
function lineupWith(picked: Player[], candidate: Player): Player[] {
  return [
    ...picked.filter((player) => player.role !== candidate.role),
    candidate,
  ];
}

// What a pick is actually worth: how much the weighted lineup score moves. No
// hand-tuned weights here, everything comes from calculateTeamScore.
export function teamScoreGain(picked: Player[], candidate: Player): number {
  return (
    calculateTeamScore(lineupWith(picked, candidate)) -
    calculateTeamScore(picked)
  );
}

// A reroll redraws about 15 cards, so compare the current best card against the
// expected best of a redraw. Seeded from the state instead of Math.random, or
// the advice would flicker on every render.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export const REROLL_CARDS = 15;
export const REROLL_SAMPLES = 60;

export function signedGain(gain: number): string {
  return `${gain >= 0 ? "+" : "−"}${Math.abs(gain).toFixed(1)}`;
}
