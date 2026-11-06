import { confirmPick, rememberMatch, resetTournament, setPendingTeam } from './state.js';
import { SELECTORS, normalize, visibleText, teamFromElement, playerAtClick, opponentFromPage, selectedGroups, optionGroups, hasStartMatch, isGameOver, detectStage } from './dom.js';

function updatePickedFromClick(event, state) {
  const target = event.target instanceof Element ? event.target : null;
  const utilityText = target?.closest(SELECTORS.utilityButton)?.textContent?.trim().toLowerCase() || "";
  if (/play again|играть снова|начать заново/i.test(utilityText)) {
    resetTournament(state);
    return;
  }
  if (/^(start|начать)/i.test(utilityText) && state.picked.length >= 5) {
    rememberMatch(state);
    state.tournamentStarted = true;
    state.matchStarted = true;
    return;
  }
  if (/^(spin|reroll|реролл)/i.test(utilityText)) {
    state.pendingTeam = null;
    state.playerBaseline = null;
    state.roundPicked = null;
    state.matchStarted = false;
    return;
  }
  const yearNode = target?.closest?.(SELECTORS.yearSelect);
  const yearText = yearNode?.textContent?.trim() || target?.textContent?.trim() || "";
  if (/^\d{4}$/.test(yearText)) {
    const team = teamFromElement(target, Number(yearText), state);
    if (team) {
      setPendingTeam(state, team);
      return;
    }
  }
  const directPlayer = target ? playerAtClick(target, state) : null;
  if (directPlayer) {
    return;
  }
  const clickable = target?.closest(SELECTORS.clickableCard);
  const text = clickable?.textContent?.trim() || "";
  if (!text) return;
  const currentPool = new Set(selectedGroups(visibleText(), state).flat().map(key));
  const playerMatches = state.players.filter((player) => {
    const name = normalize(player.name);
    const value = normalize(text);
    return name.length >= 3 && currentPool.has(key(player)) && value === name;
  });
  const teamMatch = state.players.find((player) => normalize(text).includes(normalize(player.team)) && text.includes(String(player.year)));
  if (teamMatch && (playerMatches.length !== 1 || text.length > 80)) {
    setPendingTeam(state, { team: teamMatch.team, year: teamMatch.year });
    return;
  }
  const found = playerMatches[0];
  if (!found || playerMatches.length > 1) return;
  confirmPick(state, found);
}

function noteYearSelection(event, state) {
  const target = event.target instanceof HTMLSelectElement ? event.target : null;
  if (!target || !target.value) return;
  const year = Number(target.value);
  if (!Number.isInteger(year)) return;
  const team = teamFromElement(target, year, state);
  if (!team) return;
  setPendingTeam(state, team);
}

function gain(candidate, state) {
  const { calculateTeamScore } = globalThis.CaclShared || {};
  if (!calculateTeamScore) return 0;
  return calculateTeamScore([...state.picked.filter((player) => player.role !== candidate.role), candidate]) - calculateTeamScore(state.picked);
}

export { updatePickedFromClick, noteYearSelection };