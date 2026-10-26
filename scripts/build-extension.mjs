import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = resolve(root, "dist-extension");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(resolve(root, "extension"), out, { recursive: true });

const ratingsRaw = await readFile(
  resolve(root, "public/data/worlds_mayhem_ratings.json"),
  "utf8",
);
const ratings = JSON.parse(ratingsRaw);
const extensionRatings = {
  player_competition_scores: ratings.player_competition_scores.map((row) => ({
    player: row.player,
    team: row.team,
    year: row.year,
    position: row.position,
    adjusted_competition_score: row.adjusted_competition_score,
  })),
};
await writeFile(
  resolve(out, "worlds_mayhem_ratings.json"),
  JSON.stringify(extensionRatings),
);

await cp(resolve(root, "public/roles"), resolve(out, "roles"), {
  recursive: true,
});
console.log(`Extension written to ${out}`);
