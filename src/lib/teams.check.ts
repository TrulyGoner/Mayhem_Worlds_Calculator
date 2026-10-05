import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { Player, Role } from "../types/game.ts";
import { playerPhoto, teamLogo } from "./logos.ts";
import { withTies } from "./scoring.ts";
import { freeYears, inferYearFromRoster, rosterFor, yearsFor } from "./teams.ts";
import { bestTeamMatch, pickYear } from "./fuzzy.ts";

type RatingRow = {
  player: string;
  team: string;
  year: number;
  position: string;
  // The JSON carries no `score` column: the app takes it from
  // adjusted_competition_score in src/data/ratings.ts (bonuses are already
  // folded into that value). The score assertions below mirror that formula.
  adjusted_competition_score: number;
};

const rows: RatingRow[] = JSON.parse(
  readFileSync(
    new URL("../../public/data/worlds_mayhem_ratings.json", import.meta.url),
    "utf8",
  ),
).player_competition_scores;

const players: Player[] = rows.map((row) => ({
  id: `${row.team}-${row.year}-${row.position}-${row.player}`,
  name: row.player,
  role: row.position as Role,
  score: row.adjusted_competition_score,
  year: row.year,
  team: row.team,
}));

const ROLE_ORDER: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const teams = [...new Set(players.map((player) => player.team))].sort();
assert.ok(teams.length > 0, "no teams found");

// The year picker is fed from here, so every team needs at least one option.
for (const team of teams) {
  assert.ok(yearsFor(team, players).length > 0, `${team} offers no years`);
}

// A (team, year) covers all 5 roles. Rows run 5..7 because substitutes share a
// role (EDward Gaming 2016: MID=PawN/Scout and TOP=Mouse/Korol).
const sizes = new Set<number>();
for (const team of teams) {
  for (const year of yearsFor(team, players)) {
    const roster = rosterFor(team, year, players);
    sizes.add(roster.length);

    const perRole = new Map<Role, number>();
    for (const player of roster)
      perRole.set(player.role, (perRole.get(player.role) ?? 0) + 1);

    assert.deepEqual(
      [...perRole.keys()],
      ROLE_ORDER,
      `${team} ${year} role coverage`,
    );
    for (const [role, count] of perRole) {
      assert.ok(
        count === 1 || count === 2,
        `${team} ${year} ${role} has ${count} players`,
      );
    }
  }
}
assert.deepEqual(
  [...sizes].sort((left, right) => left - right),
  [5, 6, 7],
);

// Starter before substitute, roles in TOP..SUPPORT order.
assert.deepEqual(
  rosterFor("Bilibili Gaming", 2024, players).map((player) => player.name),
  ["Bin", "Xun", "Wei", "Knight", "Elk", "ON"],
);

// Every derived score must be a real number: a missing input field used to slip
// through as undefined and quietly disable the score sort.
for (const player of players) {
  assert.ok(
    Number.isFinite(player.score),
    `${player.name} ${player.team} ${player.year} has score ${player.score}`,
  );
  assert.ok(
    player.score >= 0 && player.score <= 100,
    `${player.name} score out of range: ${player.score}`,
  );
}

// "Starter first by score" is a promise in rosterFor. Check every multi-player
// role group, not one handpicked roster: with undefined scores the comparator
// returned NaN and only passed because the JSON row order happened to match.
const groups = new Map<string, Player[]>();
for (const player of players) {
  const key = `${player.team} ${player.year} ${player.role}`;
  groups.set(key, [...(groups.get(key) ?? []), player]);
}
for (const [key, group] of groups) {
  if (group.length < 2) continue;
  const ordered = rosterFor(group[0].team, group[0].year, players).filter(
    (player) => player.role === group[0].role,
  );
  assert.equal(
    ordered.length,
    group.length,
    `${key} lost players in rosterFor`,
  );
  for (let index = 1; index < ordered.length; index++) {
    assert.ok(
      ordered[index - 1].score > ordered[index].score,
      `${key} is not score-descending: ${ordered[index - 1].name} ${ordered[index - 1].score} before ${ordered[index].name} ${ordered[index].score}`,
    );
  }
}

// A year the team never played must resolve to nothing.
assert.equal(rosterFor("T1", 2016, players).length, 0);

// One team may sit in two blocks of the same round, but only with different
// years. The ban lives on (team, year), not on team.
const t1Years = yearsFor("T1", players);
assert.ok(t1Years.length >= 2, "T1 needs 2+ years for this check");
const sameTeam = [
  { team: "T1", year: t1Years[0] },
  { team: "T1", year: null },
];
// Block 2 must not see the year block 1 took, but every other T1 year is fair.
assert.deepEqual(freeYears("T1", players, sameTeam, 1), t1Years.slice(1));
// Block 1 must not exclude its own year from itself.
assert.deepEqual(freeYears("T1", players, sameTeam, 0), t1Years);
// An exact (team, year) duplicate is refused.
const exactDup = [
  { team: "T1", year: t1Years[0] },
  { team: "T1", year: t1Years[0] },
];
assert.ok(
  !freeYears("T1", players, exactDup, 1).includes(t1Years[0]),
  "the same T1 year was offered twice",
);
// Other teams are unaffected by a T1 claim.
assert.deepEqual(
  freeYears("Fnatic", players, sameTeam, 1),
  yearsFor("Fnatic", players),
);

// Capping a score-sorted list must not cut through a tie group, and must not
// invent extra rows when the list is shorter than the cap.
const byGain = (row: { gain: number }) => row.gain;
assert.deepEqual(withTies([], 12, byGain), [], "empty list must stay empty");
assert.deepEqual(withTies([{ gain: 9 }], 12, byGain), [{ gain: 9 }]);
// Cut lands mid-tie: all five 1.0 entries must survive, the 0.5 must not.
const ties = [
  { gain: 3 },
  { gain: 2 },
  { gain: 1 },
  { gain: 1 },
  { gain: 1 },
  { gain: 1 },
  { gain: 1 },
  { gain: 0.5 },
];
assert.deepEqual(
  withTies(ties, 3, byGain).map(byGain),
  [3, 2, 1, 1, 1, 1, 1],
  "the tie group at the cutoff was truncated",
);
// Cut lands on a clean boundary: nothing extra is pulled in.
const clean = [{ gain: 3 }, { gain: 2 }, { gain: 1 }, { gain: 0.5 }];
assert.deepEqual(withTies(clean, 2, byGain).map(byGain), [3, 2]);

// Every logo path must point at a file that exists. A renamed or mistyped logo
// otherwise fails silently as a broken image, and the dev server answers a miss
// with index.html rather than a 404.
const logoFiles = new Set(
  readdirSync(new URL("../../public/teams/logos/", import.meta.url)),
);
const byExactName = new Map(
  [...logoFiles].map((file) => [file.replace(/\.webp$/, ""), file]),
);

let withLogo = 0;
for (const team of teams) {
  const url = teamLogo(team);
  if (url === null) continue;
  withLogo += 1;
  assert.ok(
    logoFiles.has(decodeURIComponent(url.replace("/teams/logos/", ""))),
    `logo for "${team}" points at a missing file: ${url}`,
  );
}
// The reverse direction: an exactly named logo on disk can never be a deliberate
// "no logo", so a stale manifest fails here instead of showing initials forever.
for (const team of teams) {
  const exact = byExactName.get(team);
  if (!exact) continue;
  assert.equal(
    teamLogo(team),
    `/teams/logos/${encodeURIComponent(exact)}`,
    `"${team}" has ${exact} on disk but teamLogo did not resolve it - rerun make-logos-manifest.mjs`,
  );
}
assert.ok(withLogo > 0, "no team resolved a logo at all");
// The renames are the whole point of the table; if a file moves, fail here.
assert.equal(teamLogo("Gen.G"), "/teams/logos/GenG.webp");
assert.equal(
  teamLogo("Fenerbahçe Esports"),
  "/teams/logos/1907%20Fenerbahe%20Esports.webp",
  "non-ASCII and spaces must survive URL encoding",
);
// Every team in the dataset resolves a logo now, so initials are dead code
// unless a future dataset brings a team with no file on disk.
const onInitials = teams.filter((team) => teamLogo(team) === null);
assert.deepEqual(
  onInitials,
  [],
  `these teams fall back to initials: ${onInitials.join(", ")}`,
);
assert.equal(teamLogo("NRG"), "/teams/logos/NRG.webp");
assert.equal(
  teamLogo("Team Secret Whales"),
  "/teams/logos/Team%20Whales.webp",
  "the alias must resolve to the file that is already on disk",
);
assert.equal(teamLogo("Griffin"), "/teams/logos/KOO%20Tigers.webp");
assert.equal(teamLogo("Dplus Kia"), "/teams/logos/KOO%20Tigers.webp");

// Player cutouts are addressed by the dataset spelling, so the invariant is the
// opposite of the logo manifest: a photo that exists under any other spelling
// would 404, and the file set was built to collapse those aliases already
// (Koro1 -> Korol, Vasilii -> Vas1lii, Sword -> Sw0rd, Cloud -> CL0UD).
const playersDir = fileURLToPath(new URL("../../public/players", import.meta.url));
const photoFiles = new Set(
  readdirSync(playersDir).filter((file) => file.endsWith(".webp")),
);
const byPhotoName = new Map(
  [...photoFiles].map((file) => [file.replace(/\.webp$/, ""), file]),
);
const datasetNames = [...new Set(players.map((player) => player.name))];

let withPhoto = 0;
for (const name of datasetNames) {
  const url = playerPhoto(name);
  assert.equal(
    url,
    `/players/${encodeURIComponent(name)}.webp`,
    "playerPhoto must be the plain encoded name",
  );
  if (byPhotoName.has(name)) withPhoto += 1;
}
assert.ok(withPhoto > 0, "no player resolved a photo at all");
// A file on disk whose spelling is also a dataset player must be the one that
// playerPhoto points at, otherwise the alias was never collapsed and the row
// shows an empty box next to a photo that exists.
for (const name of datasetNames) {
  const exact = byPhotoName.get(name);
  if (!exact) continue;
  assert.equal(
    decodeURIComponent(playerPhoto(name).replace("/players/", "")),
    exact,
  );
}
const withoutPhoto = datasetNames.filter((name) => !byPhotoName.has(name));

// make-player-faces.mjs crops every cutout to a 128x128 square around the head,
// because both the roster socket and the rating cell size a 45px box assuming
// that framing. A raw wide cutout silently renders a ~23px face, so the size is
// the contract, not a cosmetic detail.
const rawCutouts: string[] = [];
for (const name of datasetNames) {
  if (!byPhotoName.has(name)) continue;
  const { width, height } = await sharp(`${playersDir}/${name}.webp`).metadata();
  if (width !== 128 || height !== 128) rawCutouts.push(`${name} ${width}x${height}`);
}
assert.deepEqual(
  rawCutouts,
  [],
  `photos that are not 128x128 face crops: ${rawCutouts.join(", ")}`,
);

// Screenshot OCR routes through fuzzy matching, so the confusion cases Tesseract
// actually produces ("AH0", "2O19") must resolve to the right dataset spelling
// and to a year this team really has.
{
  const match = bestTeamMatch("AH0 E-SPORTS", teams);
  assert.equal(
    match.team,
    "ahq eSports Club",
    `OCR "AH0 E-SPORTS" misread: ${match.team} (${match.score.toFixed(2)})`,
  );
  assert.ok(match.score > 0.6, `ahq confidence too low: ${match.score.toFixed(2)}`);
  const thieves = bestTeamMatch("100 THIEVES", teams);
  assert.equal(thieves.team, "100 Thieves", `OCR "100 THIEVES" misread: ${thieves.team}`);
  assert.ok(thieves.score > 0.8);
  assert.equal(bestTeamMatch("", teams).score, 0, "empty OCR text must score 0");

  // Alias resolution: cards render the full brand while the dataset stores the
  // acronym (TSM), and other cards may render the acronym against a full-name
  // team. Both directions must reach the same dataset spelling.
  assert.equal(
    bestTeamMatch("Team SoloMid 2020 score 91.2", teams).team,
    "TSM",
    `full brand must reach the acronym-named team: ${bestTeamMatch("Team SoloMid 2020 score 91.2", teams).team}`,
  );
  assert.equal(bestTeamMatch("SoloMid 2020", teams).team, "TSM");
  assert.equal(bestTeamMatch("TSM 2020", teams).team, "TSM");
  assert.equal(
    bestTeamMatch("RNG 2021 roster 94", teams).team,
    "Royal Never Give Up",
    "acronym on the card must reach the full-name team",
  );
  assert.equal(bestTeamMatch("BLG2025", teams).team, "Bilibili Gaming");
  assert.equal(bestTeamMatch("IG 2022", teams).team, "Invictus Gaming");
  assert.equal(bestTeamMatch("G2 ESPORTS 2018", teams).team, "G2 Esports");
  // The in-game card reads "DragonX" (the org's old name); the dataset stores it
  // under the current sponsor name "Kiwoom DRX".
  assert.equal(
    bestTeamMatch("DragonX 2020", teams).team,
    "Kiwoom DRX",
    `DragonX must resolve to Kiwoom DRX: ${bestTeamMatch("DragonX 2020", teams).team}`,
  );
  assert.equal(
    bestTeamMatch("Gaming Gear 2015", teams).team,
    "Gaminggear.EU",
    '"gam" must not fire inside "Gaming"',
  );
  assert.equal(
    bestTeamMatch("oR TEAM SECRET WHALES i", teams).team,
    "Team Secret Whales",
    "leading badge noise must not anchor the prefix onto Origen",
  );
  assert.equal(
    bestTeamMatch("WE 2017", teams).team,
    "Team WE",
    "a real two-letter brand still resolves without the prefix",
  );
  // Afreeca Freecs (Worlds 2018) is stored under that name; the card must reach
  // it and a 2018 card pins the year by roster.
  assert.equal(
    bestTeamMatch("_~ AFREECA FREECS NN", teams).team,
    "Afreeca Freecs",
    `Afreeca Freecs misread: ${bestTeamMatch("_~ AFREECA FREECS NN", teams).team}`,
  );
  assert.equal(bestTeamMatch("_~ AFREECA FREECS NN", teams).ambiguous, false);
  assert.deepEqual(
    inferYearFromRoster(
      "AFREECA FREECS NN Kiin Spirit Kuro Kramer TusiN",
      "Afreeca Freecs",
      players,
    ),
    { year: 2018, candidates: [2018] },
    "the Afreeca 2018 roster pins 2018",
  );
  assert.deepEqual(
    inferYearFromRoster(
      "oR TEAM SECRET WHALES i Hiro02 Hizto Dire Eddie Taki",
      "Team Secret Whales",
      players,
    ),
    { year: 2025, candidates: [2025] },
    "the real Secret Whales card pins 2025 by roster",
  );
  assert.equal(
    bestTeamMatch("MAD 2021", teams).ambiguous,
    true,
    "MAD covers two teams and must be flagged ambiguous",
  );
  assert.equal(
    bestTeamMatch("Mad Lions KOI 2024", teams).team,
    "MAD Lions KOI",
    "spoken-out name resolves without an ambiguity flag",
  );

  const t1Years = yearsFor("T1", players);
  assert.equal(pickYear("T1 2O25 - ahead", t1Years), 2025);
  assert.equal(pickYear("66.9 81.4 2024", t1Years), 2024);
  assert.equal(pickYear("no year here", t1Years), null);
  assert.equal(pickYear("201", [2019, 2021]), 2019, "dropped glyph must still resolve");
  assert.equal(pickYear("ROX Z020 v", [2020, 2018]), 2020, "Z for digit-2 glyph");
  assert.equal(pickYear("20 24 split", [2024]), 2024, "kerned digits must squash");
  assert.equal(
    pickYear("ahq eSports Club 2O19", yearsFor("ahq eSports Club", players)),
    2019,
  );

  // Year by roster: OCR reads the stylized year badge as "(5)", but the player
  // names below it are clean, and they pin the exact year when they are unique.
  assert.deepEqual(
    inferYearFromRoster("Dyrus Amazing Bjergsen WildTurtle Lustboy", "TSM", players),
    { year: 2014, candidates: [2014] },
    "2014 roster reads clean and is unambiguous",
  );
  assert.deepEqual(
    inferYearFromRoster("Santorin WildTurtle Bjergsen Lustboy Dyrus", "TSM", players),
    { year: 2015, candidates: [2015] },
    "Santorin separates 2015 from 2014",
  );
  assert.deepEqual(
    inferYearFromRoster("Hauntzer Svenskeren Bjergsen Doublelift Biofrost", "TSM", players),
    { year: null, candidates: [2017, 2016] },
    "2016 and 2017 share a roster, so the tie must surface, not pick",
  );
  assert.equal(
    inferYearFromRoster("no names here", "TSM", players).year,
    null,
    "no roster overlap must not guess the year",
  );
  assert.deepEqual(
    inferYearFromRoster("(5) TEAM SOLOMID Dyrus Amazing Bjergsen WildTurtle Lustboy", "TSM", players),
    { year: 2014, candidates: [2014] },
    "the real card header with the mangled badge still pins 2014",
  );
}

console.log(
  `teams.check: ${teams.length} teams, ${withLogo} with logo / ${teams.length - withLogo} on initials, all assertions passed`,
);
console.log(
  `players: ${datasetNames.length} in dataset, ${withPhoto} with photo, all 128x128, ${withoutPhoto.length} on the empty box (${withoutPhoto.join(", ")})`,
);

