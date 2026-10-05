// OCR output is rough text: "AH0 E-SPORTS" for "ahq e-Sports Club", stray marks
// glued to letters. Rapidfuzz does not exist here, so the same scores that the
// Python sketch used are reproduced in ~40 lines.

export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Full-matrix Levenshtein, O(min * max) time. The longest team name is short,
// and the match step runs a handful of times per screenshot, so memoization or
// Damerau would be over-engineering: `ponytail: plain DP, add bit-parallel
// Myers only if the scan ever covers many cards at once`.
function editDistance(a: string, b: string): number {
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

// 1 at identical, heading to 0 as the edit cost grows relative to the length.
function similarity(a: string, b: string): number {
  const longer = Math.max(a.length, b.length);
  return longer === 0 ? 1 : 1 - editDistance(a, b) / longer;
}

// Slide the (normalized) OCR line along the full team name and keep the best
// window: Tesseract glues or splits "e-Sports Club" unpredictably, and the
// sliding window survives both.
function partialRatio(needle: string, hay: string): number {
  if (!needle) return 1;
  if (!hay) return 0;
  if (hay.length <= needle.length) return similarity(needle, hay);
  let best = 0;
  for (let start = 0; start + needle.length <= hay.length; start += 1) {
    best = Math.max(best, similarity(needle, hay.slice(start, start + needle.length)));
  }
  return best;
}

// Worlds team aliases. The game UI renders some cards under the full brand name
// while the dataset stores the acronym (TSM), and other cards may show the
// acronym while the dataset keeps the full name ("RNG" for Royal Never Give
// Up). One label can cover several teams — "MAD" belongs to both MAD Team and
// MAD Lions KOI — and bestTeamMatch flags that as ambiguous instead of picking
// silently.
export const TEAM_ALIASES: ReadonlyMap<string, readonly string[]> = new Map([
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
  // The in-game card reads "DragonX" (the org's 2018-2020 name); the dataset
  // stores it under the current sponsor name.
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
  // Afreeca Freecs played Worlds 2018 under this name; the card must reach the
  // dataset spelling, and the old modern-org name still resolves for stale
  // saves or sloppy search input ("dn", "soopers").
  ["afreecafreecs", ["Afreeca Freecs"]],
  ["afreeca", ["Afreeca Freecs"]],
  ["freecs", ["Afreeca Freecs"]],
  ["dnsoopers", ["Afreeca Freecs"]],
]);

// Best match of OCR text against the real team names. Returns the pair, a 0..1
// confidence, and whether the top pick is ambiguous (several teams share the
// winning alias). The caller shows a review row either way, so a wrong pick at
// 0.95 is caught by the user, and a right pick at 0.5 is not blocked.
//
// The naive max-over-windows favours any team that ends in "Esports" — OCR
// "AH0 E-SPORTS" scores 0.9 against Fenerbahçe Esports and beats the real ahq.
// Teams are named by their brand first and their league suffix second, so the
// first OCR token carries more weight than the shared tail. Both measures are
// kept: "100" alone cannot separate "100 Thieves" from anything, the full text
// can.
//
// Every team is scored against its own alias labels in addition to its name,
// so TSM (stored under the acronym) is reachable from a card reading "TEAM
// SOLOMID". A label only counts when it visibly appears in the OCR text: a
// short acronym must stand as its own token ("RNG 2021") or sit glued to the
// year ("RNG2021"), never inside an unrelated word ("gam" in "Gaming").
export function bestTeamMatch(
  text: string,
  teamNames: readonly string[],
): { team: string; score: number; ambiguous: boolean } {
  const normalized = normalize(text);
  if (!normalized) return { team: "", score: 0, ambiguous: false };
  const tokens = text
    .split(/\s+/)
    .map((part) => normalize(part))
    .filter((part) => part !== "");
  const firstToken = tokens[0] ?? "";

  const surfaced: [string, readonly string[]][] = [];
  for (const [label, targets] of TEAM_ALIASES) {
    if (
      label.length > 3
        ? normalized.includes(label)
        : tokens.some(
            (token) =>
              token === label ||
              (token.startsWith(label) &&
                /^\d+$/.test(token.slice(label.length))),
          )
    ) {
      surfaced.push([label, targets]);
    }
  }

  const prefixScore = (first: string): number => {
    if (!first || !firstToken) return 0;
    const length = Math.min(firstToken.length, first.length);
    if (length === 0) return 0;
    return (
      1 -
      editDistance(firstToken.slice(0, length), first.slice(0, length)) / length
    );
  };

  const scoreFor = (needle: string, anchor: string): number => {
    // Both directions: the OCR line may be longer than the window (trailing
    // noise) or shorter (clipped name), and max covers either bias.
    const full = Math.max(
      partialRatio(needle, normalized),
      partialRatio(normalized, needle),
    );
    // A one- or two-character lead token ("oR", "(5") is almost always badge
    // noise, and anchoring the weighted prefix on it lets any team whose brand
    // starts the same way win ("or" -> Origen). Real short brands (G2, WE, IG,
    // T1) still resolve through the full-text half, whose window is 1.0 for
    // their own names and aliases.
    return firstToken.length < 3 ? full : 0.55 * prefixScore(anchor) + 0.45 * full;
  };

  const ranked: { team: string; score: number; winner: string }[] = [];
  for (const team of teamNames) {
    const anchor = normalize(team.split(/\s+/)[0] ?? "");
    const candidates: [string, string, string][] = [
      [normalize(team), anchor, `name:${team}`],
    ];
    for (const [label, targets] of surfaced) {
      if (targets.includes(team)) candidates.push([label, label, `alias:${label}`]);
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

// Pick a year out of OCR text, but only one that the matched team really has.
// The screen renders stylized digits where "2O19" is a real misread, so digit
// runs get a permissive fold (O/Q/D->0, l/I/|->1, Z->2, S->5, B->8, G->6) and a
// whitespace squash for kerned spacing ("20 24"), and the result is then
// matched against `years`. An empty result means "no year seen": the review row
// shows an empty select and the user picks by hand.
export function pickYear(text: string, years: readonly number[]): number | null {
  if (years.length === 0) return null;
  const tokens = new Set<string>();
  const collect = (source: string) => {
    for (const token of source.match(/\d{3,4}/g) ?? []) tokens.add(token);
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
  collect(text.replace(/\s+/g, ""));

  const yearsAsString = years.map(String);
  let bestYear: number | null = null;
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
  // 0.75 covers "201" for "2019" (dropped glyph) and "2013"->"013" fonts; lower
  // lets a stray "2013" score column on the card hijack the year.
  return bestScore >= 0.75 ? bestYear : null;
}