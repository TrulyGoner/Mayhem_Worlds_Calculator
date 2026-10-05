import { useState } from "react";
import { calculateTeamScore, getScoreTone } from "../lib/scoring";
import { playerPhoto, teamLogo } from "../lib/logos";
import { ROLE_ICON } from "../lib/roles";
import { ROLE_ORDER } from "../lib/teams";
import type { Player, Role } from "../types/game";

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
}: {
  picked: Player[];
  allPlayers: Player[];
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
    </section>
  );
}
