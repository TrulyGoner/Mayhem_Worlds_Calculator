import { Fragment } from "react";
import { withTies } from "../../lib/scoring";
import type { Combo } from "../../lib/combos";
export function ComboList({
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
