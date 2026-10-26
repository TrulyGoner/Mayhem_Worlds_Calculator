import type { Role } from "./game";
export const ROLE_ICON: Record<Role, string> = {
  TOP: "/roles/top.png",
  JUNGLE: "/roles/jungle.png",
  MID: "/roles/middle.png",
  ADC: "/roles/adc.png",
  SUPPORT: "/roles/support.webp",
};
export type RoleFilter = "ALL" | Role;

export const ROLES: RoleFilter[] = [
  "ALL",
  "TOP",
  "JUNGLE",
  "MID",
  "ADC",
  "SUPPORT",
];
