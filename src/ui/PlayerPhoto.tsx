import { playerPhoto } from "../lib/logos";

// Cutout in public/players, named after the dataset spelling. 30 of the 500
// players have no file, so the box keeps its size and a 404 shows as empty
// space instead of a broken image, which also keeps every name aligned.
export function PlayerPhoto({ name }: { name: string }) {
  return (
    <span className="player-photo" aria-hidden="true">
      <img
        src={playerPhoto(name)}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

