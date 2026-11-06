const initialState = {
  players: [],
  picked: [],
  opponent: [],
  history: [],
  stage: "",
  tournamentStarted: false,
  manualSlots: ["", "", ""],
  roundPicked: null,
  pendingTeam: null,
  playerBaseline: null,
  lastRound: "",
  mapKeys: "",
  matchStarted: false,
  timer: 0,
};

export function createState() {
  return { ...initialState };
}

export function resetState(state) {
  Object.assign(state, initialState);
}

export function setPendingTeam(state, team) {
  state.pendingTeam = team;
  state.playerBaseline = null;
  state.roundPicked = null;
}

export function confirmPick(state, player) {
  if (state.tournamentStarted) return;
  if (state.picked.length >= 5 && !state.picked.some((item) => key(item) === key(player))) return;
  state.roundPicked = player;
  state.picked = [...state.picked.filter((item) => item.role !== player.role), player];
  state.pendingTeam = null;
  state.playerBaseline = null;
}

export function rememberMatch(state) {
  if (state.picked.length < 5) return;
  const opponent = state.opponent.length ? state.opponent : null;
  if (!opponent) return;
  const signature = `${state.stage}|${state.picked.map(key).join("||")}|${opponent.map(key).join("||")}`;
  if (state.history.some((match) => match.signature === signature)) return;
  state.history.push({
    signature,
    stage: state.stage || "МАТЧ",
    picked: [...state.picked],
    opponent,
  });
}

export function resetTournament(state) {
  resetState(state);
}

export function key(player) {
  return `${player.name}|${player.team}|${player.year}|${player.role}`;
}