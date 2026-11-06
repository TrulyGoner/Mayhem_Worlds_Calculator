export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
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
function similarity(a: string, b: string): number {
  const longer = Math.max(a.length, b.length);
  return longer === 0 ? 1 : 1 - editDistance(a, b) / longer;
}
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
    const full = Math.max(
      partialRatio(needle, normalized),
      partialRatio(normalized, needle),
    );
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
  return bestScore >= 0.75 ? bestYear : null;
}
