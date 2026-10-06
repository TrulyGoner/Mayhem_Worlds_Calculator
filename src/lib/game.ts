export type Role = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";

export type Placement =
  | "WINNER"
  | "FINALIST"
  | "SEMIFINALIST"
  | "QUARTERFINALIST"
  | "NONE";

export type Player = {
  id: string;
  name: string;
  role: Role;
  score: number;
  year: number;
  team: string;
  // Everything below comes from the ratings file only; players parsed out of the
  // analysis file (combos) leave them undefined.
  placement?: Placement;
  games?: number;
  winRate?: number;
  kda?: number;
  // Role-specific raw stats from raw_stat_values; missing per role, so undefined
  // means "no value for this appearance", never 0.
  kp?: number;
  goldDiff15?: number;
  firstBlood?: number;
  clearWards?: number;
  dpm?: number;
  // confidence_multiplier is on the row itself, not in raw_stat_values.
  confidence?: number;
};

export type TeamOption = {
  id: string;
  name: string;
  year: number;
  players: Player[];
  score: number;
};

export type DraftState = {
  round: number;
  totalRounds: number;
  rerollsLeft: number;
  options: TeamOption[];
  pickedPlayers: Player[];
};
