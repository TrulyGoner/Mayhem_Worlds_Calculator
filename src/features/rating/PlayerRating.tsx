import { useMemo, useState } from "react";
import { PlayerPhoto } from "../../ui/PlayerPhoto";
import { getScoreTone } from "../../lib/scoring";
import { ROLES, type RoleFilter } from "../../lib/roles";
import type { Player } from "../../lib/game";

// Rating rows per page. Must stay even: the zebra striping relies on row parity
// matching the global rank, and pagination restarts parity at 1.
const RATING_PAGE_SIZE = 100;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");
}

export function PlayerRating({
  players,
  onTogglePicked,
}: {
  players: Player[];
  onTogglePicked: (player: Player) => void;
}) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [search, setSearch] = useState("");
  const [ratingPage, setRatingPage] = useState(1);

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

  return (
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
          {ROLES.map((role) => (
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
              onClick={() => onTogglePicked(player)}
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
  );
}
