import { useState } from "react";
import { playerPhoto } from "../lib/logos";
import { ROLE_ICON } from "../lib/roles";
import type { Player, Role } from "../lib/game";
export function RosterAvatar({
  role,
  player,
}: {
  role: Role;
  player?: Player;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(player) && !failed;

  return (
    <>
      <span className="role-icon">
        <img src={ROLE_ICON[role]} alt={role} />
      </span>
      <span className="roster-face">
        {showPhoto && (
          <img
            src={playerPhoto(player!.name)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </span>
    </>
  );
}
