import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { RosterPanel } from "./RosterPanel";
import { BestDecision, type RoundOption } from "./BestDecision";
import { TeamPicker } from "./TeamPicker";
import { FinalSummary } from "./FinalSummary";
import { ScreenshotScan } from "../screenshot/ScreenshotScan";
import {
  REROLL_CARDS,
  REROLL_SAMPLES,
  seededRandom,
  teamScoreGain,
} from "./draft";
import { calculateTeamScore, scoreBreakdown } from "../../lib/scoring";
import { loadBoard, recordResult, type LeaderRow } from "../../lib/leaderboard";
import { ROLES } from "../../lib/roles";
import type { Player, Role } from "../../lib/game";

type Prefill = { team: string; year: number | null }[];

export function Calculator({
  players,
  picked,
  setPicked,
  rerollsLeft,
  setRerollsLeft,
  onTogglePicked,
  onGoToCalculator,
}: {
  players: Player[];
  picked: Player[];
  setPicked: Dispatch<SetStateAction<Player[]>>;
  rerollsLeft: number;
  setRerollsLeft: Dispatch<SetStateAction<number>>;
  onTogglePicked: (player: Player) => void;
  onGoToCalculator: () => void;
}) {
  const [roundCandidates, setRoundCandidates] = useState<Player[]>([]);
  const [gameId, setGameId] = useState(0);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [roundOpen, setRoundOpen] = useState(false);
  const [closed, setClosed] = useState(false);
  const [board, setBoard] = useState<LeaderRow[]>(loadBoard);
  const [confirmingRestart, setConfirmingRestart] = useState(false);

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
      ROLES.filter(
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

  const currentOptions: RoundOption[] = useMemo(
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
  // With every role filled a redraw cannot help either, so the reroll is only
  // worth offering while a real candidate exists to beat.
  const rerollIsBetter =
    rerollsLeft > 0 &&
    bestCurrentOption !== undefined &&
    rerollEstimate > bestCurrentOption.gain;
  // Two exclusive states, so the panel never reads a gain off a missing pick.
  // A full roster is not one of them: the round panel is hidden once the five
  // roles are filled, so "full" can never render here.
  const advice: "none" | "reroll" | "pick" =
    bestCurrentOption === undefined
      ? "none"
      : rerollIsBetter
        ? "reroll"
        : "pick";

  function pickCurrentPlayer(player: Player) {
    onTogglePicked(player);
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
    onGoToCalculator();
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
        <button
          type="button"
          onClick={() => (runOver ? restartGame() : setConfirmingRestart(true))}
        >
          {runOver ? "PLAY AGAIN" : "РЕСТАРТ"}
        </button>
      </div>
    );
  }

  return (
    <section className="calculator-grid">
      {!finalPhase && (
        <RosterPanel
          picked={picked}
          score={currentTeamScore}
          breakdown={currentBreakdown}
        />
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
            onScanScreenshot={() => setRoundOpen(false)}
          />
          <BestDecision
            advice={advice}
            options={currentOptions}
            bestGain={bestCurrentOption?.gain}
            bestName={bestCurrentOption?.player.name}
            rerollEstimate={rerollEstimate}
            rerollsLeft={rerollsLeft}
            onPick={pickCurrentPlayer}
          />
        </>
      ) : scanPhase ? (
        <ScreenshotScan
          players={players}
          onApply={(slots) => {
            setPrefill(slots);
            setRoundOpen(true);
          }}
          onManual={() => {
            setPrefill(null);
            setRoundOpen(true);
          }}
        />
      ) : (
        <FinalSummary picked={picked} allPlayers={players} board={board} />
      )}
      {gameActions()}

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
    </section>
  );
}
