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
const statPlayers: Player[] = rows.map((row, index) =>
  parsePlayer(row, index),
);

const ROLE_ORDER: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const teams = [...new Set(players.map((player) => player.team))].sort();
assert.ok(teams.length > 0, "no teams found");
for (const team of teams) {
  assert.ok(yearsFor(team, players).length > 0, `${team} offers no years`);
}
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
assert.deepEqual(
  rosterFor("Bilibili Gaming", 2024, players).map((player) => player.name),
  ["Bin", "Xun", "Wei", "Knight", "Elk", "ON"],
);
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
assert.equal(rosterFor("T1", 2016, players).length, 0);
const t1Years = yearsFor("T1", players);
assert.ok(t1Years.length >= 2, "T1 needs 2+ years for this check");
const sameTeam = [
  { team: "T1", year: t1Years[0] },
  { team: "T1", year: null },
];
assert.deepEqual(freeYears("T1", players, sameTeam, 1), t1Years.slice(1));
assert.deepEqual(freeYears("T1", players, sameTeam, 0), t1Years);
const exactDup = [
  { team: "T1", year: t1Years[0] },
  { team: "T1", year: t1Years[0] },
];
assert.ok(
  !freeYears("T1", players, exactDup, 1).includes(t1Years[0]),
  "the same T1 year was offered twice",
);
assert.deepEqual(
  freeYears("Fnatic", players, sameTeam, 1),
  yearsFor("Fnatic", players),
);
const byGain = (row: { gain: number }) => row.gain;
assert.deepEqual(withTies([], 12, byGain), [], "empty list must stay empty");
assert.deepEqual(withTies([{ gain: 9 }], 12, byGain), [{ gain: 9 }]);
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
const clean = [{ gain: 3 }, { gain: 2 }, { gain: 1 }, { gain: 0.5 }];
assert.deepEqual(withTies(clean, 2, byGain).map(byGain), [3, 2]);
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
  const flat = [
    at("TOP", 90),
    at("JUNGLE", 90),
    at("MID", 90),
    at("ADC", 90),
    at("SUPPORT", 90),
  ];
  assert.equal(calculateTeamScore(flat), 90, "role weights must sum to 1");
  const solo = scoreBreakdown([at("MID", 90)]);
  assert.equal(solo.power, solo.base);
  assert.equal(solo.carryBonus, 0);
  assert.equal(solo.weakPenalty, 0);
  assert.equal(solo.weakRole, "MID");
  const even = scoreBreakdown([at("TOP", 90), at("SUPPORT", 88)]);
  assert.equal(even.power, even.base, "a near-even pair must net zero");
  assert.ok(even.carryBonus > 0, "a spread pair must produce a nonzero bonus");
  assert.ok(Math.abs(even.carryBonus - even.weakPenalty) < 1e-12);
  const lopsided = scoreBreakdown([at("TOP", 100), at("SUPPORT", 60)]);
  assert.equal(lopsided.carryBonus, 2.5);
  assert.equal(lopsided.weakPenalty, 2);
  assert.equal(Number((lopsided.power - lopsided.base).toFixed(10)), 0.5);
  assert.equal(lopsided.weakRole, "SUPPORT");
  const trio = scoreBreakdown([at("TOP", 95), at("MID", 92), at("SUPPORT", 88)]);
  assert.ok(trio.carryBonus > 0 && trio.weakPenalty > 0, "both terms must be live");
  assert.ok(
    trio.power < trio.base,
    `a trio inside the caps must land below base, got ${trio.power - trio.base}`,
  );
  assert.equal(trio.weakRole, "SUPPORT");
  const withSub = scoreBreakdown([at("MID", 88), at("MID", 96), at("TOP", 90)]);
  assert.equal(
    withSub.power,
    scoreBreakdown([at("MID", 96), at("TOP", 90)]).power,
    "a weaker substitute must not change the lineup score",
  );
}
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
assert.equal(teamLogo("Gen.G"), "/teams/logos/GenG.webp");
assert.equal(
  teamLogo("Fenerbahçe Esports"),
  "/teams/logos/1907%20Fenerbahe%20Esports.webp",
  "non-ASCII and spaces must survive URL encoding",
);
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
for (const name of datasetNames) {
  const exact = byPhotoName.get(name);
  if (!exact) continue;
  assert.equal(
    decodeURIComponent(playerPhoto(name).replace("/players/", "")),
    exact,
  );
}
const withoutPhoto = datasetNames.filter((name) => !byPhotoName.has(name));
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
  assert.equal(stageCeiling(stageChances(players, 60))?.id, undefined);
  assert.equal(stageCeiling(stageChances(players, 96))?.id, "WINNER");
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
  const axes = coverageAxes(statPlayers.slice(0, 5), statPlayers);
  assert.ok(axes.length > 0, "a full roster must expose at least one axis");
  for (const axis of axes) {
    assert.ok(
      axis.value >= 0 && axis.value <= 100,
      `axis ${axis.key} escaped 0..100: ${axis.value}`,
    );
  }
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
  assert.deepEqual(coverageAxes([], statPlayers), []);
  assert.deepEqual(coverageAxes([statPlayers[0]], []), []);

  const gap = weakestAxis(axes);
  assert.ok(gap === null || gap.gap >= 0, "axis gap cannot be negative");
  assert.equal(weakestAxis(axes.slice(0, 1)), null);
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
  for (let index = 0; index < 20; index += 1) {
    board = recordResult(index, 5);
  }
  assert.equal(board.length, 10, "the board is capped at ten rows");
  assert.deepEqual(
    board.map((row) => row.power),
    [...board.map((row) => row.power)].sort((left, right) => right - left),
  );
  assert.equal(board[0].power, 88, "the best score leads the board");
  failWrites = true;
  board = recordResult(99, 5);
  assert.equal(board[0].power, 99, "the returned board survives a refused write");
  failWrites = false;
  for (const key of store.keys()) store.set(key, "{not json");
  assert.deepEqual(loadBoard(), [], "corrupt storage reads as empty");
  store.set("cacl.leaderboard.v1", JSON.stringify([{ nope: 1 }, 7, null]));
  assert.deepEqual(loadBoard(), [], "wrongly shaped rows are dropped");

  clearBoard();
  Reflect.deleteProperty(globalThis, "localStorage");
}

{
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
