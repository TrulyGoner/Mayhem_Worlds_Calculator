import type { Player, Role } from "./game";

export type Combo = {
  players: Player[];
  power: number;
  base: number;
  carry: number;
  weak: number;
};

export type AnalysisData = {
  topByRole: Record<Role, Player[]>;
  pairs: Combo[];
  trios: Combo[];
};
