import { useState } from "react";
import { playerPhoto } from "../lib/logos";
export function PlayerPhoto({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="player-photo" aria-hidden="true">
      {!failed && (
        <img
          src={playerPhoto(name)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
