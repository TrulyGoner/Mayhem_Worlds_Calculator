import { RosterAvatar } from "../../ui/RosterAvatar";
import { getScoreTone, type TeamScoreBreakdown } from "../../lib/scoring";
import type { Player, Role } from "../../lib/game";
export function RosterPanel({
  picked,
  score,
  breakdown,
}: {
  picked: Player[];
  score: number;
  breakdown: TeamScoreBreakdown;
}) {
  return (
    <div className="panel roster-panel">
      <div className="section-label">CURRENT TEAM</div>
      <h2>Текущий состав</h2>
      <div className="roster-score">
        <span>Итоговый score</span>
        <strong className={getScoreTone(score)}>{score.toFixed(1)}</strong>
      </div>
      {picked.length >= 3 && (
        <p className="muted">
          База {breakdown.base.toFixed(1)} · связка +
          {breakdown.carryBonus.toFixed(2)} · слабое звено −
          {breakdown.weakPenalty.toFixed(2)}
          {breakdown.weakRole ? ` (${breakdown.weakRole})` : ""}
        </p>
      )}
      <div className="roster-list">
        {(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as Role[]).map((role) => {
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
        })}
      </div>
      <p className="muted">
        Выбирай максимум одного игрока за раунд. После пятого пика состав
        заполнен.
      </p>
    </div>
  );
}
