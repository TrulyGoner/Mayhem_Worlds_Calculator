import type { Player, Role } from "../types/game";

export type CoverageAxis = {
  key: string;
  label: string;
  value: number;
};

// Designed heuristic, not a measurement: it reads the four stat groups that
// actually exist in the ratings file and asks whether a roster covers them or
// stacks everything into one. It deliberately does not feed `power` — the power
// formula and the fitted stage probabilities stay untouched by this.
const AXES: {
  key: string;
  label: string;
  stat: "goldDiff15" | "kp" | "dpm" | "clearWards";
  roles: Role[];
}[] = [
  { key: "lane", label: "Линия", stat: "goldDiff15", roles: ["TOP", "MID", "ADC"] },
  { key: "fight", label: "Тимфайты", stat: "kp", roles: ["JUNGLE", "MID", "ADC", "SUPPORT"] },
  { key: "damage", label: "Урон", stat: "dpm", roles: ["MID", "ADC"] },
  { key: "vision", label: "Вижн", stat: "clearWards", roles: ["JUNGLE", "SUPPORT"] },
];

function axisValues(
  players: Player[],
  stat: CoverageStat,
  roles: Role[],
): number[] {
  return players
    .filter((player) => roles.includes(player.role))
    .map((player) => player[stat])
    .filter((value): value is number => typeof value === "number");
}

type CoverageStat = "goldDiff15" | "kp" | "dpm" | "clearWards";

// Min-max against the whole dataset, so an axis reads as "how strong is this
// roster here relative to every real Worlds roster", not as an invented
// threshold. A flat axis (everyone equal) collapses to 50 instead of NaN.
function normalize(values: number[], value: number): number {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

export function coverageAxes(
  picked: Player[],
  allPlayers: Player[],
): CoverageAxis[] {
  if (picked.length === 0) return [];

  return AXES.map((axis) => {
    const baseline = axisValues(allPlayers, axis.stat, axis.roles);
    const own = axisValues(picked, axis.stat, axis.roles);
    const value =
      own.length === 0
        ? 0
        : own.reduce((sum, item) => sum + normalize(baseline, item), 0) /
          own.length;
    return { key: axis.key, label: axis.label, value };
  }).filter((axis) => axis.value > 0);
}

export function coverageScore(axes: CoverageAxis[]): number {
  if (axes.length === 0) return 0;
  return axes.reduce((sum, axis) => sum + axis.value, 0) / axes.length;
}

// The number that is worth telling someone: a roster scoring 80 everywhere is a
// different plan from one scoring 80 in damage and 10 in vision, and only the
// gap between axes shows that.
export function weakestAxis(
  axes: CoverageAxis[],
): { label: string; gap: number } | null {
  if (axes.length < 2) return null;
  const best = Math.max(...axes.map((axis) => axis.value));
  const worst = axes.reduce((low, axis) => (axis.value < low.value ? axis : low));
  return { label: worst.label, gap: best - worst.value };
}