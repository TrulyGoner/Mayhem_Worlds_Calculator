import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { Player, Role } from "../../lib/game";
import { teamLogo } from "../../lib/logos";
import {
  ROLE_ORDER,
  freeYears,
  rosterFor,
  yearsFor,
  type TeamSlot,
} from "../../lib/teams";
import { TEAM_ALIASES } from "../../lib/fuzzy";

type Props = {
  players: Player[];
  pickedPlayers: Player[];
  onTogglePicked: (player: Player) => void;
  onCandidates: (players: Player[]) => void;
  prefill: TeamSlot[] | null;
  onSlotsChange?: (slots: Slot[]) => void;
  onScanScreenshot?: () => void;
};

type Slot = { team: string; year: number | null };

const BLOCKS = 3;
const SUGGESTIONS = 10;
const ROLE_SHORT: Record<Role, string> = {
  TOP: "TOP",
  JUNGLE: "JNG",
  MID: "MID",
  ADC: "ADC",
  SUPPORT: "SUP",
};
const EMPTY_SLOTS: Slot[] = Array.from({ length: BLOCKS }, () => ({
  team: "",
  year: null,
}));

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function initials(team: string): string {
  const words = team.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0].toUpperCase())
    .join("");
}
function TeamLogo({
  team,
  width,
  height,
}: {
  team: string;
  width: number;
  height: number;
}) {
  const src = teamLogo(team);
  const [failed, setFailed] = useState(false);

  if (!team || failed || !src)
    return (
      <span
        className="team-logo team-logo-letters"
        style={{ width, height }}
        aria-hidden="true"
      >
        {initials(team)}
      </span>
    );

  return (
    <span className="team-logo" style={{ width, height }} aria-hidden="true">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export function TeamPicker({
  players,
  pickedPlayers,
  onTogglePicked,
  onCandidates,
  prefill,
  onSlotsChange,
  onScanScreenshot,
}: Props) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    prefill ? prefill.map((slot) => ({ ...slot })) : EMPTY_SLOTS,
  );
  const [queries, setQueries] = useState<string[]>(() =>
    prefill ? prefill.map((slot) => slot.team) : EMPTY_SLOTS.map(() => ""),
  );
  const [open, setOpen] = useState<number | null>(null);

  const teams = useMemo(
    () => [...new Set(players.map((player) => player.team))].sort(),
    [players],
  );
  const occupiedRoles = useMemo(
    () => new Set(pickedPlayers.map((player) => player.role)),
    [pickedPlayers],
  );

  const rosters = useMemo(
    () =>
      slots.map((slot) =>
        slot.team && slot.year !== null
          ? rosterFor(slot.team, slot.year, players)
          : [],
      ),
    [slots, players],
  );

  useEffect(() => {
    const unique = new Map<string, Player>();
    for (const roster of rosters)
      for (const player of roster) unique.set(player.id, player);
    onCandidates([...unique.values()]);
    onSlotsChange?.(slots);
  }, [rosters, onCandidates, slots, onSlotsChange]);

  function suggestionsFor(index: number): string[] {
    const query = normalize(queries[index]);
    if (!query) return [];
    const aliasTeams = new Set<string>();
    for (const [label, targets] of TEAM_ALIASES)
      if (label.includes(query))
        for (const target of targets) aliasTeams.add(target);
    return teams
      .filter((team) => normalize(team).includes(query) || aliasTeams.has(team))
      .filter((team) => freeYears(team, players, slots, index).length > 0)
      .slice(0, SUGGESTIONS);
  }

  function selectTeam(index: number, team: string) {
    const years = yearsFor(team, players);
    const year = years.length === 1 ? years[0] : null;
    setSlots((current) =>
      current.map((slot, position) =>
        position === index ? { team, year } : slot,
      ),
    );
    setQueries((current) =>
      current.map((query, position) => (position === index ? team : query)),
    );
    setOpen(null);
  }

  function clearBlock(index: number) {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index ? { team: "", year: null } : slot,
      ),
    );
    setQueries((current) =>
      current.map((query, position) => (position === index ? "" : query)),
    );
    setOpen(null);
  }

  function onSearchKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Escape") {
      setOpen(null);
      return;
    }
    if (event.key !== "Enter") return;
    const [first] = suggestionsFor(index);
    if (first) selectTeam(index, first);
  }

  return (
    <section className="panel">
      <div className="team-picker-header">
        <div>
          <div className="section-label">ROUND TEAMS</div>
          <h2>3 команды раунда</h2>
        </div>
        {onScanScreenshot && (
          <button
            type="button"
            className="team-scan-btn"
            onClick={onScanScreenshot}
          >
            СКАН СКРИНШОТА
          </button>
        )}
      </div>
      <p className="muted">
        Найди команду, выбери год — покажется весь состав этого раунда.
      </p>

      {slots.map((slot, index) => {
        const suggestions = open === index ? suggestionsFor(index) : [];
        const years = slot.team
          ? freeYears(slot.team, players, slots, index)
          : [];
        const roster = rosters[index];

        return (
          <div className="team-block" key={`round-team-${index}`}>
            <div className="team-block-head">
              <b>КОМАНДА {index + 1}</b>
              {slot.team && (
                <button
                  type="button"
                  className="team-clear"
                  onClick={() => clearBlock(index)}
                >
                  СБРОС
                </button>
              )}
            </div>

            <div className="team-pick-row">

              <TeamLogo team={slot.team} width={45} height={45} />
              <div className="team-search-wrap">
                <input
                  className="team-search"
                  value={queries[index]}
                  placeholder="Команда"
                  autoComplete="off"
                  onChange={(event) => {
                    setQueries((current) =>
                      current.map((query, position) =>
                        position === index ? event.target.value : query,
                      ),
                    );
                    setOpen(index);
                  }}
                  onFocus={() => setOpen(index)}
                  onBlur={() => setOpen(null)}
                  onKeyDown={(event) => onSearchKeyDown(index, event)}
                />
                {suggestions.length > 0 && (
                  <ul className="team-options">
                    {suggestions.map((team) => (
                      <li key={team}>
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            selectTeam(index, team);
                          }}
                        >
                          <TeamLogo team={team} width={32} height={32} />
                          <span>{team}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <select
                className="team-year"
                value={slot.year ?? ""}
                disabled={!slot.team}
                onChange={(event) =>
                  setSlots((current) =>
                    current.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            year: event.target.value
                              ? Number(event.target.value)
                              : null,
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value=""> СОСТАВ </option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            {roster.length > 0 ? (
              <div className="match-list">
                {ROLE_ORDER.map((role) => (
                  <div className="match-col" key={role}>
                    <div className="match-col-label">{ROLE_SHORT[role]}</div>
                    {occupiedRoles.has(role)
                      ? null
                      : roster
                          .filter((player) => player.role === role)
                          .map((player) => (
                            <button
                              className="match-chip"
                              type="button"
                              key={player.id}
                              onClick={() => onTogglePicked(player)}
                            >
                              <span>{player.name}</span>
                              <em>{player.score.toFixed(1)}</em>
                            </button>
                          ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted team-block-hint">
                {slot.team ? "Выбери год." : "Команда не выбрана."}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
