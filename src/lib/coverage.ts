import type { Player, Role } from "./game";

export type CoverageAxis = {
  key: string;
  label: string;
  value: number;
};
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

type AxisBaseline = {
  min: number;
  max: number;
};

const baselineCache = new WeakMap<Player[], Map<string, AxisBaseline>>();

function getBaselines(allPlayers: Player[]): Map<string, AxisBaseline> {
  let cached = baselineCache.get(allPlayers);
  if (!cached) {
    cached = new Map();
    for (const axis of AXES) {
      const values = axisValues(allPlayers, axis.stat, axis.roles);
      if (values.length > 0) {
        let min = values[0];
        let max = values[0];
        for (let i = 1; i < values.length; i += 1) {
          if (values[i] < min) min = values[i];
          if (values[i] > max) max = values[i];
        }
        cached.set(axis.key, { min, max });
      }
    }
    baselineCache.set(allPlayers, cached);
  }
  return cached;
}
function normalize(min: number, max: number, value: number): number {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

export function coverageAxes(
  picked: Player[],
  allPlayers: Player[],
): CoverageAxis[] {
  if (picked.length === 0) return [];
  const baselines = getBaselines(allPlayers);

  return AXES.map((axis) => {
    const baseline = baselines.get(axis.key);
    if (!baseline) return { key: axis.key, label: axis.label, value: 0 };
    const own = axisValues(picked, axis.stat, axis.roles);
    const value =
      own.length === 0
        ? 0
        : own.reduce(
            (sum, item) => sum + normalize(baseline.min, baseline.max, item),
            0,
          ) / own.length;
    return { key: axis.key, label: axis.label, value };
  }).filter((axis) => axis.value > 0);
}

export function coverageScore(axes: CoverageAxis[]): number {
  if (axes.length === 0) return 0;
  return axes.reduce((sum, axis) => sum + axis.value, 0) / axes.length;
}
export function weakestAxis(
  axes: CoverageAxis[],
): { label: string; gap: number } | null {
  if (axes.length < 2) return null;
  const best = Math.max(...axes.map((axis) => axis.value));
  const worst = axes.reduce((low, axis) => (axis.value < low.value ? axis : low));
  return { label: worst.label, gap: best - worst.value };
}
