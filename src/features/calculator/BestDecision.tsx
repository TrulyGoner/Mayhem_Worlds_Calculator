import { signedGain } from "./draft";
import type { Player } from "../../lib/game";

export type RoundOption = { player: Player; gain: number };

// "none" = every round player sits on an already-filled role, so there is no
// pick at all; "reroll" = the expected redraw beats the best card on the table.
export function BestDecision({
  advice,
  options,
  bestGain,
  bestName,
  rerollEstimate,
  rerollsLeft,
  onPick,
}: {
  advice: "none" | "reroll" | "pick";
  options: RoundOption[];
  bestGain?: number;
  bestName?: string;
  rerollEstimate: number;
  rerollsLeft: number;
  onPick: (player: Player) => void;
}) {
  return (
    <div className="panel best-solution-panel">
      <div className="section-label">BEST DECISION</div>
      <h2>Лучшее решение</h2>
      <div className="decision-body">
        <div className={`round-advice ${advice === "reroll" ? "reroll" : "pick"}`}>
          <div className="round-advice-label">РЕШЕНИЕ ПО ЭТИМ КОМАНДАМ</div>
          <strong>
            {advice === "none"
              ? "НЕТ ДОСТУПНЫХ ПИКОВ"
              : advice === "reroll"
                ? "РЕРОЛЛ"
                : `ПИКНУТЬ ${bestName}`}
          </strong>
          <span>
            {advice === "none"
              ? "Все игроки раунда — на уже занятых ролях. Сними пик или смени команды."
              : advice === "reroll"
                ? `Прогноз реролла: ${signedGain(rerollEstimate)} · текущий максимум: ${signedGain(bestGain ?? 0)}`
                : rerollsLeft === 0
                  ? `Лучший текущий пик: ${signedGain(bestGain!)} · рероллы закончились`
                  : `Лучший текущий пик: ${signedGain(bestGain!)} · прогноз реролла: ${signedGain(rerollEstimate)}`}
          </span>
        </div>
        <div className="current-options">
          <div className="current-options-label">ВАРИАНТЫ РАУНДА</div>
          {options.map(({ player, gain }) => (
            <button
              type="button"
              key={player.id}
              onClick={() => onPick(player)}
            >
              <span>{player.name}</span>
              <small>
                {player.role} · {player.year} · {player.score.toFixed(1)}
              </small>
              <small>{signedGain(gain)}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
