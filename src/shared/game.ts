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
  placement?: Placement;
  games?: number;
  winRate?: number;
  kda?: number;
  kp?: number;
  goldDiff15?: number;
  firstBlood?: number;
  clearWards?: number;
  dpm?: number;
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
