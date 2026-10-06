import { useState } from "react";
import {
  calculateTeamScore,
  getScoreTone,
  scoreBreakdown,
} from "../../lib/scoring";
import { stageCeiling, stageChances } from "../../lib/stages";
import { coverageAxes, coverageScore, weakestAxis } from "../../lib/coverage";
import type { LeaderRow } from "../../lib/leaderboard";
import { playerPhoto, teamLogo } from "../../lib/logos";
import { ROLE_ICON } from "../../lib/roles";
import { ROLE_ORDER } from "../../lib/teams";
import type { Player, Role } from "../../lib/game";

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function tierFor(score: number): string {
  if (score >= 93) return "S+";
  if (score >= 90) return "S";
  if (score >= 85) return "A";
  if (score >= 80) return "B";
  return "C";
}

type MetricKey = "kp" | "goldDiff15" | "firstBlood" | "clearWards" | "dpm";

// Informational style tags: team average vs the dataset median for the same
// roles. No invented thresholds — the baseline is the data itself.
const STYLE_STATS: { key: string; label: string; stat: MetricKey; roles: Role[] }[] = [
  { key: "lane", label: "Линия", stat: "goldDiff15", roles: ["TOP", "MID", "ADC"] },
  { key: "fight", label: "Тимфайты", stat: "kp", roles: ["JUNGLE", "MID", "ADC", "SUPPORT"] },
  { key: "damage", label: "Урон", stat: "dpm", roles: ["MID", "ADC"] },
  { key: "vision", label: "Вижн", stat: "clearWards", roles: ["JUNGLE", "SUPPORT"] },
];

function statValues(players: Player[], stat: MetricKey, roles: Role[]): number[] {
  return players
    .filter((player) => roles.includes(player.role))
    .map((player) => player[stat])
    .filter((value): value is number => typeof value === "number");
}

function PlayerCard({ player, isMvp }: { player: Player; isMvp: boolean }) {
  const [failed, setFailed] = useState(false);
  const logo = teamLogo(player.team);

  return (
    <article className={`lol-player-card ${isMvp ? "mvp" : ""}`}>
      {failed ? (
        logo && <img className="lol-team-watermark" src={logo} alt="" />
      ) : (
        <img
          className="lol-player-avatar"
          src={playerPhoto(player.name)}
          alt={player.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      <div className="lol-card-gradient" />
      <div className="lol-role-socket">
        <img src={ROLE_ICON[player.role]} alt={player.role} />
      </div>
      <div className="lol-score-socket">{player.score.toFixed(1)}</div>
      <div className="lol-player-footer">
        <div className="lol-player-name">{player.name}</div>
        <div className="lol-player-meta">
          {player.year} · {player.team}
        </div>
        <div className="lol-player-stats-mini">
          <span>{player.winRate === undefined ? "—" : `${player.winRate}% WR`}</span>
          <span>•</span>
          <span>{player.kda === undefined ? "—" : `${player.kda} KDA`}</span>
        </div>
      </div>
    </article>
  );
}

export function FinalSummary({
  picked,
  allPlayers,
  board,
}: {
  picked: Player[];
  allPlayers: Player[];
  board: LeaderRow[];
}) {
  const score = calculateTeamScore(picked);
  const tier = tierFor(score);
  const totalGames = picked.reduce((sum, player) => sum + (player.games ?? 0), 0);
  const winRate = mean(
    picked
      .map((player) => player.winRate)
      .filter((value): value is number => value !== undefined),
  );
  const kda = mean(
    picked
      .map((player) => player.kda)
      .filter((value): value is number => value !== undefined),
  );
  const reliability = mean(
    picked
      .map((player) => player.confidence)
      .filter((value): value is number => value !== undefined),
  );
  const titles = picked.filter((player) => player.placement === "WINNER").length;
  const finalists = picked.filter(
    (player) => player.placement === "FINALIST",
  ).length;
  const mvp = picked.reduce(
    (best, player) => (player.score > best.score ? player : best),
    picked[0],
  );

  // Fitted on the 205 real lineups in the ratings file, so the cutoffs follow the
  // data rather than loldle's 81/84/92/97, which sit above our whole power range.
  const breakdown = scoreBreakdown(picked);
  const chances = stageChances(allPlayers, breakdown.power);
  const ceiling = stageCeiling(chances);

  // Kept strictly apart from the score above: an axis gap is a description of
  // the roster's shape, not a number that competes with power.
  const coverage = coverageAxes(picked, allPlayers);
  const coverageGap = weakestAxis(coverage);

  const styleBadges = STYLE_STATS.flatMap((style) => {
    const teamAvg = mean(statValues(picked, style.stat, style.roles));
    const datasetMedian = median(statValues(allPlayers, style.stat, style.roles));
    if (teamAvg === null || datasetMedian === null) return [];
    return [{ key: style.key, label: style.label, up: teamAvg >= datasetMedian }];
  });

  // Informational only: the score formula is untouched, these tags just surface
  // why a pick is strong (shared team / shared Worlds year).
  const synergyTags: { key: string; label: string }[] = [];
  {
    const byTeam = new Map<string, number>();
    const byYear = new Map<number, number>();
    for (const player of picked) {
      byTeam.set(player.team, (byTeam.get(player.team) ?? 0) + 1);
      byYear.set(player.year, (byYear.get(player.year) ?? 0) + 1);
    }
    for (const [team, count] of byTeam) {
      if (count >= 2)
        synergyTags.push({ key: `t-${team}`, label: `Синергия · ${count} × ${team}` });
    }
    for (const [year, count] of byYear) {
      if (count >= 2)
        synergyTags.push({
          key: `y-${year}`,
          label: `Класс ${year} · ${count} ${count >= 5 ? "игроков" : "игрока"}`,
        });
    }
  }

  return (
    <section className="panel final-panel">
      <div className="summary-hero">
        <div>
          <div className="section-label">FINAL RESULT</div>
          <h2 className="summary-title">Итог состава</h2>
          <div className="summary-mvp">
            MVP драфта: <b>{mvp.name}</b> · {mvp.score.toFixed(1)}
          </div>
          {reliability !== null && (
            <div className="summary-reliability">
              Уверенность {Math.round(reliability * 100)}%
            </div>
          )}
        </div>
        <div className="summary-tier">
          <div className="summary-tier-score">
            <span>TEAM SCORE</span>
            <b className={getScoreTone(score)}>{score.toFixed(1)}</b>
          </div>
          <div className="tier-letter">{tier}</div>
        </div>
      </div>

      <div className="summary-stats-grid">
        <div className="summary-stat-box">
          <div className="summary-stat-val">{totalGames}</div>
          <div className="summary-stat-lbl">Матчей на Worlds</div>
        </div>
        <div className="summary-stat-box">
          <div className="summary-stat-val">
            {winRate === null ? "—" : `${winRate.toFixed(0)}%`}
          </div>
          <div className="summary-stat-lbl">Средний WinRate</div>
        </div>
        <div className="summary-stat-box">
          <div className="summary-stat-val">
            {kda === null ? "—" : kda.toFixed(1)}
          </div>
          <div className="summary-stat-lbl">Средний KDA</div>
        </div>
        <div className="summary-stat-box">
          <div className="summary-stat-val gold">🏆 {titles}</div>
          <div className="summary-stat-lbl">
            {finalists > 0 ? `Титулов · финалов ×${finalists}` : "Титулов чемпиона"}
          </div>
        </div>
      </div>

      <div className="lol-roster-grid">
        {ROLE_ORDER.map((role) => {
          const player = picked.find((item) => item.role === role);
          if (!player) return null;
          return (
            <PlayerCard key={role} player={player} isMvp={player.id === mvp.id} />
          );
        })}
      </div>

      {(styleBadges.length > 0 || synergyTags.length > 0) && (
        <div className="tag-row">
          {styleBadges.map((badge) => (
            <span className="tag-badge" key={badge.key}>
              {badge.label}
              <i className={`style-arrow ${badge.up ? "up" : "down"}`}>
                {badge.up ? "↑" : "↓"}
              </i>
            </span>
          ))}
          {synergyTags.map((tag) => (
            <span className="tag-badge synergy" key={tag.key}>
              {tag.label}
            </span>
          ))}
        </div>
      )}

      <div className="stage-chances">
        <div className="section-label">ШАНСЫ НА СТАДИИ</div>
        <div className="stage-ceiling">
          Потолок:{" "}
          <b>{ceiling ? ceiling.label : "ниже четвертьфинала"}</b>
          <span>пороги посчитаны по 205 реальным составам Worlds 2013–2025</span>
        </div>
        <div className="stage-list">
          {chances.map((chance) => (
            <div className="stage-row" key={chance.id}>
              <div className="stage-name">
                <b>{chance.label}</b>
                <small>{chance.unlocks}</small>
              </div>
              <div className="stage-bar">
                <i style={{ width: `${(chance.chance * 100).toFixed(1)}%` }} />
              </div>
              <div className="stage-pct">{Math.round(chance.chance * 100)}%</div>
              <div
                className={
                  chance.margin >= 0 ? "stage-why" : "stage-why short"
                }
              >
                {chance.margin >= 0
                  ? `запас ${chance.margin.toFixed(1)}`
                  : `не хватает ${(-chance.margin).toFixed(1)}`}
              </div>
            </div>
          ))}
        </div>
        <div className="stage-explain">
          база <b>{breakdown.base.toFixed(1)}</b> · связка{" "}
          <b className="plus">+{breakdown.carryBonus.toFixed(2)}</b> ·
          слабое звено <b className="minus">−{breakdown.weakPenalty.toFixed(2)}</b>
          {breakdown.weakRole ? ` (${breakdown.weakRole})` : ""}
        </div>
      </div>

      {coverage.length > 0 && (
        <div className="coverage">
          <div className="section-label">
            ПОКРЫТИЕ СОСТАВА · ЭВРИСТИКА
          </div>
          <div className="coverage-verdict">
            {coverageScore(coverage).toFixed(0)} / 100
            {coverageGap !== null && (
              <span>
                {" "}
                · слабое место: {coverageGap.label.toLowerCase()} (−
                {coverageGap.gap.toFixed(0)})
              </span>
            )}
          </div>
          <div className="coverage-list">
            {coverage.map((axis) => (
              <div className="coverage-row" key={axis.key}>
                <span className="coverage-name">{axis.label}</span>
                <span className="coverage-bar">
                  <i style={{ width: `${axis.value.toFixed(1)}%` }} />
                </span>
                <span className="coverage-val">{axis.value.toFixed(0)}</span>
              </div>
            ))}
          </div>
          <p className="coverage-note">
            Оценка по имеющимся статам относительно всех составов датасета. Это
            эвристика: в score она не входит, пороги стадий не меняет.
          </p>
        </div>
      )}

      {board.length > 0 && (
        <div className="leaderboard">
          <div className="section-label">РЕКОРДЫ</div>
          <ol className="leader-list">
            {board.slice(0, 5).map((row, index) => (
              <li key={`${row.power}-${row.at}`}>
                <span className="leader-rank">{index + 1}</span>
                <b>{row.power.toFixed(1)}</b>
                <small>
                  {row.picks} {row.picks === 1 ? "пик" : "пиков"} · {row.at}
                </small>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
