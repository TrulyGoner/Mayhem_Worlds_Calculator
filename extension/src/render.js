import { escapeHtml, roleIcon } from './render-utils.js';
import { calculateTeamScore, scoreBreakdown } from '../shared/scoring.js';

function renderRoundState(state) {
  if (state.picked.length >= 5) {
    const sorted = [...state.picked].sort((a, b) => b.score - a.score);
    const teams = new Set(state.picked.map((player) => `${player.team} ${player.year}`));
    return `<aside class="cacl-round-state complete"><div class="cacl-round-state-label">СОСТАВ СОБРАН</div><strong>${calculateTeamScore(state.picked).toFixed(1)} SCORE</strong><small>Средний рейтинг: ${(state.picked.reduce((sum, player) => sum + player.score, 0) / state.picked.length).toFixed(1)}</small><small>Лучший: ${escapeHtml(sorted[0].name)} · ${sorted[0].score.toFixed(1)}</small><small>Команд в составе: ${teams.size}</small></aside>`;
  }
  if (state.roundPicked) {
    const player = state.roundPicked;
    return `<aside class="cacl-round-state"><div class="cacl-round-state-label">ПИК ПОДТВЕРЖДЁН</div><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.team)} ${player.year}</small><small>${player.role} · score ${player.score.toFixed(1)}</small></aside>`;
  }
  if (state.pendingTeam) {
    return `<aside class="cacl-round-state waiting"><div class="cacl-round-state-label">СОСТАВ ВЫБРАН</div><strong>${escapeHtml(state.pendingTeam.team)}</strong><small>${state.pendingTeam.year} · теперь выбери игрока</small></aside>`;
  }
  return "";
}

function renderPicked(state) {
  const rows = state.picked.length
    ? state.picked.map((player) => `<div class="cacl-roster-row"><span class="cacl-roster-role">${roleIcon(player.role)}${escapeHtml(player.role)}</span><span class="cacl-roster-player"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.team)} ${player.year}</small></span><em>${player.score.toFixed(1)}</em></div>`).join("")
    : `<div class="cacl-muted">Игроки ещё не выбраны.</div>`;
  return `<div class="cacl-roster"><div class="cacl-roster-head"><span class="cacl-roster-label">ТЕКУЩИЙ СОСТАВ · ${state.picked.length}/5</span><strong class="cacl-roster-score">${calculateTeamScore(state.picked).toFixed(1)}</strong></div>${rows}</div>`;
}

function renderMatchSummary(state) {
  const ourScore = calculateTeamScore(state.picked);
  const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
  const rows = (players) => roles.map((role) => players.find((player) => player.role === role)).filter(Boolean).map((player) =>
    `<div class="cacl-match-player"><span>${roleIcon(player.role)}<strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.team)} ${player.year}</small></span><em>${player.score.toFixed(1)}</em></div>`,
  ).join("");
  const pageOpponent = opponentFromPage(state);
  if (pageOpponent) state.opponent = pageOpponent;
  const opponent = state.opponent.length ? state.opponent : null;
  if (!opponent) {
    return `<div class="cacl-match-summary waiting-match">
      <div class="cacl-match-title">СОСТАВ СОБРАН · ИЩУ СОПЕРНИКА</div>
      <div class="cacl-match-score">
        <div class="cacl-match-side blue"><span>ВАША КОМАНДА</span><strong>${ourScore.toFixed(1)}</strong></div>
        <b>VS</b>
        <div class="cacl-match-side red"><span>ОППОНЕНТЫ</span><strong>—</strong></div>
      </div>
      <div class="cacl-match-waiting">Ожидаю карточки пятёрки соперника на странице.</div>
      <div class="cacl-match-team blue"><div>ВАША ПЯТЁРКА · BLUE</div>${rows(state.picked)}</div>
    </div>`;
  }
  const opponentScore = calculateTeamScore(opponent);
  return `<div class="cacl-match-summary">
    <div class="cacl-match-title">СИМУЛЯЦИЯ МАТЧА</div>
    <div class="cacl-match-score">
      <div class="cacl-match-side blue"><span>ВАША КОМАНДА</span><strong>${ourScore.toFixed(1)}</strong></div>
      <b>VS</b>
      <div class="cacl-match-side red"><span>ОППОНЕНТЫ</span><strong>${opponentScore.toFixed(1)}</strong></div>
    </div>
    <div class="cacl-match-teams">
      <div class="cacl-match-team blue"><div>ВАША ПЯТЁРКА · BLUE</div>${rows(state.picked)}</div>
      <div class="cacl-match-team red"><div>ПЯТЁРКА ОППОНЕНТОВ · RED</div>${rows(opponent)}</div>
    </div>
  </div>`;
}

function renderTournamentStage(state) {
  const completed = state.history.length;
  return `<div class="cacl-tournament-stage"><div class="cacl-match-title">ТУРНИРНАЯ ИГРА</div><strong>${escapeHtml(state.stage || "МАТЧ")}</strong><p>Пики завершены. Игра продолжается автоматически.</p><div class="cacl-stage-progress"><span class="done">ГРУППА</span><i>→</i><span class="${state.stage === "ЧЕТВЕРТЬФИНАЛ" || completed > 1 ? "done" : ""}">ЧЕТВЕРТЬФИНАЛ</span><i>→</i><span class="${state.stage === "ПОЛУФИНАЛ" || completed > 2 ? "done" : ""}">ПОЛУФИНАЛ</span><i>→</i><span class="${state.stage === "ФИНАЛ" ? "active" : ""}">ФИНАЛ</span></div></div>${renderMatchSummary(state)}`;
}

function renderTournamentSummary(state) {
  const matches = state.history.map((match) => {
    const names = match.picked.map((player) => escapeHtml(player.name)).join(" · ");
    const opponents = match.opponent.map((player) => escapeHtml(player.name)).join(" · ");
    return `<div class="cacl-history-match"><strong>${escapeHtml(match.stage)}</strong><small>BLUE ${calculateTeamScore(match.picked).toFixed(1)} · ${names}</small><small>RED ${calculateTeamScore(match.opponent).toFixed(1)} · ${opponents}</small></div>`;
  }).join("");
  return `<div class="cacl-tournament-summary"><div class="cacl-match-title">ТУРНИР ЗАВЕРШЁН</div><div class="cacl-history-list">${matches || '<div class="cacl-match-waiting">Пики матчей ещё не сохранены.</div>'}</div><button type="button" class="cacl-play-again">PLAY AGAIN</button></div>`;
}

function renderTeams(automatic, state) {
  return state.manualSlots.map((value, index) => {
    const automaticGroup = automatic[index] || [];
    const automaticLabel = automaticGroup[0]
      ? `${automaticGroup[0].team} ${automaticGroup[0].year}`
      : "";
    const displayValue = value || automaticLabel;
    const label = displayValue || "Команда не найдена";
    const parts = displayValue.match(/^(.*)\s(\d{4})$/);
    const name = parts ? parts[1] : label;
    const year = parts ? parts[2] : "—";
    const detected = automaticGroup.length >= 2 || groupFromLabel(value, state).length >= 2;
    return `<div class="cacl-team-card ${detected ? "detected" : ""}"><div class="cacl-team-card-head"><span>КОМАНДА ${index + 1}</span><span class="cacl-team-card-state">${detected ? "OK" : "—"}</span></div><div class="cacl-team-name">${escapeHtml(name)}</div><div class="cacl-team-meta">СОСТАВ ${escapeHtml(year)} · ${detected ? automaticGroup.length || groupFromLabel(value, state).length : 0} игроков</div><div class="cacl-team-row"><span class="cacl-team-no">↳</span><input class="cacl-team-input" data-slot="${index}" list="cacl-team-labels" value="${escapeHtml(displayValue)}" placeholder="Исправить команду"><button class="cacl-team-reset" data-reset="${index}" title="Сбросить">×</button></div></div>`;
  }).join("");
}

function renderMain(state, roundText, status, complete, labels, automatic) {
  const pickedRoles = new Set(state.picked.map((player) => player.role));
  const groups = selectedGroups(visibleText(), state);
  const candidates = groups.flat().filter((player) =>
    !state.picked.some((picked) => key(picked) === key(player)) && !pickedRoles.has(player.role),
  )
    .map((player) => ({ player, gain: gain(player, state) }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);
  const teams = complete ? "" : renderTeams(automatic, state);
  const list = candidates.length
    ? candidates.map(({ player, gain: value }) => `<div class="cacl-pick"><strong>${escapeHtml(player.name)}</strong><em>${value >= 0 ? "+" : ""}${value.toFixed(1)}</em><small>${escapeHtml(player.team)} ${player.year} · ${player.role} · рейтинг ${player.score.toFixed(1)}</small></div>`).join("")
    : `<div class="cacl-muted">Пока нет доступного кандидата.</div>`;
  return `<section class="cacl-panel"><div class="cacl-head"><div><div class="cacl-kicker">CACL WORLDS MAYHEM</div><div class="cacl-title">Лучший пик</div></div><button class="cacl-refresh" title="Обновить">↻</button></div><div class="cacl-round">${roundText}</div><div class="cacl-status">${status}</div>${complete ? renderMatchSummary(state) : renderPicked(state)}<div class="cacl-teams">${teams}</div><datalist id="cacl-team-labels">${labels.map((label) => `<option value="${escapeHtml(label)}"></option>`).join("")}</datalist><div class="cacl-picks-layout"><div class="cacl-list">${list}</div>${renderRoundState(state)}</div></section>`;
}

function renderGameOver(state) {
  return `<section class="cacl-panel"><div class="cacl-head"><div><div class="cacl-kicker">CACL WORLDS MAYHEM</div><div class="cacl-title">Турнир завершён</div></div><button class="cacl-refresh" title="Обновить">↻</button></div>${renderTournamentSummary(state)}</section>`;
}

function renderTournament(state) {
  return `<section class="cacl-panel"><div class="cacl-head"><div><div class="cacl-kicker">CACL WORLDS MAYHEM</div><div class="cacl-title">Лучший пик</div></div><button class="cacl-refresh" title="Обновить">↻</button></div><div class="cacl-round">${state.stage || "ТУРНИР"}</div>${renderTournamentStage(state)}</section>`;
}

export function render(state, extensionUrl, SELECTORS) {
  const text = visibleText();
  const detectedStage = detectStage(text);
  const round = text.match(/Round\s+(\d+)\s*\/\s*(\d+)/i);
  const roundText = `${state.stage ? `${state.stage} · ` : ""}${round ? `Раунд ${round[1]} / ${round[2]}` : "Ожидаю карточки раунда"}`;
  const roundNumber = round?.[1] || "";
  const groups = selectedGroups(text, state);
  const automatic = optionGroups(text, state);
  const complete = state.picked.length >= 5;
  const status = complete ? "" : groups.length
    ? `${groups.length} команд найдено · состав ${state.picked.length}/5`
    : "Не вижу команды и годы. Нажми Spin или дождись загрузки.";
  const labels = allTeamLabels(state);

  let html;
  if (isGameOver(text)) {
    html = renderGameOver(state);
  } else if (state.tournamentStarted) {
    if (detectedStage) state.stage = detectedStage;
    html = renderTournament(state);
  } else {
    html = renderMain(state, roundText, status, complete, labels, automatic);
  }
  return html;
}

// Re-export needed functions
export { renderRoundState, renderPicked, renderMatchSummary, renderTournamentStage, renderTournamentSummary, renderTeams, renderMain, renderGameOver, renderTournament };