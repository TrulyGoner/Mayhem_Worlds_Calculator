import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { Player, Role } from "./game.ts";
import { playerPhoto, teamLogo } from "./logos.ts";
import {
  calculateTeamScore,
  scoreBreakdown,
  withTies,
} from "./scoring.ts";
import { stageCeiling, stageChances } from "./stages.ts";
import { coverageAxes, coverageScore, weakestAxis } from "./coverage.ts";
import { buildCombos } from "./combos.ts";
import { clearBoard, loadBoard, recordResult } from "./leaderboard.ts";
import { parsePlayer } from "./ratings.ts";
import { freeYears, inferYearFromRoster, rosterFor, yearsFor } from "./teams.ts";
import { bestTeamMatch, pickYear } from "./fuzzy.ts";

type RatingRow = {
  player: string;
  team: string;
  year: number;
  position: string;
  placement: string;
  // The JSON carries no `score` column: the app takes it from
  // adjusted_competition_score in src/lib/ratings.ts (bonuses are already
  // folded into that value). The score assertions below mirror that formula.
  adjusted_competition_score: number;
  games: unknown;
  raw_stat_values: unknown;
  confidence_multiplier: unknown;
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
  placement: row.placement as Player["placement"],
}));

// The extended stats only exist after the real loader has parsed
// raw_stat_values, and coverage reads exactly those. Built through parsePlayer
// so the assertions below cannot drift away from what the app actually shows.
const statPlayers: Player[] = rows.map((row, index) =>
  parsePlayer(row, index),
);

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

// Every derived score must be a real number: a missing input field arrives as
// undefined and silently disables the score sort.
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

// Lineup strength carries two dispersion terms on top of the role-weighted
// average. They read the spread of the ratings, never the identity of the
// players, so the invariants below are about shape: which roster sizes produce a
// net bonus, and where the two ceilings stop cancelling each other out.
{
  const at = (role: Role, score: number): Player => ({
    id: `${role}-${score}`,
    name: `${role}-${score}`,
    role,
    score,
    year: 2024,
    team: "Check",
  });

  assert.deepEqual(
    scoreBreakdown([]),
    { power: 0, base: 0, carryBonus: 0, weakPenalty: 0, weakRole: null },
    "an empty lineup must score 0, not NaN",
  );

  // The role weights sum to 1, so an all-equal lineup scores exactly its own
  // rating with no dispersion either way. This pins the weight table too.
  const flat = [
    at("TOP", 90),
    at("JUNGLE", 90),
    at("MID", 90),
    at("ADC", 90),
    at("SUPPORT", 90),
  ];
  assert.equal(calculateTeamScore(flat), 90, "role weights must sum to 1");

  // One player has no spread to measure, so power collapses onto base.
  const solo = scoreBreakdown([at("MID", 90)]);
  assert.equal(solo.power, solo.base);
  assert.equal(solo.carryBonus, 0);
  assert.equal(solo.weakPenalty, 0);
  assert.equal(solo.weakRole, "MID");

  // Two players: both terms measure the same half-gap with the same 0.2 factor,
  // so they cancel exactly while the gap stays under the penalty ceiling.
  const even = scoreBreakdown([at("TOP", 90), at("SUPPORT", 88)]);
  assert.equal(even.power, even.base, "a near-even pair must net zero");
  assert.ok(even.carryBonus > 0, "a spread pair must produce a nonzero bonus");
  assert.ok(Math.abs(even.carryBonus - even.weakPenalty) < 1e-12);

  // Past the ceiling the two caps differ (2.5 carry vs 2 penalty), so a lopsided
  // pair keeps a positive delta instead of cancelling. The local dataset never
  // reaches this range, which is why its pairs all read power === base.
  const lopsided = scoreBreakdown([at("TOP", 100), at("SUPPORT", 60)]);
  assert.equal(lopsided.carryBonus, 2.5);
  assert.equal(lopsided.weakPenalty, 2);
  assert.equal(Number((lopsided.power - lopsided.base).toFixed(10)), 0.5);
  assert.equal(lopsided.weakRole, "SUPPORT");

  // A third rating adds a carry term with no counterpart on the penalty side,
  // which is where the dataset's negative trio deltas come from.
  const trio = scoreBreakdown([at("TOP", 95), at("MID", 92), at("SUPPORT", 88)]);
  assert.ok(trio.carryBonus > 0 && trio.weakPenalty > 0, "both terms must be live");
  assert.ok(
    trio.power < trio.base,
    `a trio inside the caps must land below base, got ${trio.power - trio.base}`,
  );
  assert.equal(trio.weakRole, "SUPPORT");

  // A substitute never outranks the starter it shares a role with.
  const withSub = scoreBreakdown([at("MID", 88), at("MID", 96), at("TOP", 90)]);
  assert.equal(
    withSub.power,
    scoreBreakdown([at("MID", 96), at("TOP", 90)]).power,
    "a weaker substitute must not change the lineup score",
  );
}

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

// Stage chances are a logistic fit over the real historical lineups, so the
// properties that matter are shape properties, not fixed numbers: chances stay in
// range, rise with power, tighten in the same order as their cutoffs, and the
// ceiling is the hardest stage still above a coin flip.
{
  const STAGE_IDS = ["WINNER", "FINALIST", "SEMIFINALIST", "QUARTERFINALIST"];
  const ladder = [60, 72, 78, 82, 86, 89, 92, 96];
  const perPower = ladder.map((power) => stageChances(players, power));

  for (const [index, chances] of perPower.entries()) {
    const power = ladder[index];
    assert.equal(chances.length, 4, `expected 4 stages at power ${power}`);
    for (const chance of chances) {
      assert.ok(
        chance.chance >= 0 && chance.chance <= 1,
        `chance out of range at power ${power}: ${chance.chance}`,
      );
      assert.ok(Number.isFinite(chance.cutoff), `cutoff not finite at ${power}`);
      assert.ok(
        Math.abs(chance.margin - (power - chance.cutoff)) < 1e-9,
        "margin must be power minus cutoff",
      );
    }
    // Tightest stage first, so a bigger cutoff means a harder stage.
    assert.deepEqual(
      chances.map((chance) => chance.id),
      STAGE_IDS,
      `stages out of order at power ${power}`,
    );
    assert.ok(
      chances.every(
        (chance, i) => i === 0 || chance.cutoff < chances[i - 1].cutoff,
      ),
      `cutoffs must decrease down the list at power ${power}`,
    );
  }

  // More power can only help. Compared stage to stage, not across the sorted
  // list, since the ordering is by cutoff and not by the queried power.
  for (const id of STAGE_IDS) {
    const series = perPower.map(
      (chances) => chances.find((chance) => chance.id === id)!,
    );
    for (let i = 1; i < series.length; i++) {
      assert.ok(
        series[i].chance >= series[i - 1].chance - 1e-9,
        `${id} chance fell from ${series[i - 1].chance} to ${series[i].chance}`,
      );
    }
  }

  // Anchors on the fitted cutoffs. The best real lineup sits at 95.1, so these
  // only hold because the cutoffs come from our own power scale rather than
  // loldle's 81/84/92/97, whose 97 is above anything this dataset can produce.
  const champion = stageChances(players, 89.5).find((c) => c.id === "WINNER")!;
  assert.ok(
    Math.abs(champion.chance - 0.5) < 0.05,
    `championship must be a coin flip at its own cutoff, got ${champion.chance}`,
  );
  for (const chance of stageChances(players, 95.1)) {
    assert.ok(
      chance.chance > 0.95,
      `the strongest real lineup should clear ${chance.id}, got ${chance.chance}`,
    );
  }

  // Ceiling is the hardest stage still above 50%, not the biggest percentage,
  // which always belongs to the easiest stage once the curve saturates.
  assert.equal(stageCeiling(stageChances(players, 60))?.id, undefined);
  assert.equal(stageCeiling(stageChances(players, 96))?.id, "WINNER");

  // A partial roster must not produce NaN, and an empty list must not throw.
  const partial = scoreBreakdown(players.slice(0, 3));
  for (const chance of stageChances(players, partial.power)) {
    assert.ok(Number.isFinite(chance.chance), "partial roster gave NaN");
  }
  for (const chance of stageChances([], 90)) {
    assert.equal(chance.chance, 0, "no ratings rows must fall back to zero");
  }
  for (const chance of stageChances(players, 0)) {
    assert.equal(chance.chance, 0, "zero power must fall back to zero");
  }
}

{
  // Coverage is a designed heuristic over four stat groups, so the assertions are
  // about its shape and its independence from the score, not about a threshold.
  const axes = coverageAxes(statPlayers.slice(0, 5), statPlayers);
  assert.ok(axes.length > 0, "a full roster must expose at least one axis");
  for (const axis of axes) {
    assert.ok(
      axis.value >= 0 && axis.value <= 100,
      `axis ${axis.key} escaped 0..100: ${axis.value}`,
    );
  }

  // Normalisation has to actually separate rosters, otherwise every axis would
  // read the same. A roster of the five best raw values on one stat must beat the
  // five highest-rated players on that axis — score and raw stats genuinely
  // disagree, so this is what proves the axis is measuring something.
  const statOf: Record<string, "goldDiff15" | "kp" | "dpm" | "clearWards"> = {
    lane: "goldDiff15",
    fight: "kp",
    damage: "dpm",
    vision: "clearWards",
  };
  const byScore = coverageAxes(
    [...statPlayers].sort((left, right) => right.score - left.score).slice(0, 5),
    statPlayers,
  );
  for (const axis of byScore) {
    const stat = statOf[axis.key];
    const specialists = coverageAxes(
      [...statPlayers]
        .filter((player) => player[stat] !== undefined)
        .sort((left, right) => right[stat]! - left[stat]!)
        .slice(0, 5),
      statPlayers,
    ).find((candidate) => candidate.key === axis.key);
    assert.ok(
      specialists !== undefined && specialists.value > axis.value,
      `axis ${axis.key} did not separate specialists (${axis.key}) from the top-rated roster`,
    );
  }

  // An empty roster or an empty baseline has nothing to measure, so it reports no
  // axis rather than inventing a flat 50 that would read as "perfectly balanced".
  assert.deepEqual(coverageAxes([], statPlayers), []);
  assert.deepEqual(coverageAxes([statPlayers[0]], []), []);

  const gap = weakestAxis(axes);
  assert.ok(gap === null || gap.gap >= 0, "axis gap cannot be negative");
  // A single measured axis has nothing to compare against, so it reports no gap
  // instead of a fake 0 that would read as "perfectly balanced".
  assert.equal(weakestAxis(axes.slice(0, 1)), null);

  // Deterministic: the same roster against the same baseline must not drift
  // between renders, or the bars would flicker as the summary re-computes.
  const roster = statPlayers.slice(0, 5);
  assert.deepEqual(
    coverageAxes(roster, statPlayers),
    coverageAxes(roster, statPlayers),
  );
  assert.ok(
    coverageScore(axes) > 0,
    "a roster with stats must score above zero on coverage",
  );
}

{
  // Node has no localStorage, and the module deliberately never lets a storage
  // failure escape, so the stub is the only way to exercise the failure paths.
  const store = new Map<string, string>();
  let failWrites = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error("quota exceeded");
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });

  clearBoard();
  assert.deepEqual(loadBoard(), [], "a cleared board reads empty");

  // Descending by power, and a repeated score replaces its own row instead of
  // stacking up duplicate leaderboard entries.
  let board = recordResult(70, 3);
  board = recordResult(88, 5);
  board = recordResult(75, 4);
  board = recordResult(88, 5);
  assert.deepEqual(
    board.map((row) => row.power),
    [88, 75, 70],
  );
  assert.equal(loadBoard().length, 3, "the board must survive a reload");
  assert.equal(loadBoard()[0].picks, 5);

  // Top 10 only.
  for (let index = 0; index < 20; index += 1) {
    board = recordResult(index, 5);
  }
  assert.equal(board.length, 10, "the board is capped at ten rows");
  // 88/75/70 outrank everything in 0..19, so the invariant worth asserting is
  // the ordering itself, not any particular row landing at a given index.
  assert.deepEqual(
    board.map((row) => row.power),
    [...board.map((row) => row.power)].sort((left, right) => right - left),
  );
  assert.equal(board[0].power, 88, "the best score leads the board");

  // A quota failure must not throw and must not corrupt what is in memory.
  failWrites = true;
  board = recordResult(99, 5);
  assert.equal(board[0].power, 99, "the returned board survives a refused write");
  failWrites = false;

  // Anything unreadable in storage degrades to an empty board rather than
  // rendering NaN rows.
  for (const key of store.keys()) store.set(key, "{not json");
  assert.deepEqual(loadBoard(), [], "corrupt storage reads as empty");
  store.set("cacl.leaderboard.v1", JSON.stringify([{ nope: 1 }, 7, null]));
  assert.deepEqual(loadBoard(), [], "wrongly shaped rows are dropped");

  clearBoard();
  Reflect.deleteProperty(globalThis, "localStorage");
}

{
  // A combo is a set, so the list must never contain the same set twice.
  const { pairs, trios } = buildCombos(statPlayers);
  assert.ok(pairs.length > 12, `expected a real ranking, got ${pairs.length}`);
  assert.ok(trios.length > 12, `expected a real ranking, got ${trios.length}`);

  for (const [label, list, size] of [
    ["pairs", pairs, 2],
    ["trios", trios, 3],
  ] as const) {
    const keys = list.map((combo) =>
      combo.players
        .map((player) => player.id)
        .sort()
        .join("-"),
    );
    assert.equal(
      new Set(keys).size,
      keys.length,
      `${label} repeat the same player set`,
    );

    for (const combo of list) {
      const roles = combo.players.map((player) => player.role);
      assert.equal(
        new Set(roles).size,
        roles.length,
        `${label} repeats a role inside one combo: ${roles.join(",")}`,
      );
      assert.equal(combo.players.length, size, `${label} has the wrong size`);
    }

    // Descending, and on the same scale as a real roster score.
    assert.deepEqual(
      list.map((combo) => Math.round(combo.power * 10)),
      list
        .map((combo) => Math.round(combo.power * 10))
        .sort((left, right) => right - left),
      `${label} are not ranked by descending power`,
    );
    assert.ok(
      list[0].power <=
        Math.max(...statPlayers.map((player) => player.score)) + 1e-9,
      `${label} top power ${list[0].power} exceeds the best player score, so it is not on the ratings scale`,
    );

    // Pairs cancel their two dispersion terms exactly; a trio does not.
    if (size === 2) {
      assert.ok(
        list.every(
          (combo) =>
            Math.abs(combo.carry - combo.weak) < 1e-9,
        ),
        "a pair must have carry === weak",
      );
    } else {
      assert.ok(
        list.some((combo) => combo.carry > 0 || combo.weak > 0),
        "a trio must expose a dispersion term",
      );
    }
  }

  // The top row of each list has to be a real pair/trio, not a placeholder.
  assert.equal(pairs[0].players.length, 2);
  assert.equal(trios[0].players.length, 3);
  assert.deepEqual(buildCombos([]), { pairs: [], trios: [] });
}

console.log(
  `teams.check: ${teams.length} teams, ${withLogo} with logo / ${teams.length - withLogo} on initials, all assertions passed`,
);
console.log(
  `players: ${datasetNames.length} in dataset, ${withPhoto} with photo, all 128x128, ${withoutPhoto.length} on the empty box (${withoutPhoto.join(", ")})`,
);

