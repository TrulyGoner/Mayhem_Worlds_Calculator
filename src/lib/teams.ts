import type { Player, Role } from "./game";
import { normalize } from "./fuzzy.ts";

export const ROLE_ORDER: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

export type TeamSlot = { team: string; year: number | null };

// Years this team actually appears in, newest first.
export function yearsFor(team: string, players: Player[]): number[] {
  return [
    ...new Set(
      players
        .filter((player) => player.team === team)
        .map((player) => player.year),
    ),
  ].sort((left, right) => right - left);
}

// Years of `team` that no other block has claimed. The round-level duplicate ban
// is on (team, year), not on team: the same team may sit in two blocks at once
// as long as the years differ.
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

// Everyone listed for a (team, year), in role order. A role can hold two
// players: mid-season substitutes share a slot, e.g. Bilibili Gaming 2024
// JUNGLE holds Xun and Wei. Starter first by score.
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

// The year badge on a card is often stylized past what Tesseract can read (OCR
// shows "(5)" for "2015"), while the player names below it read perfectly. So
// the year falls back to the roster: score every year of `team` by how many of
// its listed players the OCR text mentions, and trust unique maxima. 2016/2017
// share a roster, so genuine ties come back year: null with both candidates and
// the caller asks the user.
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
