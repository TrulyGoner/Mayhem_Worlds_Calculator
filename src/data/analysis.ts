import type { AnalysisData, Combo } from "../types/analysis";
import type { Player, Role } from "../types/game";

const roles: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function player(value: unknown): Player | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.name !== "string" ||
    typeof value.role !== "string" ||
    !roles.includes(value.role as Role) ||
    typeof value.year !== "number" ||
    typeof value.team !== "string" ||
    typeof value.score !== "number"
  )
    return null;

  return {
    id: `${value.name}-${value.team}-${value.year}-${value.role}`,
    name: value.name,
    role: value.role as Role,
    year: value.year,
    team: value.team,
    score: value.score,
  };
}

function combo(value: unknown): Combo | null {
  if (!isRecord(value) || !Array.isArray(value.players)) return null;
  const players = value.players
    .map(player)
    .filter((item): item is Player => item !== null);
  if (
    players.length !== value.players.length ||
    typeof value.power !== "number"
  )
    return null;

  return {
    players,
    power: value.power,
    base: typeof value.base === "number" ? value.base : value.power,
    carry: typeof value.carry === "number" ? value.carry : 0,
    weak: typeof value.weak === "number" ? value.weak : 0,
  };
}

export async function loadAnalysis(): Promise<AnalysisData> {
  const response = await fetch("/data/worlds_analysis.json");
  if (!response.ok)
    throw new Error(`Не удалось загрузить связки: ${response.status}`);

  const json: unknown = await response.json();
  if (!isRecord(json) || !isRecord(json.topByRole)) {
    throw new Error("Некорректный формат файла анализа");
  }

  const rawTopByRole = json.topByRole;

  const topByRole = Object.fromEntries(
    roles.map((role) => [
      role,
      Array.isArray(rawTopByRole[role])
        ? rawTopByRole[role]
            .map(player)
            .filter((item): item is Player => item !== null)
        : [],
    ]),
  ) as Record<Role, Player[]>;

  const readCombos = (key: "pairs" | "trios") =>
    Array.isArray(json[key])
      ? json[key].map(combo).filter((item): item is Combo => item !== null)
      : [];

  return { topByRole, pairs: readCombos("pairs"), trios: readCombos("trios") };
}
