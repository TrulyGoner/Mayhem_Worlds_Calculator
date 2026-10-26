import { useState } from "react";
import { playerPhoto } from "../lib/logos";

// Cutout in public/players, named after the dataset spelling. 48 of the 500
// players have no file, so the box keeps its size and a 404 shows as empty
// space instead of a broken image, which also keeps every name aligned.
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
