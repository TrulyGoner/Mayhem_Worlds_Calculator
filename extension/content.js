(() => {
  const HOST_ID = "cacl-worlds-overlay";
  const DATA_URL = "worlds_mayhem_ratings.json";
  const ROLE_WEIGHTS = { TOP: .17, JUNGLE: .20, MID: .24, ADC: .23, SUPPORT: .16 };
  const extensionApi = globalThis.browser || globalThis.chrome;
  const state = { players: [], picked: [], opponent: [], history: [], stage: "", tournamentStarted: false, manualSlots: ["", "", ""], roundPicked: null, pendingTeam: null, playerBaseline: null, lastRound: "", mapKeys: "", matchStarted: false, timer: 0 };

  function extensionUrl(path) {
    try {
      return extensionApi?.runtime?.getURL(path) || "";
    } catch {
      return "";
    }
  }

  function isInvalidatedContext(error) {
    return /Extension context invalidated/i.test(String(error?.message || error));
  }

  window.addEventListener("error", (event) => {
    if (!isInvalidatedContext(event.error || event.message)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    if (!isInvalidatedContext(event.reason)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const shadowStyle = document.createElement("link");
  shadowStyle.rel = "stylesheet";
  shadowStyle.href = extensionUrl("content.css");
  const root = document.createElement("div");
  shadow.append(shadowStyle, root);
  document.documentElement.appendChild(host);

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  }

  function visibleText() {
    return document.body?.innerText || "";
  }
  function key(player) { return `${player.name}|${player.team}|${player.year}|${player.role}`; }
  function normalize(value) { return value.toLocaleLowerCase().replace(/[^a-zа-я0-9]/gi, ""); }

  function detectStage(text) {
    const value = text.toLocaleLowerCase();
    if (/quarter[- ]?final|четвертьфинал/.test(value)) return "ЧЕТВЕРТЬФИНАЛ";
    if (/semi[- ]?final|полуфинал/.test(value)) return "ПОЛУФИНАЛ";
    if (/\bfinal\b|финал/.test(value)) return "ФИНАЛ";
    if (/group stage|групповая стадия/.test(value)) return "ГРУППОВАЯ СТАДИЯ";
    return "";
  }

  function isGameOver(text) {
    return /play again|играть снова|начать заново/i.test(text);
  }

  function hasStartMatch(text) {
    return /start\s+match|начать\s+матч/i.test(text);
  }

  function score(players) {
    const byRole = new Map();
    for (const player of players) {
      const current = byRole.get(player.role);
      if (!current || player.score > current.score) byRole.set(player.role, player);
    }
    if (!byRole.size) return 0;
    let weighted = 0;
    let weight = 0;
    const ratings = [];
    for (const [role, player] of byRole) {
      weighted += player.score * ROLE_WEIGHTS[role];
      weight += ROLE_WEIGHTS[role];
      ratings.push(player.score);
    }
    const mean = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
    const sorted = [...ratings].sort((a, b) => b - a);
    const carry = Math.min(2.5,
      .2 * Math.max(0, sorted[0] - mean) +
      (sorted.length > 1 ? .12 * Math.max(0, sorted[1] - mean) : 0) +
      (sorted.length > 2 ? .04 * Math.max(0, sorted[2] - mean) : 0));
    const weak = Math.min(2,
      .2 * Math.max(0, mean - sorted[sorted.length - 1]) +
      (sorted.length > 1 ? .1 * Math.max(0, mean - sorted[sorted.length - 2]) : 0));
    return weighted / weight + carry - weak;
  }

  function gain(candidate) {
    return score([...state.picked.filter((player) => player.role !== candidate.role), candidate]) - score(state.picked);
  }

  function optionGroups(text) {
    const domGroups = [...document.querySelectorAll('.worlds-mayhem .gc-team')]
      .filter((card) => card.getClientRects().length > 0)
      .map((card) => {
      const team = card.querySelector('.gc-team__name')?.textContent?.trim() || '';
      const year = Number(card.querySelector('.gc-team__year')?.textContent || 0);
      if (!team || !Number.isInteger(year)) return [];
      return [...card.querySelectorAll('.gc-team__player')].map((node) => {
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

  function allTeamLabels() {
    return [...new Set(state.players.map((player) => `${player.team} ${player.year}`))].sort();
  }

  function groupFromLabel(label) {
    const value = normalize(label);
    const match = value.match(/(\d{4})$/);
    if (!match) return [];
    const year = Number(match[1]);
    const teamValue = value.slice(0, -4);
    return state.players.filter((player) => player.year === year && normalize(player.team) === teamValue);
  }

  function selectedGroups(text) {
    const automatic = optionGroups(text);
    return [0, 1, 2]
      .map((index) => groupFromLabel(state.manualSlots[index]).length >= 2
        ? groupFromLabel(state.manualSlots[index])
        : automatic[index] || [])
      .filter((group) => group.length >= 2);
  }

  function playerCounts(text) {
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

  function teamFromElement(target, year) {
    let node = target;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      const text = node.textContent || "";
      const found = state.players.find((player) => player.year === year && normalize(text).includes(normalize(player.team)));
      if (found) return { team: found.team, year };
    }
    return null;
  }

  function noteYearSelection(event) {
    const target = event.target instanceof HTMLSelectElement ? event.target : null;
    if (!target || !target.value) return;
    const year = Number(target.value);
    if (!Number.isInteger(year)) return;
    const team = teamFromElement(target, year);
    if (!team) return;
    state.pendingTeam = team;
    state.playerBaseline = null;
    state.roundPicked = null;
  }

  function playerAtClick(target) {
    const playerNode = target?.closest?.('.gc-team__player');
    if (playerNode) {
      if (playerNode.classList.contains('gc-team__player--unavailable')) return null;
      const card = playerNode.closest('.gc-team');
      const team = normalize(card?.querySelector('.gc-team__name')?.textContent || '');
      const year = Number(card?.querySelector('.gc-team__year')?.textContent || 0);
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
    const currentPool = new Set(selectedGroups(visibleText()).flat().map(key));
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

  function mapPickedPlayers() {
    const pageText = normalize(visibleText());
    const images = [...document.querySelectorAll('.draft-map .map-player--filled img[src*="/WorldsMayhem/Players/"][alt]')];
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

  function pagePlayerRows() {
    const cards = [...document.querySelectorAll("body *")]
      .filter((node) => !node.closest(`#${HOST_ID}`) && node.children.length === 0 && node.getClientRects().length > 0)
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

  function ownPlayersFromPage() {
    const rows = pagePlayerRows();
    const bottom = rows[rows.length - 1];
    if (!bottom) return mapPickedPlayers();
    const bottomKeys = new Set(bottom.players.map((item) => key(item.player)));
    return mapPickedPlayers().filter((player) => bottomKeys.has(key(player)));
  }

  function syncMapPicks() {
    if (state.tournamentStarted) return;
    if (state.picked.length >= 5) return;
    const players = ownPlayersFromPage();
    if (!players.length) return;
    const signature = players.map(key).sort().join('||');
    if (signature === state.mapKeys) return;
    state.mapKeys = signature;
    state.picked = players;
  }

  function roleIcon(role) {
    const files = { TOP: 'top.png', JUNGLE: 'jungle.png', MID: 'middle.png', ADC: 'adc.png', SUPPORT: 'support.webp' };
    const file = files[String(role).toUpperCase()];
    const src = file ? extensionUrl(`roles/${file}`) : "";
    return src
      ? `<img class="cacl-role-icon" src="${escapeHtml(src)}" alt="" aria-hidden="true">`
      : `<i class="cacl-role-icon" data-role="${escapeHtml(role)}" aria-hidden="true"></i>`;
  }

  function updatePickedFromClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const utilityText = target?.closest("button,[role=button]")?.textContent?.trim().toLowerCase() || "";
    if (/play again|играть снова|начать заново/i.test(utilityText)) {
      resetTournament();
      return;
    }
    if (/^(start|начать)/i.test(utilityText) && state.picked.length >= 5) {
      rememberMatch();
      state.tournamentStarted = true;
      state.matchStarted = true;
      setTimeout(safeRender, 0);
      return;
    }
    if (/^(spin|reroll|реролл)/i.test(utilityText)) {
      state.pendingTeam = null;
      state.playerBaseline = null;
      state.roundPicked = null;
      state.matchStarted = false;
      return;
    }
    const yearNode = target?.closest?.('.gc-team__year');
    const yearText = yearNode?.textContent?.trim() || target?.textContent?.trim() || "";
    if (/^\d{4}$/.test(yearText)) {
      const team = teamFromElement(target, Number(yearText));
      if (team) {
        state.pendingTeam = team;
        state.playerBaseline = null;
        state.roundPicked = null;
        return;
      }
    }
    const directPlayer = target ? playerAtClick(target) : null;
    if (directPlayer) {
      return;
    }
    const clickable = target?.closest("button,[role=button],[class*='card'],[class*='team']");
    const text = clickable?.textContent?.trim() || "";
    if (!text) return;
    const currentPool = new Set(selectedGroups(visibleText()).flat().map(key));
    const playerMatches = state.players.filter((player) => {
      const name = normalize(player.name);
      const value = normalize(text);
      return name.length >= 3 && currentPool.has(key(player)) && value === name;
    });
    const teamMatch = state.players.find((player) => normalize(text).includes(normalize(player.team)) && text.includes(String(player.year)));
    if (teamMatch && (playerMatches.length !== 1 || text.length > 80)) {
      state.pendingTeam = { team: teamMatch.team, year: teamMatch.year };
      return;
    }
    const found = playerMatches[0];
    if (!found || playerMatches.length > 1) return;
    confirmPick(found);
  }

  function renderRoundState() {
    if (state.picked.length >= 5) {
      const sorted = [...state.picked].sort((a, b) => b.score - a.score);
      const teams = new Set(state.picked.map((player) => `${player.team} ${player.year}`));
      return `<aside class="cacl-round-state complete"><div class="cacl-round-state-label">СОСТАВ СОБРАН</div><strong>${score(state.picked).toFixed(1)} SCORE</strong><small>Средний рейтинг: ${(state.picked.reduce((sum, player) => sum + player.score, 0) / state.picked.length).toFixed(1)}</small><small>Лучший: ${escapeHtml(sorted[0].name)} · ${sorted[0].score.toFixed(1)}</small><small>Команд в составе: ${teams.size}</small></aside>`;
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

  function confirmPick(player) {
    if (state.tournamentStarted) return;
    if (state.picked.length >= 5 && !state.picked.some((item) => key(item) === key(player))) return;
    state.roundPicked = player;
    state.picked = [...state.picked.filter((item) => item.role !== player.role), player];
    state.pendingTeam = null;
    state.playerBaseline = null;
  }

  function renderPicked() {
    const rows = state.picked.length
      ? state.picked.map((player) => `<div class="cacl-roster-row"><span class="cacl-roster-role">${roleIcon(player.role)}${escapeHtml(player.role)}</span><span class="cacl-roster-player"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.team)} ${player.year}</small></span><em>${player.score.toFixed(1)}</em></div>`).join("")
      : `<div class="cacl-muted">Игроки ещё не выбраны.</div>`;
    return `<div class="cacl-roster"><div class="cacl-roster-head"><span class="cacl-roster-label">ТЕКУЩИЙ СОСТАВ · ${state.picked.length}/5</span><strong class="cacl-roster-score">${score(state.picked).toFixed(1)}</strong></div>${rows}</div>`;
  }

  function opponentFromPage() {
    const playerRows = pagePlayerRows()
      .filter((row) => row.players.length >= 5)
      .sort((left, right) => left.top - right.top);
    return playerRows[0]?.players.slice(0, 5).map((item) => item.player) ?? null;
  }

  function rememberMatch() {
    if (state.picked.length < 5) return;
    const opponent = state.opponent.length ? state.opponent : opponentFromPage();
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

  function resetTournament() {
    lastHtml = "";
    state.picked = [];
    state.opponent = [];
    state.history = [];
    state.stage = "";
    state.tournamentStarted = false;
    state.roundPicked = null;
    state.pendingTeam = null;
    state.playerBaseline = null;
    state.lastRound = "";
    state.mapKeys = "";
    state.matchStarted = false;
    safeRender();
  }

  function renderTournamentSummary() {
    const matches = state.history.map((match) => {
      const names = match.picked.map((player) => escapeHtml(player.name)).join(" · ");
      const opponents = match.opponent.map((player) => escapeHtml(player.name)).join(" · ");
      return `<div class="cacl-history-match"><strong>${escapeHtml(match.stage)}</strong><small>BLUE ${score(match.picked).toFixed(1)} · ${names}</small><small>RED ${score(match.opponent).toFixed(1)} · ${opponents}</small></div>`;
    }).join("");
    return `<div class="cacl-tournament-summary"><div class="cacl-match-title">ТУРНИР ЗАВЕРШЁН</div><div class="cacl-history-list">${matches || '<div class="cacl-match-waiting">Пики матчей ещё не сохранены.</div>'}</div><button type="button" class="cacl-play-again">PLAY AGAIN</button></div>`;
  }

  function renderTournamentStage() {
    const completed = state.history.length;
    return `<div class="cacl-tournament-stage"><div class="cacl-match-title">ТУРНИРНАЯ ИГРА</div><strong>${escapeHtml(state.stage || "МАТЧ")}</strong><p>Пики завершены. Игра продолжается автоматически.</p><div class="cacl-stage-progress"><span class="done">ГРУППА</span><i>→</i><span class="${state.stage === "ЧЕТВЕРТЬФИНАЛ" || completed > 1 ? "done" : ""}">ЧЕТВЕРТЬФИНАЛ</span><i>→</i><span class="${state.stage === "ПОЛУФИНАЛ" || completed > 2 ? "done" : ""}">ПОЛУФИНАЛ</span><i>→</i><span class="${state.stage === "ФИНАЛ" ? "active" : ""}">ФИНАЛ</span></div></div>${renderMatchSummary()}`;
  }

  function renderMatchSummary() {
    const ourScore = score(state.picked);
    const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
    const rows = (players) => roles.map((role) => players.find((player) => player.role === role)).filter(Boolean).map((player) =>
      `<div class="cacl-match-player"><span>${roleIcon(player.role)}<strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.team)} ${player.year}</small></span><em>${player.score.toFixed(1)}</em></div>`,
    ).join("");
    const pageOpponent = opponentFromPage();
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
    const opponentScore = score(opponent);
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

  function renderTeams(automatic) {
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
      const detected = automaticGroup.length >= 2 || groupFromLabel(value).length >= 2;
      return `<div class="cacl-team-card ${detected ? "detected" : ""}"><div class="cacl-team-card-head"><span>КОМАНДА ${index + 1}</span><span class="cacl-team-card-state">${detected ? "OK" : "—"}</span></div><div class="cacl-team-name">${escapeHtml(name)}</div><div class="cacl-team-meta">СОСТАВ ${escapeHtml(year)} · ${detected ? automaticGroup.length || groupFromLabel(value).length : 0} игроков</div><div class="cacl-team-row"><span class="cacl-team-no">↳</span><input class="cacl-team-input" data-slot="${index}" list="cacl-team-labels" value="${escapeHtml(displayValue)}" placeholder="Исправить команду"><button class="cacl-team-reset" data-reset="${index}" title="Сбросить">×</button></div></div>`;
    }).join("");
  }

  let lastHtml = "";

  function render() {
    if (host.shadowRoot.activeElement?.classList?.contains("cacl-team-input")) return;
    const text = visibleText();
    const detectedStage = detectStage(text);
    if (isGameOver(text)) {
      rememberMatch();
      const gameOverHtml = `<section class="cacl-panel"><div class="cacl-head"><div><div class="cacl-kicker">CACL WORLDS MAYHEM</div><div class="cacl-title">Турнир завершён</div></div><button class="cacl-refresh" title="Обновить">↻</button></div>${renderTournamentSummary()}</section>`;
      if (gameOverHtml === lastHtml) return;
      lastHtml = gameOverHtml;
      root.innerHTML = gameOverHtml;
      root.querySelector(".cacl-refresh")?.addEventListener("click", safeRender);
      root.querySelector(".cacl-play-again")?.addEventListener("click", resetTournament);
      return;
    }
    if (!state.tournamentStarted && state.picked.length >= 5 && !hasStartMatch(text)) {
      if (detectedStage) state.stage = detectedStage;
      state.opponent = opponentFromPage() || state.opponent;
      rememberMatch();
      state.tournamentStarted = true;
    }
    if (state.tournamentStarted && state.stage && detectedStage && state.stage !== detectedStage) {
      rememberMatch();
      state.stage = detectedStage;
      state.opponent = opponentFromPage() || [];
    }
    if (state.tournamentStarted) {
      if (detectedStage) state.stage = detectedStage;
      const tournamentHtml = `<section class="cacl-panel"><div class="cacl-head"><div><div class="cacl-kicker">CACL WORLDS MAYHEM</div><div class="cacl-title">Лучший пик</div></div><button class="cacl-refresh" title="Обновить">↻</button></div><div class="cacl-round">${state.stage || "ТУРНИР"}</div>${renderTournamentStage()}</section>`;
      if (tournamentHtml === lastHtml) return;
      lastHtml = tournamentHtml;
      root.innerHTML = tournamentHtml;
      root.querySelector(".cacl-refresh")?.addEventListener("click", safeRender);
      return;
    }
    if (state.stage && detectedStage && state.stage !== detectedStage) {
      rememberMatch();
      state.stage = detectedStage;
      state.opponent = opponentFromPage() || [];
    }
    if (detectedStage) state.stage = detectedStage;
    const groups = selectedGroups(text);
    const automatic = optionGroups(text);
    const round = text.match(/Round\s+(\d+)\s*\/\s*(\d+)/i);
    const roundText = `${state.stage ? `${state.stage} · ` : ""}${round ? `Раунд ${round[1]} / ${round[2]}` : "Ожидаю карточки раунда"}`;
    const roundNumber = round?.[1] || "";
    if (state.lastRound && roundNumber && state.lastRound !== roundNumber) {
      rememberMatch();
      state.pendingTeam = null;
      state.playerBaseline = null;
      state.mapKeys = "";
      state.matchStarted = false;
    }
    syncMapPicks();
    const counts = playerCounts(text);
    if (state.pendingTeam && !state.playerBaseline) state.playerBaseline = counts;
    if (state.pendingTeam && state.playerBaseline) {
      const selected = state.players.find((player) =>
        player.team === state.pendingTeam.team &&
        player.year === state.pendingTeam.year &&
        counts[key(player)] > state.playerBaseline[key(player)],
      );
      if (selected) {
        confirmPick(selected);
      }
    }
    state.lastRound = roundNumber;
    const pickedRoles = new Set(state.picked.map((player) => player.role));
    const candidates = groups.flat().filter((player) =>
      !state.picked.some((picked) => key(picked) === key(player)) && !pickedRoles.has(player.role),
    )
      .map((player) => ({ player, gain: gain(player) }))
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 3);
    const complete = state.picked.length >= 5;
    const status = complete ? "" : groups.length
      ? `${groups.length} команд найдено · состав ${state.picked.length}/5`
      : "Не вижу команды и годы. Нажми Spin или дождись загрузки.";
    const labels = allTeamLabels();
    const teams = complete ? "" : renderTeams(automatic);
    const list = candidates.length
      ? candidates.map(({ player, gain: value }) => `<div class="cacl-pick"><strong>${escapeHtml(player.name)}</strong><em>${value >= 0 ? "+" : ""}${value.toFixed(1)}</em><small>${escapeHtml(player.team)} ${player.year} · ${player.role} · рейтинг ${player.score.toFixed(1)}</small></div>`).join("")
      : `<div class="cacl-muted">Пока нет доступного кандидата.</div>`;
    const html = `<section class="cacl-panel"><div class="cacl-head"><div><div class="cacl-kicker">CACL WORLDS MAYHEM</div><div class="cacl-title">Лучший пик</div></div><button class="cacl-refresh" title="Обновить">↻</button></div><div class="cacl-round">${roundText}</div><div class="cacl-status">${status}</div>${complete ? renderMatchSummary() : renderPicked()}<div class="cacl-teams">${teams}</div><datalist id="cacl-team-labels">${labels.map((label) => `<option value="${escapeHtml(label)}"></option>`).join("")}</datalist><div class="cacl-picks-layout"><div class="cacl-list">${list}</div>${renderRoundState()}</div></section>`;
    if (html === lastHtml) return;
    lastHtml = html;
    try {
      root.innerHTML = html;
    } catch (error) {
      if (error?.name === "NotFoundError") {
        schedule();
        return;
      }
      throw error;
    }
    root.querySelector(".cacl-refresh")?.addEventListener("click", safeRender);
    root.querySelector(".cacl-play-again")?.addEventListener("click", () => {
      lastHtml = "";
      state.picked = [];
      state.roundPicked = null;
      state.pendingTeam = null;
      state.playerBaseline = null;
      state.mapKeys = "";
      state.matchStarted = false;
      safeRender();
    });
    root.querySelectorAll(".cacl-team-input").forEach((input) => input.addEventListener("change", (event) => {
      const element = event.currentTarget;
      state.manualSlots[Number(element.dataset.slot)] = element.value.trim();
      setTimeout(safeRender, 0);
    }));
    root.querySelectorAll(".cacl-team-reset").forEach((button) => button.addEventListener("click", () => {
      state.manualSlots[Number(button.dataset.reset)] = "";
      setTimeout(safeRender, 0);
    }));
  }

  function safeRender() {
    try {
      render();
    } catch (error) {
      if (isInvalidatedContext(error)) return;
      throw error;
    }
  }

  async function load() {
    try {
      const url = extensionUrl(DATA_URL);
      if (!url) return;
      const response = await fetch(url);
      const json = await response.json();
      state.players = (json.player_competition_scores || []).map((row) => ({
        name: row.player, team: row.team, year: Number(row.year), role: row.position,
        score: Number(row.adjusted_competition_score),
      })).filter((player) => player.name && player.team && ROLE_WEIGHTS[player.role] && Number.isFinite(player.score));
      safeRender();
    } catch (error) {
      root.innerHTML = `<section class="cacl-panel"><div class="cacl-kicker">CACL WORLDS MAYHEM</div><div class="cacl-status">Не удалось загрузить локальный рейтинг.</div></section>`;
      console.warn("Cacl extension data load failed", error);
    }
  }

  document.addEventListener("click", (event) => { updatePickedFromClick(event); schedule(); }, true);
  document.addEventListener("change", (event) => { noteYearSelection(event); schedule(); }, true);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  function schedule() {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      if (!extensionUrl("content.css")) return;
       if (!host.shadowRoot.activeElement?.classList?.contains("cacl-team-input")) safeRender();
    }, 180);
  }
  load();
})();
