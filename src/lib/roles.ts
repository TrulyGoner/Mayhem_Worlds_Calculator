import type { Role } from "../types/game";

// Role glyphs in public/roles. MID and SUPPORT are not named after the role.
export const ROLE_ICON: Record<Role, string> = {
  TOP: "/roles/top.png",
  JUNGLE: "/roles/jungle.png",
  MID: "/roles/middle.png",
  ADC: "/roles/adc.png",
  SUPPORT: "/roles/support.webp",
};
