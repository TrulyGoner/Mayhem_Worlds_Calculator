export type LeaderRow = {
  power: number;
  picks: number;
  at: string;
};

const KEY = "cacl.leaderboard.v1";
const LIMIT = 10;

// Every browser call can throw here: private mode, disabled storage, quota.
// A leaderboard is never worth breaking the game over, so failures degrade to
// an empty board and a silent no-op write.
export function loadBoard(): LeaderRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is LeaderRow =>
          typeof row === "object" &&
          row !== null &&
          typeof (row as LeaderRow).power === "number" &&
          Number.isFinite((row as LeaderRow).power),
      )
      .map((row) => ({
        power: row.power,
        picks: typeof row.picks === "number" ? row.picks : 0,
        at: typeof row.at === "string" ? row.at : "",
      }));
  } catch {
    return [];
  }
}

export function recordResult(
  power: number,
  picks: number,
): LeaderRow[] {
  const board = loadBoard().filter((row) => row.power !== power);
  const next = [
    ...board,
    { power, picks, at: new Date().toISOString().slice(0, 10) },
  ]
    .sort((left, right) => right.power - left.power)
    .slice(0, LIMIT);

  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage refused the write; the in-memory board is still correct.
  }
  return next;
}

export function clearBoard(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}