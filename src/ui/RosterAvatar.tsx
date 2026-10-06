import { useState } from "react";
import { playerPhoto } from "../lib/logos";
import { ROLE_ICON } from "../lib/roles";
import type { Player, Role } from "../lib/game";

// The role glyph and the face are separate cells: the glyph is how the lineup
// reads at a glance, the photo is decoration, so losing the photo must never
// cost the role. A missing file just empties the photo cell, and the caller
// keys this on the player id to clear the failure between picks.
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
