import { Suspense, lazy, useEffect, useState } from "react";
import "./App.css";
import { Calculator } from "./features/calculator/Calculator";
import { loadPlayers } from "./lib/ratings";
import type { Player } from "./lib/game";

const PlayerRating = lazy(() =>
  import("./features/rating/PlayerRating").then((module) => ({
    default: module.PlayerRating,
  })),
);
const CombosTab = lazy(() =>
  import("./features/combos/CombosTab").then((module) => ({
    default: module.CombosTab,
  })),
);

type Tab = "calculator" | "players" | "combos";

function App() {
  const [tab, setTab] = useState<Tab>("calculator");
  const [players, setPlayers] = useState<Player[]>([]);
  const [picked, setPicked] = useState<Player[]>([]);
  const [rerollsLeft, setRerollsLeft] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  if (loading)
    return <div className="app-state">Загрузка рейтингов и связок...</div>;
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
        <Calculator
          players={players}
          picked={picked}
          setPicked={setPicked}
          rerollsLeft={rerollsLeft}
          setRerollsLeft={setRerollsLeft}
          onTogglePicked={togglePicked}
          onGoToCalculator={() => setTab("calculator")}
        />
      )}

      <Suspense fallback={<div className="app-state">Загрузка...</div>}>
        {tab === "players" && (
          <PlayerRating
            players={players}
            onTogglePicked={togglePicked}
          />
        )}

        {tab === "combos" && <CombosTab players={players} />}
      </Suspense>
    </main>
  );
}

export default App;
