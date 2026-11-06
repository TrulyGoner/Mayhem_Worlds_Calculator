export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&", "<": "<", ">": ">", '"': """, "'": "'",
  }[char]));
}

export function roleIcon(role) {
  const files = { TOP: 'top.png', JUNGLE: 'jungle.png', MID: 'middle.png', ADC: 'adc.png', SUPPORT: 'support.webp' };
  const file = files[String(role).toUpperCase()];
  const src = file ? `roles/${file}` : "";
  return src
    ? `<img class="cacl-role-icon" src="${escapeHtml(src)}" alt="" aria-hidden="true">`
    : `<i class="cacl-role-icon" data-role="${escapeHtml(role)}" aria-hidden="true"></i>`;
}