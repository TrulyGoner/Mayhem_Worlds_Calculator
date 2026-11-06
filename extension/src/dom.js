export const SELECTORS = {
  teamCard: [
    '.worlds-mayhem .gc-team',
    '[class*="gc-team"]',
    '[class*="team-card"]',
  ],
  teamName: [
    '.gc-team__name',
    '[class*="team-name"]',
    '[class*="team__name"]',
  ],
  teamYear: [
    '.gc-team__year',
    '[class*="team-year"]',
    '[class*="team__year"]',
  ],
  teamPlayer: [
    '.gc-team__player',
    '[class*="team-player"]',
    '[class*="player-card"]',
  ],
  playerUnavailable: 'gc-team__player--unavailable',
  draftMapPlayer: [
    '.draft-map .map-player--filled img[src*="/WorldsMayhem/Players/"][alt]',
    '[class*="map-player"] img[alt]',
  ],
  yearSelect: '.gc-team__year',
  clickableCard: "button,[role=button],[class*='card'],[class*='team']",
  utilityButton: "button,[role=button]",
  teamInput: '.cacl-team-input',
  teamReset: '.cacl-team-reset',
  refresh: '.cacl-refresh',
  playAgain: '.cacl-play-again',
};

function trySelectors(element, selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const found = element.querySelector(sel);
    if (found) return found;
  }
  return null;
}

function trySelectorsAll(element, selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const found = element.querySelectorAll(sel);
    if (found.length) return found;
  }
  return [];
}

export function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function visibleText() {
  return document.body?.innerText || "";
}

export function detectStage(text) {
  const value = text.toLocaleLowerCase();
  if (/quarter[- ]?final|четвертьфинал/.test(value)) return "ЧЕТВЕРТЬФИНАЛ";
  if (/semi[- ]?final|полуфинал/.test(value)) return "ПОЛУФИНАЛ";
  if (/\bfinal\b|финал/.test(value)) return "ФИНАЛ";
  if (/group stage|групповая стадия/.test(value)) return "ГРУППОВАЯ СТАДИЯ";
  return "";
}

export function isGameOver(text) {
  return /play again|играть снова|начать заново/i.test(text);
}

export function hasStartMatch(text) {
  return /start\s+match|начать\s+матч/i.test(text);
}

export function optionGroups(text, state) {
  const domGroups = [...document.querySelectorAll(SELECTORS.teamCard.join(','))]
    .filter((card) => card.getClientRects().length > 0)
    .map((card) => {
      const team = trySelectors(card, SELECTORS.teamName)?.textContent?.trim() || '';
      const year = Number(trySelectors(card, SELECTORS.teamYear)?.textContent || 0);
      if (!team || !Number.isInteger(year)) return [];
      return [...trySelectorsAll(card, SELECTORS.teamPlayer)].map((node) => {
        const name = normalize(node.textContent || '');
        const role = normalize(node.querySelector('img[alt]')?.getAttribute('alt') || '');
        return state.players.find((player) => normalize(player.name) === name &&
          player.year === year && normalize(player.team) === normalize(team) &&
          (!role || normalize(player.role) === role)) ||
          state.players.find((player) => normalize(player.name) === name &&
            player.year === year && (!role || normalize(player.role) === role));
      }).filter(Boolean);
    }).filter((group) => group.length >= 2);
  if (domGroups.length) return domGroups;
  const groups = new Map();
  for (const player of state.players) {
    const teamNeedle = normalize(player.team);
    const yearNeedle = String(player.year);
    if (!normalize(text).includes(teamNeedle) || !text.includes(yearNeedle)) continue;
    const groupKey = `${player.team}|${player.year}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(player);
  }
  return [...groups.values()].filter((group) => group.length >= 2);
}

export function allTeamLabels(state) {
  return [...new Set(state.players.map((player) => `${player.team} ${player.year}`))].sort();
}

export function groupFromLabel(label, state) {
  const value = normalize(label);
  const match = value.match(/(\d{4})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const teamValue = value.slice(0, -4);
  return state.players.filter((player) => player.year === year && normalize(player.team) === teamValue);
}

export function selectedGroups(text, state) {
  const automatic = optionGroups(text, state);
  return [0, 1, 2]
    .map((index) => groupFromLabel(state.manualSlots[index], state).length >= 2
      ? groupFromLabel(state.manualSlots[index], state)
      : automatic[index] || [])
    .filter((group) => group.length >= 2);
}

export function playerCounts(text, state) {
  const normalizedText = normalize(text);
  const counts = {};
  for (const player of state.players) {
    const needle = normalize(player.name);
    if (needle.length < 3) {
      counts[key(player)] = 0;
      continue;
    }
    let from = 0;
    let count = 0;
    while (needle && (from = normalizedText.indexOf(needle, from)) !== -1) {
      count += 1;
      from += needle.length;
    }
    counts[key(player)] = count;
  }
  return counts;
}

export function teamFromElement(target, year, state) {
  let node = target;
  for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
    const text = node.textContent || "";
    const found = state.players.find((player) => player.year === year && normalize(text).includes(normalize(player.team)));
    if (found) return { team: found.team, year };
  }
  return null;
}

export function playerAtClick(target, state) {
  const playerNode = target?.closest?.(SELECTORS.teamPlayer.join(','));
  if (playerNode) {
    if (playerNode.classList.contains(SELECTORS.playerUnavailable)) return null;
    const card = playerNode.closest('.gc-team') || playerNode.closest('[class*="gc-team"]') || playerNode.closest('[class*="team-card"]');
    const team = normalize(trySelectors(card, SELECTORS.teamName)?.textContent || '');
    const year = Number(trySelectors(card, SELECTORS.teamYear)?.textContent || 0);
    const name = normalize(playerNode.textContent || '');
    const role = normalize(playerNode.querySelector('img[alt]')?.getAttribute('alt') || '');
    const matches = state.players.filter((player) =>
      normalize(player.name) === name &&
      Number(player.year) === year &&
      (!team || normalize(player.team) === team) &&
      (!role || normalize(player.role) === role),
    );
    if (matches.length === 1) return matches[0];
  }
  const currentPool = new Set(selectedGroups(visibleText(), state).flat().map(key));
  let node = target;
  for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
    const text = (node.textContent || "").trim();
    if (!text || text.length > 80) continue;
    const matches = state.players.filter((player) => {
      const name = normalize(player.name);
      const value = normalize(text);
      if (name.length < 3 || !currentPool.has(key(player))) return false;
      return value === name || value === name + normalize(String(player.year)) || value === name + normalize(player.role);
    });
    if (matches.length === 1) return matches[0];
  }
  return null;
}

export function mapPickedPlayers(state) {
  const pageText = normalize(visibleText());
  const images = [...trySelectorsAll(document, SELECTORS.draftMapPlayer)];
  const players = [];
  for (const image of images) {
    const name = image.getAttribute('alt')?.trim() || '';
    if (!name) continue;
    const matches = state.players.filter((player) => normalize(player.name) === normalize(name));
    let node = image;
    let year = 0;
    for (let depth = 0; node && depth < 6 && !year; depth += 1, node = node.parentElement) {
      const match = (node.textContent || '').match(/\b(20\d{2})\b/);
      if (match) year = Number(match[1]);
    }
    const byYear = year ? matches.filter((player) => player.year === year) : [];
    const contextual = matches.filter((player) =>
      pageText.includes(normalize(player.team)) && pageText.includes(String(player.year)),
    );
    const match = byYear[0] || contextual[0] || matches[0];
    if (match && !players.some((player) => key(player) === key(match))) players.push(match);
  }
  return players;
}

export function pagePlayerRows(state) {
  const cards = [...document.querySelectorAll("body *")]
    .filter((node) => !node.closest(`#cacl-worlds-overlay`) && node.children.length === 0 && node.getClientRects().length > 0)
    .map((node) => {
      const name = normalize(node.textContent || "");
      const player = state.players.find((item) => normalize(item.name) === name);
      const rect = node.getBoundingClientRect();
      return player && rect.width > 0 && rect.height > 0
        ? { player, top: rect.top, left: rect.left }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.top - right.top || left.left - right.left);
  const rows = [];
  for (const card of cards) {
    let row = rows.find((item) => Math.abs(item.top - card.top) < 90);
    if (!row) {
      row = { top: card.top, players: [] };
      rows.push(row);
    }
    if (!row.players.some((item) => key(item.player) === key(card.player))) row.players.push(card);
  }
  return rows.filter((row) => row.players.length >= 1).sort((left, right) => left.top - right.top);
}

export function ownPlayersFromPage(state) {
  const rows = pagePlayerRows(state);
  const bottom = rows[rows.length - 1];
  if (!bottom) return mapPickedPlayers(state);
  const bottomKeys = new Set(bottom.players.map((item) => key(item.player)));
  return mapPickedPlayers(state).filter((player) => bottomKeys.has(key(player)));
}

export function opponentFromPage(state) {
  const playerRows = pagePlayerRows(state)
    .filter((row) => row.players.length >= 5)
    .sort((left, right) => left.top - right.top);
  return playerRows[0]?.players.slice(0, 5).map((item) => item.player) ?? null;
}

function key(player) {
  return `${player.name}|${player.team}|${player.year}|${player.role}`;
}