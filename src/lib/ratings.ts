import type { Placement, Player, Role } from "./game";

type RawPlayerRow = {
  player: unknown;
  position: unknown;
  year: unknown;
  team: unknown;
  placement: unknown;
  games: unknown;
  raw_stat_values: unknown;
  adjusted_competition_score: unknown;
  confidence_multiplier: unknown;
};

type RawRatingsPayload = {
  player_competition_scores: unknown[];
};

const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;
const placements = [
  "WINNER",
  "FINALIST",
  "SEMIFINALIST",
  "QUARTERFINALIST",
  "NONE",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && roles.includes(value as Role);
}

function isPlacement(value: unknown): value is Placement {
  return typeof value === "string" && placements.includes(value as Placement);
}
function rawStat(row: unknown, key: string): number | undefined {
  if (!isRecord(row)) return undefined;
  const value = row[key];
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseRow(value: unknown, index: number): RawPlayerRow {
  if (!isRecord(value)) {
    throw new Error(`Запись игрока ${index + 1} имеет неверный формат`);
  }

  return {
    player: value.player,
    position: value.position,
    year: value.year,
    team: value.team,
    placement: value.placement,
    games: value.games,
    raw_stat_values: value.raw_stat_values,
    adjusted_competition_score: value.adjusted_competition_score,
    confidence_multiplier: value.confidence_multiplier,
  };
}

export function parsePlayer(row: RawPlayerRow, index: number): Player {
  if (
    typeof row.player !== "string" ||
    typeof row.team !== "string" ||
    !isRole(row.position)
  ) {
    throw new Error(`Некорректные данные игрока в записи ${index + 1}`);
  }

  const year = toFiniteNumber(row.year);
  const games = toFiniteNumber(row.games);

  return {
    id: `${row.player}-${row.team}-${year}-${row.position}`,
    name: row.player,
    role: row.position,
    score: toFiniteNumber(row.adjusted_competition_score),
    year,
    team: row.team,
    placement: isPlacement(row.placement) ? row.placement : undefined,
    games: games > 0 ? games : undefined,
    winRate: rawStat(row.raw_stat_values, "WinRate"),
    kda: rawStat(row.raw_stat_values, "KDA"),
    kp: rawStat(row.raw_stat_values, "Kill participation"),
    goldDiff15: rawStat(row.raw_stat_values, "Gold diff @ 15"),
    firstBlood: rawStat(row.raw_stat_values, "First blood"),
    clearWards: rawStat(row.raw_stat_values, "clear ward / minute"),
    dpm: rawStat(row.raw_stat_values, "Damage / minute"),
    confidence: toFiniteNumber(row.confidence_multiplier),
  };
}

function parsePayload(value: unknown): RawRatingsPayload {
  if (!isRecord(value) || !Array.isArray(value.player_competition_scores)) {
    throw new Error("JSON рейтингов не содержит player_competition_scores");
  }

  return { player_competition_scores: value.player_competition_scores };
}

export async function loadPlayers(): Promise<Player[]> {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const response = await fetch(`${prefix}data/worlds_mayhem_ratings.json`);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить рейтинг: ${response.status}`);
  }

  const json: unknown = await response.json();
  const payload = parsePayload(json);

  return payload.player_competition_scores.map((row, index) =>
    parsePlayer(parseRow(row, index), index),
  );
}
