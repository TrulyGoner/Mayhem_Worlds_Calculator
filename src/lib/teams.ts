import type { Player, Role } from "./game";
import { normalize } from "./fuzzy.ts";

export const ROLE_ORDER: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

export type TeamSlot = { team: string; year: number | null };
export function yearsFor(team: string, players: Player[]): number[] {
  return [
    ...new Set(
      players
        .filter((player) => player.team === team)
        .map((player) => player.year),
    ),
  ].sort((left, right) => right - left);
}
export function freeYears(
  team: string,
  players: Player[],
  slots: TeamSlot[],
  index: number,
): number[] {
  const used = new Set(
    slots
      .filter((_, position) => position !== index)
      .filter((slot) => slot.team === team && slot.year !== null)
      .map((slot) => slot.year as number),
  );
  return yearsFor(team, players).filter((year) => !used.has(year));
}
export function rosterFor(
  team: string,
  year: number,
  players: Player[],
): Player[] {
  return players
    .filter((player) => player.team === team && player.year === year)
    .sort(
      (left, right) =>
        ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role) ||
        right.score - left.score,
    );
}

type YearInference = { year: number | null; candidates: number[] };
export function inferYearFromRoster(
  text: string,
  team: string,
  players: Player[],
): YearInference {
  const normalized = normalize(text);
  const tokens = text
    .split(/\s+/)
    .map((part) => normalize(part))
    .filter((part) => part !== "");
  const nameHit = (name: string): boolean => {
    const folded = normalize(name);
    if (!folded) return false;
    if (folded.length >= 3 && tokens.includes(folded)) return true;
    return folded.length >= 5 && normalized.includes(folded);
  };

  let bestCount = 0;
  let candidates: number[] = [];
  for (const year of yearsFor(team, players)) {
    const count = rosterFor(team, year, players).filter((player) =>
      nameHit(player.name),
    ).length;
    if (count > bestCount) {
      bestCount = count;
      candidates = [year];
    } else if (count === bestCount) {
      candidates.push(year);
    }
  }
  return bestCount >= 2
    ? { year: candidates.length === 1 ? candidates[0] : null, candidates }
    : { year: null, candidates: [] };
}
