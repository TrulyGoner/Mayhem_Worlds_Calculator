import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = resolve(root, "dist-extension");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Copy static assets
await cp(resolve(root, "extension/manifest.json"), resolve(out, "manifest.json"));
await cp(resolve(root, "extension/content.css"), resolve(out, "content.css"));
await cp(resolve(root, "public/roles"), resolve(out, "roles"), { recursive: true });

const ratingsRaw = await readFile(
  resolve(root, "public/data/worlds_mayhem_ratings.json"),
  "utf8",
);
const ratings = JSON.parse(ratingsRaw);
const extensionRatings = {
  version: ratings.version,
  updatedAt: ratings.updatedAt,
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

// Build shared bundle for extension (pure JS, no TS syntax)
const sharedSource = `
// Shared modules for extension (auto-generated from src/shared)

const ROLE_WEIGHTS = { TOP: 0.17, JUNGLE: 0.20, MID: 0.24, ADC: 0.23, SUPPORT: 0.16 };
const CARRY_CAP = 2.5;
const WEAK_CAP = 2;

function scoreBreakdown(players) {
  const byRole = new Map();
  for (const player of players) {
    if (!Number.isFinite(player.score)) continue;
    const held = byRole.get(player.role);
    if (held === undefined || player.score > held.score) {
      byRole.set(player.role, player);
    }
  }
  if (byRole.size === 0) return { power: 0, base: 0, carryBonus: 0, weakPenalty: 0, weakRole: null };

  const ratings = [];
  let weighted = 0;
  let weight = 0;
  let weakRole = null;
  for (const [role, player] of byRole) {
    ratings.push(player.score);
    weighted += player.score * ROLE_WEIGHTS[role];
    weight += ROLE_WEIGHTS[role];
    if (weakRole === null || player.score < byRole.get(weakRole).score) {
      weakRole = role;
    }
  }

  const base = weighted / weight;
  const sorted = [...ratings].sort((left, right) => right - left);
  const mean = ratings.reduce((sum, score) => sum + score, 0) / ratings.length;
  const aboveMean = (index) => sorted[index] - mean;

  const carryBonus = Math.min(
    CARRY_CAP,
    0.2 * Math.max(0, aboveMean(0)) +
      (sorted.length > 1 ? 0.12 * Math.max(0, aboveMean(1)) : 0) +
      (sorted.length > 2 ? 0.04 * Math.max(0, aboveMean(2)) : 0),
  );
  const weakPenalty = Math.min(
    WEAK_CAP,
    0.2 * Math.max(0, -aboveMean(sorted.length - 1)) +
      (sorted.length > 1
        ? 0.1 * Math.max(0, -aboveMean(sorted.length - 2))
        : 0),
  );

  return {
    power: base + carryBonus - weakPenalty,
    base,
    carryBonus,
    weakPenalty,
    weakRole,
  };
}

function calculateTeamScore(players) {
  return Math.round(scoreBreakdown(players).power * 10) / 10;
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (a.length > b.length) [a, b] = [b, a];
  let previous = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j += 1) {
    const current = [j];
    for (let i = 1; i <= a.length; i += 1) {
      current[i] = Math.min(
        previous[i] + 1,
        current[i - 1] + 1,
        previous[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[a.length];
}

function similarity(a, b) {
  const longer = Math.max(a.length, b.length);
  return longer === 0 ? 1 : 1 - editDistance(a, b) / longer;
}

function partialRatio(needle, hay) {
  if (!needle) return 1;
  if (!hay) return 0;
  if (hay.length <= needle.length) return similarity(needle, hay);
  let best = 0;
  for (let start = 0; start + needle.length <= hay.length; start += 1) {
    best = Math.max(best, similarity(needle, hay.slice(start, start + needle.length)));
  }
  return best;
}

const TEAM_ALIASES = new Map([
  ["tsm", ["TSM"]],
  ["teamsolomid", ["TSM"]],
  ["solomid", ["TSM"]],
  ["omg", ["Oh My God"]],
  ["rng", ["Royal Never Give Up"]],
  ["tes", ["Top Esports"]],
  ["jdg", ["JD Gaming"]],
  ["edg", ["EDward Gaming"]],
  ["blg", ["Bilibili Gaming"]],
  ["wbg", ["Weibo Gaming"]],
  ["lng", ["LNG Esports"]],
  ["lgd", ["LGD Gaming"]],
  ["ig", ["Invictus Gaming"]],
  ["clg", ["Counter Logic Gaming"]],
  ["fpx", ["FunPlus Phoenix"]],
  ["g2", ["G2 Esports"]],
  ["h2k", ["H2k-Gaming"]],
  ["fnc", ["Fnatic"]],
  ["c9", ["Cloud9"]],
  ["tl", ["Team Liquid"]],
  ["kt", ["KT Rolster"]],
  ["skt", ["SK Telecom T1"]],
  ["skt1", ["SK Telecom T1"]],
  ["dwg", ["Dplus Kia"]],
  ["dwgkia", ["Dplus Kia"]],
  ["dk", ["Dplus Kia"]],
  ["drx", ["Kiwoom DRX"]],
  ["dragonx", ["Kiwoom DRX"]],
  ["gam", ["GAM Esports"]],
  ["cfo", ["CTBC Flying Oyster"]],
  ["psg", ["PSG Talon"]],
  ["tpa", ["Taipei Assassins"]],
  ["uol", ["Unicorns of Love.CIS"]],
  ["unicornsoflove", ["Unicorns of Love.CIS"]],
  ["dfm", ["DetonatioN FocusMe"]],
  ["anx", ["Albus NoX Luna"]],
  ["png", ["paiN Gaming"]],
  ["fw", ["Flash Wolves"]],
  ["mad", ["MAD Lions KOI", "MAD Team"]],
  ["madlionskoi", ["MAD Lions KOI"]],
  ["madteam", ["MAD Team"]],
  ["fenerbahce", ["Fenerbahçe Esports"]],
  ["1907fenerbahce", ["Fenerbahçe Esports"]],
  ["we", ["Team WE"]],
  ["imt", ["Immortals"]],
  ["kabum", ["KaBuM! Esports"]],
  ["afreecafreecs", ["Afreeca Freecs"]],
  ["afreeca", ["Afreeca Freecs"]],
  ["freecs", ["Afreeca Freecs"]],
  ["dnsoopers", ["Afreeca Freecs"]],
]);

function bestTeamMatch(text, teamNames) {
  const normalized = normalize(text);
  if (!normalized) return { team: "", score: 0, ambiguous: false };
  const tokens = text
    .split(/\\s+/)
    .map((part) => normalize(part))
    .filter((part) => part !== "");
  const firstToken = tokens[0] ?? "";

  const surfaced = [];
  for (const [label, targets] of TEAM_ALIASES) {
    if (
      label.length > 3
        ? normalized.includes(label)
        : tokens.some(
            (token) =>
              token === label ||
              (token.startsWith(label) && /^\\d+$/.test(token.slice(label.length))),
          )
    ) {
      surfaced.push([label, targets]);
    }
  }

  const prefixScore = (first) => {
    if (!first || !firstToken) return 0;
    const length = Math.min(firstToken.length, first.length);
    if (length === 0) return 0;
    return 1 - editDistance(firstToken.slice(0, length), first.slice(0, length)) / length;
  };

  const scoreFor = (needle, anchor) => {
    const full = Math.max(partialRatio(needle, normalized), partialRatio(normalized, needle));
    return firstToken.length < 3 ? full : 0.55 * prefixScore(anchor) + 0.45 * full;
  };

  const ranked = [];
  for (const team of teamNames) {
    const anchor = normalize(team.split(/\\s+/)[0] ?? "");
    const candidates = [[normalize(team), anchor, \`name:\${team}\`]];
    for (const [label, targets] of surfaced) {
      if (targets.includes(team)) candidates.push([label, label, \`alias:\${label}\`]);
    }
    let bestScore = 0;
    let winner = "";
    for (const [needle, anchorKey, key] of candidates) {
      const score = scoreFor(needle, anchorKey);
      if (score > bestScore) {
        bestScore = score;
        winner = key;
      }
    }
    if (bestScore > 0) ranked.push({ team, score: bestScore, winner });
  }

  if (ranked.length === 0) return { team: "", score: 0, ambiguous: false };
  ranked.sort((left, right) => right.score - left.score);
  const top = ranked[0];
  const ambiguous =
    top.winner.startsWith("alias:") &&
    ranked.some(
      (entry, index) =>
        index > 0 &&
        entry.score >= top.score - 1e-9 &&
        entry.winner === top.winner,
    );
  return { team: top.team, score: top.score, ambiguous };
}

function pickYear(text, years) {
  if (years.length === 0) return null;
  const tokens = new Set();
  const collect = (source) => {
    for (const token of source.match(/\\d{3,4}/g) ?? []) tokens.add(token);
  };
  collect(text);
  const folded = text
    .replace(/[OoQqDd]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/[Zz]/g, "2")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8")
    .replace(/[Gg]/g, "6");
  collect(folded);
  collect(text.replace(/\\s+/g, ""));

  const yearsAsString = years.map(String);
  let bestYear = null;
  let bestScore = 0;
  for (const token of tokens) {
    for (const candidate of yearsAsString) {
      const score = similarity(token, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestYear = Number(candidate);
      }
    }
  }
  return bestScore >= 0.75 ? bestYear : null;
}

const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

function yearsFor(team, players) {
  return [
    ...new Set(
      players
        .filter((player) => player.team === team)
        .map((player) => player.year),
    ),
  ].sort((left, right) => right - left);
}

function freeYears(team, players, slots, index) {
  const used = new Set(
    slots
      .filter((_, position) => position !== index)
      .filter((slot) => slot.team === team && slot.year !== null)
      .map((slot) => slot.year),
  );
  return yearsFor(team, players).filter((year) => !used.has(year));
}

function rosterFor(team, year, players) {
  return players
    .filter((player) => player.team === team && player.year === year)
    .sort(
      (left, right) =>
        ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role) ||
        right.score - left.score,
    );
}

function inferYearFromRoster(text, team, players) {
  const normalized = normalize(text);
  const tokens = text
    .split(/\\s+/)
    .map((part) => normalize(part))
    .filter((part) => part !== "");
  const nameHit = (name) => {
    const folded = normalize(name);
    if (!folded) return false;
    if (folded.length >= 3 && tokens.includes(folded)) return true;
    return folded.length >= 5 && normalized.includes(folded);
  };

  let bestCount = 0;
  let candidates = [];
  for (const year of yearsFor(team, players)) {
    const count = rosterFor(team, year, players).filter((player) => nameHit(player.name)).length;
    if (count > bestCount) {
      bestCount = count;
      candidates = [year];
    } else if (count === bestCount) {
      candidates.push(year);
    }
  }
  return bestCount >= 2
    ? { year: candidates.length === 1 ? candidates[0] : null, candidates }
    : { year: null, candidates: [] };
}

// Export to global scope
globalThis.CaclShared = {
  ROLE_WEIGHTS,
  CARRY_CAP,
  WEAK_CAP,
  calculateTeamScore,
  scoreBreakdown,
  normalize,
  TEAM_ALIASES,
  bestTeamMatch,
  pickYear,
  ROLE_ORDER,
  yearsFor,
  freeYears,
  rosterFor,
  inferYearFromRoster,
};
`;

await writeFile(resolve(out, "shared.js"), sharedSource);

// Build extension content.js bundle from src/
async function buildExtensionBundle() {
  const srcDir = resolve(root, "extension/src");
  const modules = [
    "utils.js",
    "state.js",
    "dom.js",
    "render-utils.js",
    "render.js",
    "events-handlers.js",
    "events.js",
    "index.js",
  ];
  
  let bundle = "// Extension bundle (auto-generated)\n\n";
  for (const mod of modules) {
    const content = await readFile(resolve(srcDir, mod), "utf8");
    bundle += `\n// --- ${mod} ---\n${content}\n`;
  }
  
  // Replace imports with inline code
  bundle = bundle
    .replace(/import\s+.*?from\s+['"].*?['"];?/g, "")
    .replace(/export\s+/g, "");
  
  await writeFile(resolve(out, "content.js"), bundle);
}

await buildExtensionBundle();

console.log(`Extension written to ${out}`);
