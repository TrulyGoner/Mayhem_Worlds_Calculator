import type { Role } from "./game";

// Role glyphs in public/roles. MID and SUPPORT are not named after the role.
export const ROLE_ICON: Record<Role, string> = {
  TOP: "/roles/top.png",
  JUNGLE: "/roles/jungle.png",
  MID: "/roles/middle.png",
  ADC: "/roles/adc.png",
  SUPPORT: "/roles/support.webp",
};

// "ALL" is the rating tab's role filter, not a playable role.
export type RoleFilter = "ALL" | Role;

export const ROLES: RoleFilter[] = [
  "ALL",
  "TOP",
  "JUNGLE",
  "MID",
  "ADC",
  "SUPPORT",
];

