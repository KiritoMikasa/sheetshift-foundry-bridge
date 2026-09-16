export const CHANNEL = "sheetshift-foundry-v1";
export function randomId() {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("");
}
export function isId(value) { return typeof value === "string" && /^[a-f0-9]{32}$/.test(value); }
export function isText(value) { return typeof value === "string" && value.trim().length > 0 && value.length <= 120; }
export function isModifier(value) { return Number.isSafeInteger(value) && Math.abs(value) <= 10000; }
export function validRequest(value) {
  return Boolean(value && isId(value.id) && isText(value.character) && isText(value.talent)
    && /^(KK|GE|KL|MU|KO|CH|FF|IT)$/.test(value.attribute) && isModifier(value.score)
    && isModifier(value.modifier) && isModifier(value.bonus));
}
export function formulaFor(value) {
  return `1d20${[value.score, value.modifier, value.bonus].map(n => n < 0 ? ` - ${Math.abs(n)}` : ` + ${n}`).join("")}`;
}
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
export function sheetUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Bitte eine vollständige http(s)-Adresse ohne Zugangsdaten eingeben.");
  url.pathname = "/vault"; url.search = ""; url.hash = "";
  return url;
}
