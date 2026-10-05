import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { ScreenshotScan } from "./components/ScreenshotScan";
import { TeamPicker } from "./components/TeamPicker";
import { FinalSummary } from "./components/FinalSummary";
import { loadPlayers } from "./data/ratings";
import {
  calculateTeamScore,
  getScoreTone,
  scoreBreakdown,
  withTies,
} from "./lib/scoring";
import { playerPhoto } from "./lib/logos";
import { buildCombos, type Combo } from "./lib/combos";
import {
  loadBoard,
  recordResult,
  type LeaderRow,
} from "./lib/leaderboard";
import { ROLE_ICON } from "./lib/roles";
import type { Player, Role } from "./types/game";

type Tab = "calculator" | "players" | "combos";
const roles: Array<"ALL" | Role> = [
  "ALL",
  "TOP",
  "JUNGLE",
  "MID",
  "ADC",
  "SUPPORT",
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");
}

// Same rule as togglePicked: a player never grows the lineup past 5, they take
// over their own role.
function lineupWith(picked: Player[], candidate: Player): Player[] {
  return [
    ...picked.filter((player) => player.role !== candidate.role),
    candidate,
  ];
}

// What a pick is actually worth: how much the weighted lineup score moves. No
// hand-tuned weights here, everything comes from calculateTeamScore.
function teamScoreGain(picked: Player[], candidate: Player): number {
  return (
    calculateTeamScore(lineupWith(picked, candidate)) -
    calculateTeamScore(picked)
  );
}

// A reroll redraws about 15 cards, so compare the current best card against the
// expected best of a redraw. Seeded from the state instead of Math.random, or
// the advice would flicker on every render.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const REROLL_CARDS = 15;
const REROLL_SAMPLES = 60;
// Rating rows per page. Must stay even: the zebra striping relies on row parity
// matching the global rank, and pagination restarts parity at 1.
const RATING_PAGE_SIZE = 100;

function signedGain(gain: number): string {
  return `${gain >= 0 ? "+" : "−"}${Math.abs(gain).toFixed(1)}`;
}

// With only two players the carry and weak terms measure the same half-gap with
// the same 0.2 factor, so they cancel exactly and the score is the role-weighted
// average on its own. Printing "связка +0.00 / слабое −0.00" across every pair
// card would advertise a synergy term that is not doing any work there.
function ComboList({
  combos,
  title,
  note,
}: {
  combos: Combo[];
  title: string;
  note: string;
}) {
  const hasSpread = combos.some((combo) => combo.carry > 0 || combo.weak > 0);

  return (
    <section className="combo-section">
      <div className="section-label">{title}</div>
      <p className="muted combo-note">{note}</p>
      <div className="combo-list">
        {withTies(combos, 12, (combo) => combo.power).map((combo, index) => (
          <article
            className={`synergy-row ${index < 3 ? "gold-tier" : ""}`}
            key={combo.players.map((player) => player.id).join("-")}
          >
            <div className="synergy-rank">#{index + 1}</div>

            <div>
              <div className="synergy-members">
                {combo.players.map((player, position) => (
                  <Fragment key={player.id}>
                    <span className="synergy-member-chip">
                      <span className="synergy-role-badge">{player.role}</span>
                      <span className="synergy-member-name">{player.name}</span>
                    </span>
                    {position < combo.players.length - 1 && (
                      <span className="synergy-link-symbol" aria-hidden="true">
                        ⚔
                      </span>
                    )}
                  </Fragment>
                ))}
              </div>

              <div className="synergy-formula-breakdown">
                <span>
                  База: <b>{combo.base.toFixed(1)}</b>
                </span>
                {hasSpread && (
                  <>
                    <span aria-hidden="true">•</span>
                    <span className="val-bonus">
                      Связка: +{combo.carry.toFixed(2)}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span className="val-malus">
                      Слабое звено −{combo.weak.toFixed(2)}
                      {combo.weakRole ? ` (${combo.weakRole})` : ""}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="synergy-score-val">{combo.power.toFixed(1)}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

// Cutout in public/players, named after the dataset spelling. 30 of the 500
// players have no file, so the box keeps its size and a 404 shows as empty
// space instead of a broken image, which also keeps every name aligned.
function PlayerPhoto({ name }: { name: string }) {
  return (
    <span className="player-photo" aria-hidden="true">
      <img
        src={playerPhoto(name)}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

// The role glyph and the face are separate cells: the glyph is how the lineup
// reads at a glance, the photo is decoration, so losing the photo must never
// cost the role. A missing file just empties the photo cell, and the caller
// keys this on the player id to clear the failure between picks.
function RosterAvatar({ role, player }: { role: Role; player?: Player }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(player) && !failed;

  return (
    <>
      <span className="role-icon">
        <img src={ROLE_ICON[role]} alt={role} />
      </span>
      <span className="roster-face">
        {showPhoto && (
          <img
            src={playerPhoto(player!.name)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </span>
    </>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("calculator");
  const [players, setPlayers] = useState<Player[]>([]);
  const [picked, setPicked] = useState<Player[]>([]);
  const [roundCandidates, setRoundCandidates] = useState<Player[]>([]);
  const [rerollsLeft, setRerollsLeft] = useState(3);
  const [gameId, setGameId] = useState(0);
  const [roleFilter, setRoleFilter] = useState<"ALL" | Role>("ALL");
  const [search, setSearch] = useState("");
  const [ratingPage, setRatingPage] = useState(1);
  const [prefill, setPrefill] = useState<{ team: string; year: number | null }[] | null>(null);
  const [roundOpen, setRoundOpen] = useState(false);
  const [closed, setClosed] = useState(false);
  const [board, setBoard] = useState<LeaderRow[]>(loadBoard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmingRestart, setConfirmingRestart] = useState(false);

  useEffect(() => {
    loadPlayers()
      .then(setPlayers)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "Ошибка загрузки данных",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!confirmingRestart) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmingRestart(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmingRestart]);

  const pickedIds = useMemo(
    () => new Set(picked.map((player) => player.id)),
    [picked],
  );
  // Consumed as a useMemo dep by currentOptions and rerollEstimate below, so it
  // has to keep its identity across renders: a fresh array on every render
  // invalidates both memos and re-runs the reroll Monte Carlo each time.
  const missingRoles = useMemo(
    () =>
      roles.filter(
        (role): role is Role =>
          role !== "ALL" && !picked.some((player) => player.role === role),
      ),
    [picked],
  );
  const currentTeamScore = useMemo(() => calculateTeamScore(picked), [picked]);
  const currentBreakdown = useMemo(() => scoreBreakdown(picked), [picked]);
  // `closed` is the player's own "finish here", which is how a short roster
  // reaches the summary at all.
  const rosterFull = picked.length >= 5;
  const runOver = closed || rosterFull;

  // One entry per finished game, not per render: runOver stays true while the
  // summary is open and while any pick is edited, and gameId is what separates
  // one run from the next after a restart.
  const recordedGameId = useRef(-1);
  useEffect(() => {
    if (!runOver || picked.length === 0) return;
    if (recordedGameId.current === gameId) return;
    recordedGameId.current = gameId;
    setBoard(recordResult(calculateTeamScore(picked), picked.length));
  }, [runOver, picked, gameId]);
  // Screenshot -> round -> screenshot loop. roundOpen is flipped by the
  // screenshot's "apply" and by the pick/reroll that ends a round. It cannot be
  // derived from roundCandidates: those come from TeamPicker, which only mounts
  // in the round phase, so deriving the phase from them deadlocks the first
  // round.
  const roundPhase = !runOver && roundOpen;
  // A full roster ends the loop: neither the screenshot step nor the round
  // panel is shown once the game is over.
  const scanPhase = !roundPhase && !runOver;
  const finalPhase = runOver;
  const currentOptions = useMemo(
    () =>
      roundCandidates
        .filter((player) => !pickedIds.has(player.id))
        // A role holds one player, so a candidate whose role is already filled
        // is not a pick at all. Without this the advice names someone the
        // lineup cannot take, and clicking it silently swaps out a live pick.
        .filter((player) => missingRoles.includes(player.role))
        .map((player) => ({ player, gain: teamScoreGain(picked, player) }))
        .sort((left, right) => right.gain - left.gain),
    [roundCandidates, picked, pickedIds, missingRoles],
  );
  const rerollEstimate = useMemo(() => {
    const eligible = players
      .filter((player) => !pickedIds.has(player.id))
      .filter((player) => missingRoles.includes(player.role));
    if (eligible.length === 0) return 0;

    const gains = eligible.map((player) => teamScoreGain(picked, player));
    // A redraw cannot beat the pool it draws from.
    if (eligible.length <= REROLL_CARDS) return Math.max(...gains);

    const random = seededRandom(
      picked.length * 7919 +
        Math.round(currentTeamScore * 100) +
        eligible.length,
    );
    let total = 0;
    for (let sample = 0; sample < REROLL_SAMPLES; sample += 1) {
      const drawn = new Set<number>();
      while (drawn.size < REROLL_CARDS) {
        drawn.add(Math.floor(random() * eligible.length));
      }
      let best = Number.NEGATIVE_INFINITY;
      for (const index of drawn) {
        if (gains[index] > best) best = gains[index];
      }
      total += best;
    }
    return total / REROLL_SAMPLES;
  }, [players, picked, pickedIds, missingRoles, currentTeamScore]);
  const bestCurrentOption = currentOptions[0];
  // ~1500 ranked rows, so it is built once per ratings load rather than per
  // render. Reads the same player list the calculator draws from, which is what
  // makes a combo's power comparable with a roster's score.
  const combos = useMemo(() => buildCombos(players), [players]);
  // With every role filled a redraw cannot help either, so the reroll is only
  // worth offering while a real candidate exists to beat.
  const rerollIsBetter =
    rerollsLeft > 0 &&
    bestCurrentOption !== undefined &&
    rerollEstimate > bestCurrentOption.gain;
  // Two exclusive states, so the panel never reads a gain off a missing pick.
  // A full roster is not one of them: the round panel is hidden once the five
  // roles are filled, so "full" can never render here.
  const advice =
    bestCurrentOption === undefined
      ? "none"
      : rerollIsBetter
        ? "reroll"
        : "pick";
  const filteredPlayers = useMemo(
    () =>
      players
        .filter((player) => roleFilter === "ALL" || player.role === roleFilter)
        .filter((player) =>
          normalize(`${player.name} ${player.team}`).includes(
            normalize(search),
          ),
        )
        .sort((a, b) => b.score - a.score),
    [players, roleFilter, search],
  );
  const ratingPageCount = Math.max(
    1,
    Math.ceil(filteredPlayers.length / RATING_PAGE_SIZE),
  );
  // Clamp instead of an effect: if a filter change invalidates the page, the
  // list falls back to the last valid page on its own.
  const ratingPageSafe = Math.min(ratingPage, ratingPageCount);
  const ratingRows = filteredPlayers.slice(
    (ratingPageSafe - 1) * RATING_PAGE_SIZE,
    ratingPageSafe * RATING_PAGE_SIZE,
  );

  function togglePicked(player: Player) {
    setPicked((current) => {
      if (current.some((item) => item.id === player.id)) {
        return current.filter((item) => item.id !== player.id);
      }

      const sameRole = current.some((item) => item.role === player.role);
      if (sameRole) {
        return current.map((item) =>
          item.role === player.role ? player : item,
        );
      }

      return current.length < 5 ? [...current, player] : current;
    });
  }

  if (loading)
    return <div className="app-state">Загрузка рейтингов и связок...</div>;
  function pickCurrentPlayer(player: Player) {
    togglePicked(player);
    setRoundCandidates([]);
    setRoundOpen(false);
  }

  function useReroll() {
    if (rerollsLeft === 0) return;
    setRerollsLeft((current) => current - 1);
    setRoundCandidates([]);
    setRoundOpen(false);
  }

  function restartGame() {
    setPicked([]);
    setRoundCandidates([]);
    setRerollsLeft(3);
    setGameId((current) => current + 1);
    setTab("calculator");
    setPrefill(null);
    setRoundOpen(false);
    setClosed(false);
  }

  function gameActions() {
    return (
      <div className="game-actions">
        <button
          type="button"
          disabled={rerollsLeft === 0 || roundCandidates.length === 0}
          onClick={useReroll}
        >
          РЕРОЛЛ
        </button>
        {picked.length > 0 && !runOver && (
          <button type="button" onClick={() => setClosed(true)}>
            ЗАВЕРШИТЬ
          </button>
        )}
        <button type="button" onClick={() => setConfirmingRestart(true)}>
          РЕСТАРТ
        </button>
      </div>
    );
  }


  if (error) return <div className="app-state error">{error}</div>;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">WORLDS MAYHEM ANALYTICS</div>
          <h1 className="lol-title-legend">Рейтинг легенд</h1>
          <p>Калькулятор пиков, игроки, связки и выбор команд раунда</p>
        </div>
        <div className="header-score">
          <span>СОБРАНО</span>
          <strong>{picked.length} / 5</strong>
          <small>Рероллы: {rerollsLeft} / 3</small>
        </div>
      </header>
      <nav className="tabs" aria-label="Разделы приложения">
        <button
          className={tab === "calculator" ? "active" : ""}
          onClick={() => setTab("calculator")}
        >
          Калькулятор
        </button>
        <button
          className={tab === "players" ? "active" : ""}
          onClick={() => setTab("players")}
        >
          Рейтинг игроков
        </button>
        <button
          className={tab === "combos" ? "active" : ""}
          onClick={() => setTab("combos")}
        >
          Оптимальные комбинации
        </button>
      </nav>

      {tab === "calculator" && (
        <section className="calculator-grid">
          {!finalPhase && (
            <div className="panel roster-panel">
              <div className="section-label">CURRENT TEAM</div>
            <h2>Текущий состав</h2>
            <div className="roster-score">
              <span>Итоговый score</span>
              <strong className={getScoreTone(currentTeamScore)}>
                {currentTeamScore.toFixed(1)}
              </strong>
            </div>
            {picked.length >= 3 && (
              <p className="muted">
                База {currentBreakdown.base.toFixed(1)} · связка +
                {currentBreakdown.carryBonus.toFixed(2)} · слабое звено −
                {currentBreakdown.weakPenalty.toFixed(2)}
                {currentBreakdown.weakRole
                  ? ` (${currentBreakdown.weakRole})`
                  : ""}
              </p>
            )}
            <div className="roster-list">
              {(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as Role[]).map(
                (role) => {
                  const player = picked.find((item) => item.role === role);
                  return (
                    <div
                      className={`roster-row ${player ? "" : "empty"}`}
                      key={role}
                    >
                      <RosterAvatar
                        key={player?.id ?? "free"}
                        role={role}
                        player={player}
                      />
                      <b>{player?.name ?? "СВОБОДЕН"}</b>
                      <em>{player ? player.score.toFixed(1) : "—"}</em>
                    </div>
                  );
                },
              )}
            </div>
            <p className="muted">
              Выбирай максимум одного игрока за раунд. После пятого пика состав
              заполнен.
            </p>
            </div>
          )}
          {roundPhase ? (
            <>
              <TeamPicker
                key={`round-${gameId}`}
                players={players}
                pickedPlayers={picked}
                onTogglePicked={pickCurrentPlayer}
                onCandidates={setRoundCandidates}
                prefill={prefill}
              />
              <div className="panel best-solution-panel">
                <div className="section-label">BEST DECISION</div>
                <h2>Лучшее решение</h2>
                <div className="decision-body">
                  <div
                    className={`round-advice ${advice === "reroll" ? "reroll" : "pick"}`}
                  >
                    <div className="round-advice-label">
                      РЕШЕНИЕ ПО ЭТИМ КОМАНДАМ
                    </div>
                    <strong>
                      {advice === "none"
                        ? "НЕТ ДОСТУПНЫХ ПИКОВ"
                        : advice === "reroll"
                          ? "РЕРОЛЛ"
                          : `ПИКНУТЬ ${bestCurrentOption?.player.name}`}
                    </strong>
                    <span>
                      {advice === "none"
                        ? "Все игроки раунда — на уже занятых ролях. Сними пик или смени команды."
                        : advice === "reroll"
                          ? `Прогноз реролла: ${signedGain(rerollEstimate)} · текущий максимум: ${signedGain(bestCurrentOption?.gain ?? 0)}`
                          : rerollsLeft === 0
                            ? `Лучший текущий пик: ${signedGain(bestCurrentOption.gain)} · рероллы закончились`
                            : `Лучший текущий пик: ${signedGain(bestCurrentOption.gain)} · прогноз реролла: ${signedGain(rerollEstimate)}`}
                    </span>
                  </div>
                  <div className="current-options">
                    <div className="current-options-label">ВАРИАНТЫ РАУНДА</div>
                    {currentOptions.map(({ player, gain }) => (
                      <button
                        type="button"
                        key={player.id}
                        onClick={() => pickCurrentPlayer(player)}
                      >
                        <span>{player.name}</span>
                        <small>
                          {player.role} · {player.year} ·{" "}
                          {player.score.toFixed(1)}
                        </small>
                        <small>{signedGain(gain)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : scanPhase ? (
            <ScreenshotScan
              players={players}
              onApply={(slots) => {
                setPrefill(slots);
                setRoundOpen(true);
              }}
            />
          ) : (
            <FinalSummary picked={picked} allPlayers={players} board={board} />
          )}
          {gameActions()}
        </section>
      )}

      {tab === "players" && (
        <section className="panel full-panel">
          <div className="section-label">PLAYER DATABASE</div>
          <h2>Рейтинг игроков</h2>
          <div className="toolbar">
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setRatingPage(1);
              }}
              placeholder="Поиск игрока или команды"
            />
            <div className="role-filters">
              {roles.map((role) => (
                <button
                  className={roleFilter === role ? "active" : ""}
                  key={role}
                  onClick={() => {
                    setRoleFilter(role);
                    setRatingPage(1);
                  }}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
          <div className="player-table">
            <div className="table-head">
              <span>#</span>
              <span className="player-head">Игрок</span>
              <span>Роль</span>
              <span>Год / команда</span>
              <span>Score</span>
            </div>
            {ratingRows.map((player, index) => {
              const rank = (ratingPageSafe - 1) * RATING_PAGE_SIZE + index + 1;
              return (
                <button
                  className={`table-row ${rank <= 10 ? "top" : ""}`}
                  type="button"
                  key={player.id}
                  onClick={() => togglePicked(player)}
                >
                  <span>{rank}</span>
                  <span className="player-cell">
                    <PlayerPhoto name={player.name} />
                    <b>{player.name}</b>
                  </span>
                  <span>{player.role}</span>
                  <span>
                    {player.year} · {player.team}
                  </span>
                  <strong className={getScoreTone(player.score)}>
                    {player.score.toFixed(1)}
                  </strong>
                </button>
              );
            })}
          </div>
          {ratingPageCount > 1 && (
            <div className="pagination">
              <button
                type="button"
                disabled={ratingPageSafe === 1}
                onClick={() => setRatingPage(ratingPageSafe - 1)}
              >
                Назад
              </button>
              {Array.from(
                { length: ratingPageCount },
                (_, page) => page + 1,
              ).map((page) => (
                <button
                  type="button"
                  key={page}
                  className={page === ratingPageSafe ? "active" : ""}
                  onClick={() => setRatingPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                disabled={ratingPageSafe === ratingPageCount}
                onClick={() => setRatingPage(ratingPageSafe + 1)}
              >
                Вперёд
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "combos" && (
        <section className="full-panel">
          <div className="panel combo-intro">
            <div className="section-label">COMBINATIONS</div>
            <h2>Оптимальные комбинации</h2>
            <p className="muted">
              Лучшие пары и тройки считаются из живого рейтинга той же формулой,
              что и итоговый score, поэтому цифры здесь сопоставимы с оценкой
              состава. Каждая строка — один уникальный набор игроков: перестановки
              одного состава повторяться не могут, роли у всех разные.
            </p>
          </div>
          <ComboList
            title="ЛУЧШИЕ ПАРЫ"
            combos={combos.pairs}
            note="У двоих игроков бонус за разброс и штраф за слабое звено измеряют одну и ту же половину разрыва одним коэффициентом, поэтому взаимно сокращаются. Score пары — это ролевое среднее."
          />
          <ComboList
            title="ЛУЧШИЕ ТРОЙКИ"
            combos={combos.trios}
            note="У тройки появляется третий член бонуса, у которого нет пары в штрафе, поэтому score может отличаться от ролевого среднего."
          />
        </section>
      )}

      {confirmingRestart && (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmingRestart(false)}
        >
          <div
            className="panel restart-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restart-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-label">RESTART</div>
            <h2 id="restart-modal-title">Начать игру заново?</h2>
            <p className="muted">
              Состав ({picked.length} / 5) и рероллы ({rerollsLeft} / 3)
              сбросятся. Отменить это действие будет нельзя.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingRestart(false)}
              >
                ОТМЕНА
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setConfirmingRestart(false);
                  restartGame();
                }}
              >
                РЕСТАРТ
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
