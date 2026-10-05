import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Player } from "../types/game";
import { type TeamSlot, inferYearFromRoster, yearsFor } from "../lib/teams";
import { bestTeamMatch, normalize, pickYear } from "../lib/fuzzy";
import { CARD_ROIS, COLUMN_CROP, type CardRegion, cropCard, drawRegions } from "../lib/screenshot";
import { recognizeCard } from "../lib/ocr";

type Props = {
  players: Player[];
  onApply: (slots: TeamSlot[]) => void;
};

type CardResult = {
  team: string;
  year: number | null;
  yearCandidates: number[];
  score: number;
  raw: string;
  ambiguous: boolean;
};

type MemoryEntry = { text: string; team: string; year: number };

const MEMORY_KEY = "screenshot-ocr-memory-v1";
const REGION_KEY = "screenshot-roi-v1";

function readMemory(): MemoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(MEMORY_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? (parsed as MemoryEntry[]) : [];
  } catch {
    return [];
  }
}

function recall(raw: string): MemoryEntry | null {
  const key = normalize(raw);
  if (!key) return null;
  return readMemory().find((entry) => entry.text === key) ?? null;
}

function remember(raw: string, team: string, year: number | null) {
  if (!raw || !team || year === null) return;
  const key = normalize(raw);
  if (!key) return;
  try {
    const memory = readMemory()
      .filter((entry) => entry.text !== key)
      .concat({ text: key, team, year })
      .slice(-300);
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
  }
}

type DragState = {
  index: number;
  mode: "move" | "top" | "bottom";
  startX: number;
  startY: number;
};

function readRegions(): CardRegion[] | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(REGION_KEY) ?? "[]");
    if (
      !Array.isArray(parsed) ||
      parsed.length !== CARD_ROIS.length ||
      parsed.some(
        (region: CardRegion) =>
          typeof region.x !== "number" ||
          typeof region.y !== "number" ||
          typeof region.w !== "number" ||
          typeof region.h !== "number",
      )
    ) {
      return null;
    }
    return parsed as CardRegion[];
  } catch {
    return null;
  }
}

export function ScreenshotScan({ players, onApply }: Props) {
  const [frame, setFrame] = useState<HTMLImageElement | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [cards, setCards] = useState<CardResult[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [regions, setRegions] = useState<CardRegion[]>(
    () => readRegions() ?? [...CARD_ROIS],
  );
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const originRef = useRef<CardResult[]>([]);
  const dragRef = useRef<DragState | null>(null);
  // regions changes on every pointermove, and the scan effect depends on it, so
  // without this flag a drag re-dispatches the whole OCR pass per frame. Scan
  // once the drag settles instead.
  const [dragging, setDragging] = useState(false);

  const teams = useMemo(
    () => [...new Set(players.map((player) => player.team))].sort(),
    [players],
  );

  const applyFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        setFrame(image);
        setCards(null);
        setStage("");
      };
      image.src = url;
      setObjectUrl(url);
    },
    [objectUrl],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((entry) =>
        entry.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (file) {
        event.preventDefault();
        applyFile(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [applyFile]);

  const MIN_SIZE = 0.04;

  const toFraction = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  function hitTest(
    point: { x: number; y: number },
    current: readonly CardRegion[],
  ): { index: number; mode: "move" | "top" | "bottom" } | null {
    const edge = 0.015;
    for (let index = current.length - 1; index >= 0; index -= 1) {
      const region = current[index];
      const inside =
        point.x >= region.x &&
        point.x <= region.x + region.w &&
        point.y >= region.y &&
        point.y <= region.y + region.h;
      if (!inside) continue;
      if (point.y - region.y < edge) return { index, mode: "top" };
      if (region.y + region.h - point.y < edge) return { index, mode: "bottom" };
      return { index, mode: "move" };
    }
    return null;
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    const hit = hitTest(toFraction(event), regions);
    if (!hit) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toFraction(event);
    dragRef.current = { ...hit, startX: point.x, startY: point.y };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toFraction(event);
    const deltaX = point.x - drag.startX;
    const deltaY = point.y - drag.startY;
    setRegions((current) =>
      current.map((region, index) => {
        if (index !== drag.index) return region;
        if (drag.mode === "move") {
          return {
            ...region,
            x: Math.min(Math.max(0, region.x + deltaX), 1 - region.w),
            y: Math.min(Math.max(0, region.y + deltaY), 1 - region.h),
          };
        }
        if (drag.mode === "top") {
          const nextY = Math.min(
            Math.max(0, region.y + deltaY),
            region.y + region.h - MIN_SIZE,
          );
          return { ...region, y: nextY, h: region.y + region.h - nextY };
        }
        const nextH = Math.min(Math.max(MIN_SIZE, region.h + deltaY), 1 - region.y);
        return { ...region, h: nextH };
      }),
    );
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  useEffect(() => {
    try {
      localStorage.setItem(REGION_KEY, JSON.stringify(regions));
    } catch {
    }
  }, [regions]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !frame) return;
    const box = canvas.parentElement?.clientWidth ?? 320;
    drawRegions(canvas, frame, Math.max(240, box), regions);
  }, [frame, cards, regions]);

  useEffect(() => {
    if (!frame || dragging) return;
    let cancelled = false;
    // Tesseract runs outside React, so this effect is the sync point with an
    // external system: busy/cards must be reset before the scan is dispatched.
    // oxlint-disable-next-line react/set-state-in-effect
    setBusy(true);
    setCards(null);
    (async () => {
      const results: CardResult[] = [];
      for (let index = 0; index < regions.length; index += 1) {
        if (cancelled) return;
        setStage(`Разбор карточки ${index + 1} из ${regions.length}…`);
        const crop = cropCard(frame, regions[index]);
        const raw = await recognizeCard(crop);
        if (cancelled) return;
        const matched = bestTeamMatch(raw, teams);
        const known = recall(raw);
        const team = known ? known.team : matched.team;
        const roster = team ? inferYearFromRoster(raw, team, players) : null;
        const year = known
          ? known.year
          : team
            ? (pickYear(raw, yearsFor(team, players)) ??
              roster?.year ??
              null)
            : null;
        results.push({
          team,
          year,
          yearCandidates: roster?.candidates ?? [],
          score: matched.score,
          raw: raw.trim(),
          ambiguous: matched.ambiguous,
        });
      }
      if (!cancelled && results.some((card) => card.team && card.year === null)) {
        setStage("Год вне кадра — ищу в колонке…");
        const columnText = await recognizeCard(cropCard(frame, COLUMN_CROP));
        for (const card of results) {
          if (card.team && card.year === null) {
            card.year = pickYear(columnText, yearsFor(card.team, players));
          }
        }
      }
      if (!cancelled) {
        setCards(results);
        originRef.current = results;
        setBusy(false);
        setStage("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [frame, players, teams, regions, dragging]);

  const duplicates = useMemo(() => {
    if (!cards) return new Set<string>();
    const seen = new Map<string, number>();
    for (const card of cards) {
      const key = `${card.team}·${card.year ?? ""}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return new Set(
      [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key),
    );
  }, [cards]);

  const ready =
    !!cards &&
    cards.every(
      (card) =>
        card.team !== "" &&
        card.year !== null &&
        !duplicates.has(`${card.team}·${card.year}`),
    );

  const updateCard = (index: number, patch: Partial<CardResult>) => {
    setCards((current) =>
      current
        ? current.map((card, position) =>
            position === index ? { ...card, ...patch } : card,
          )
        : current,
    );
  };

  function applyCards() {
    if (!cards) return;
    cards.forEach((card, index) => {
      const origin = originRef.current[index];
      if (
        origin &&
        (origin.team !== card.team || origin.year !== card.year)
      ) {
        remember(card.raw, card.team, card.year);
      }
    });
    onApply(
      cards.map((card) => ({
        team: card.team,
        year: card.year,
      })),
    );
    setCards(null);
    setFrame(null);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
  }

  if (!frame) {
    return (
      <section className="panel screenshot-panel">
        <div className="section-label">SCREENSHOT IMPORT</div>
        <h2>Заполнение по скриншоту</h2>
        <p className="muted">
          Вставь скриншот драфта (Ctrl+V). Три карточки команд слева прочитаются
          автоматически и подставятся в выбор команд. Проверка перед
          применением обязательна — OCR ошибается.
        </p>
        <div
          className={`shot-empty ${dragOver ? "dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            if (file) applyFile(file);
          }}
        >
          <svg
            className="shot-drop-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="shot-drop-title">Перетащи скриншот сюда</span>
          <span className="shot-drop-desc">
            или нажми <kbd className="shot-kbd">Ctrl+V</kbd> для вставки из
            буфера
          </span>
          <button
            type="button"
            className="shot-browse"
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Выбрать файл…
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) applyFile(file);
            event.target.value = "";
          }}
        />
      </section>
    );
  }

  return (
    <section className="panel screenshot-panel">
      <div className="section-label">SCREENSHOT IMPORT</div>
      <h2>Заполнение по скриншоту</h2>

      <div className="shot-content">
        <div
          className={`shot-preview-wrap ${dragOver ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            if (file) applyFile(file);
          }}
        >
          <canvas
            ref={previewRef}
            className="shot-preview"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <div className="shot-frame-hint">
            <span>Потяни рамку за край или целься в команду и год.</span>
            <button
              type="button"
              className="shot-reset-roi"
              onClick={() => setRegions([...CARD_ROIS])}
            >
              Сброс рамок
            </button>
          </div>
        </div>

        {busy ? (
          <div className="shot-busy">
            <span className="shot-spinner" aria-hidden="true" />
            <b>{stage || "Готовлю воркер…"}</b>
            <small className="muted">
              Первое распознавание качает ядро — 2–5 секунд.
            </small>
          </div>
        ) : cards ? (
          <div className="shot-results">
            {cards.map((card, index) => {
              const years = card.team ? yearsFor(card.team, players) : [];
              const yearValue =
                card.year !== null && years.includes(card.year) ? card.year : "";
              const duplicated = duplicates.has(
                `${card.team}·${card.year ?? ""}`,
              );
              return (
                <div
                  className={`shot-card ${duplicated ? "duplicate" : ""}`}
                  key={`card-${index}`}
                >
                  <div className="shot-card-head">
                    <b>КАРТОЧКА {index + 1}</b>
                    <span
                      className={`shot-score ${
                        Math.round(card.score * 100) >= 80
                          ? "score-good"
                          : "score-weak"
                      }`}
                    >
                      {Math.round(card.score * 100)}%
                    </span>
                  </div>
                  <div className="shot-card-picks">
                    <select
                      value={card.team}
                      onChange={(event) => {
                        // Same rule as the round picker: a single-year team
                        // resolves its year immediately, anything else waits
                        // for the manual pick.
                        const years = event.target.value
                          ? yearsFor(event.target.value, players)
                          : [];
                        updateCard(index, {
                          team: event.target.value,
                          year: years.length === 1 ? years[0] : null,
                        });
                      }}
                    >
                      <option value="">— команда —</option>
                      {teams.map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                    <select
                      value={String(yearValue)}
                      disabled={!card.team}
                      onChange={(event) =>
                        updateCard(index, {
                          year: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">СОСТАВ</option>
                      {years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                  {duplicated && (
                    <small className="shot-warn">
                      Повтор: та же команда и год уже в другой карточке.
                    </small>
                  )}
                  {card.ambiguous && (
                    <small className="shot-warn">
                      Неоднозначный матч — проверь команду.
                    </small>
                  )}
                  {card.year === null && card.yearCandidates.length >= 2 && (
                    <small className="shot-warn">
                      Состав читается, год неоднозначен:{" "}
                      {card.yearCandidates.join(" / ")} — выбери.
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted shot-rescan">
            Информации на экране не хватает для распознавания. Растяни рамку на
            карточки команд или вставь другой скрин.
          </p>
        )}
      </div>
      {cards && (
        <button
          type="button"
          className="shot-apply"
          disabled={!ready}
          onClick={applyCards}
        >
          Применить {ready ? cards.filter((card) => card.team).length : 0}/
          {regions.length}
        </button>
      )}
    </section>
  );
}