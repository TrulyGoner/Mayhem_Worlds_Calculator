import { createState, resetState, schedule } from './state.js';
import { render } from './render.js';
import { attachEventListeners, setupGlobalListeners } from './events.js';
import { SELECTORS } from './dom.js';
import { extensionUrl } from './utils.js';

const HOST_ID = "cacl-worlds-overlay";
const DATA_URL = "worlds_mayhem_ratings.json";

const state = createState();

const host = document.createElement("div");
host.id = HOST_ID;
const shadow = host.attachShadow({ mode: "open" });
const shadowStyle = document.createElement("link");
shadowStyle.rel = "stylesheet";
shadowStyle.href = extensionUrl("content.css");
const root = document.createElement("div");
shadow.append(shadowStyle, root);
document.documentElement.appendChild(host);

function safeRender() {
  try {
    const html = render(state, extensionUrl, SELECTORS);
    if (html && root.innerHTML !== html) {
      root.innerHTML = html;
      attachEventListeners(root, SELECTORS, safeRender, state);
    }
  } catch (error) {
    if (isInvalidatedContext(error)) return;
    throw error;
  }
}

function isInvalidatedContext(error) {
  return /Extension context invalidated/i.test(String(error?.message || error));
}

window.addEventListener("error", (event) => {
  if (!isInvalidatedContext(event.error || event.message)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
window.addEventListener("unhandledrejection", (event) => {
  if (!isInvalidatedContext(event.reason)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

async function load() {
  try {
    const url = extensionUrl(DATA_URL);
    if (!url) return;
    const response = await fetch(url);
    const json = await response.json();
    state.players = (json.player_competition_scores || []).map((row) => ({
      name: row.player, team: row.team, year: Number(row.year), role: row.position,
      score: Number(row.adjusted_competition_score),
    })).filter((player) => player.name && player.team && globalThis.CaclShared?.ROLE_WEIGHTS?.[player.role] && Number.isFinite(player.score));
    safeRender();
  } catch (error) {
    root.innerHTML = `<section class="cacl-panel"><div class="cacl-kicker">CACL WORLDS MAYHEM</div><div class="cacl-status">Не удалось загрузить локальный рейтинг.</div></section>`;
    console.warn("Cacl extension data load failed", error);
  }
}

setupGlobalListeners(safeRender);
load();