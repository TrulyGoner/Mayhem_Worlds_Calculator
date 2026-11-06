import { updatePickedFromClick, noteYearSelection } from './events-handlers.js';
import { schedule } from './state.js';

export function attachEventListeners(root, SELECTORS, safeRender, state) {
  root.querySelector(SELECTORS.refresh)?.addEventListener("click", safeRender);
  root.querySelector(SELECTORS.playAgain)?.addEventListener("click", () => {
    state.picked = [];
    state.roundPicked = null;
    state.pendingTeam = null;
    state.playerBaseline = null;
    state.mapKeys = "";
    state.matchStarted = false;
    safeRender();
  });
  root.querySelectorAll(SELECTORS.teamInput).forEach((input) => input.addEventListener("change", (event) => {
    const element = event.currentTarget;
    state.manualSlots[Number(element.dataset.slot)] = element.value.trim();
    setTimeout(safeRender, 0);
  }));
  root.querySelectorAll(SELECTORS.teamReset).forEach((button) => button.addEventListener("click", () => {
    state.manualSlots[Number(button.dataset.reset)] = "";
    setTimeout(safeRender, 0);
  }));
}

export function setupGlobalListeners(safeRender) {
  document.addEventListener("click", (event) => { updatePickedFromClick(event); schedule(); }, true);
  document.addEventListener("change", (event) => { noteYearSelection(event); schedule(); }, true);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}