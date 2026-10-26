import { scoreBreakdown } from "./scoring.ts";
import type { Player, Role } from "./game";

export type Combo = {
  players: Player[];
  power: number;
  base: number;
  carry: number;
  weak: number;
  weakRole: Role | null;
};

const ROLE_ORDER: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const DEPTH = 5;
function indexGroups(count: number, size: number): number[][] {
  const groups: number[][] = [];
  const walk = (start: number, current: number[]) => {
    if (current.length === size) {
      groups.push([...current]);
      return;
    }
    for (let index = start; index < count; index += 1) {
      current.push(index);
      walk(index + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return groups;
}

function cartesian<T>(pools: T[][]): T[][] {
  return pools.reduce<T[][]>(
    (rows, pool) => rows.flatMap((row) => pool.map((item) => [...row, item])),
    [[]],
  );
}

function rank(players: Player[]): Combo {
  const breakdown = scoreBreakdown(players);
  return {
    players,
    power: breakdown.power,
    base: breakdown.base,
    carry: breakdown.carryBonus,
    weak: breakdown.weakPenalty,
    weakRole: breakdown.weakRole,
  };
}
export function buildCombos(players: Player[]): {
  pairs: Combo[];
  trios: Combo[];
} {
  const pools = ROLE_ORDER.map((role) =>
    players
      .filter((player) => player.role === role)
      .sort((left, right) => right.score - left.score)
      .slice(0, DEPTH),
  );

  const build = (size: number): Combo[] => {
    if (pools.some((pool) => pool.length === 0)) return [];
    const rows = indexGroups(pools.length, size).flatMap((group) =>
      cartesian(group.map((index) => pools[index])).map((members) =>
        rank(members),
      ),
    );
    rows.sort((left, right) => right.power - left.power);
    return rows;
  };

  return { pairs: build(2), trios: build(3) };
}
