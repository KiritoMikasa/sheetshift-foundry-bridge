import { CHANNEL, escapeHtml, randomId, sheetUrl } from "./protocol.mjs";
import { createReceiver } from "./receiver.mjs";

import { actionFormula, gmCheck, validCheckRequest } from "./actions.mjs";
import { createPanel } from "./panel.mjs";

let panel;
const ID = "sheetshift-bridge";
let connection;
function stop() {
  if (!connection) return;
  connection.send({ channel: CHANNEL, nonce: connection.nonce, type: "disconnected" });
  window.removeEventListener("message", connection.receive);
  clearInterval(connection.timer);
  connection = undefined;
  panel?.clear();
}

async function executeRequest(request) {
  if (!game.ready || !game.user?.active || !game.socket?.connected) throw new Error("Foundry is offline");
  if (request.kind === "ability") {
    const message = await foundry.documents.ChatMessage.create({
      speaker: { alias: game.user.name },
      content: `<h3>${escapeHtml(request.character)} · ${escapeHtml(request.talent)}</h3><p>${escapeHtml(request.description).replace(/\n/g, "<br>")}</p>${request.cost > 0 ? `<p>${request.cost} ${escapeHtml(request.resource)} verbraucht · Sheetshift</p>` : "<p>Gewirkt · Sheetshift</p>"}`,
      flags: { [ID]: { requestId: request.id } },
    });
    if (!message?.id) throw new Error("Chat message was not created");
    return { total: 0, die: 0, formula: "", messageId: message.id };
  }
  const roll = new foundry.dice.Roll(actionFormula(request));
  await roll.evaluate({ allowInteractive: false });
  const message = await roll.toMessage({
    speaker: { alias: game.user.name },
    flavor: `<strong>${escapeHtml(request.character)} · ${escapeHtml(request.talent)}</strong><br>`
      + (request.kind === "attack" ? `Treffer: 1d100 &lt; ${request.target} · ${roll.total < request.target ? "Probe gelungen — Verteidigung abwarten" : "Verfehlt"}`
        : request.kind === "damage" ? "Bestätigter Treffer · Waffenschaden + Angriffskraft"
        : request.kind === "free" ? `Freier Wurf: ${escapeHtml(actionFormula(request))}`
        : `${escapeHtml(request.attribute)} · Talent ${request.score} · Attribut ${request.modifier} · Bonus ${request.bonus}`) + " · Sheetshift",
    flags: { [ID]: { requestId: request.id } },
  }, { messageMode: "public" });
  if (!message?.id) throw new Error("Chat message was not created");
  return { total: roll.total, die: roll.dice[0]?.total, formula: actionFormula(request), messageId: message.id };
}

export function openSheet() {
  if (!game.ready || !game.user) return ui.notifications.warn("Bitte zuerst der Foundry-Welt beitreten.");
  let url;
  try { url = sheetUrl(game.settings.get(ID, "sheetUrl")); }
  catch { return ui.notifications.warn("Unter Game Settings → Sheetshift Bridge zuerst die Sheetshift-Adresse speichern."); }
  const existing = connection?.origin === url.origin && !connection.popup.closed ? connection.popup : null;
  stop();
  // Intentionally retain opener for postMessage; never use a wildcard target origin.
  const popup = existing || window.open(url.href, `sheetshift-${game.world.id}-${game.user.id}`);
  if (existing) popup.focus();
  if (!popup) return ui.notifications.warn("Popup blockiert. Bitte Popups für Foundry erlauben und erneut klicken.");
  const nonce = randomId();
  const send = data => {
    if (data.type === "result") panel?.receipt(data);
    if (!popup.closed) popup.postMessage(data, url.origin);
  };
  const receive = createReceiver({ source: popup, origin: url.origin, nonce, send,
    isOnline: () => Boolean(game.socket?.connected),
    onMessage: data => { if (data.type === "snapshot") panel?.snapshot(data.snapshot); if (data.type === "actionError") panel?.receipt(data); },
    storage: window.sessionStorage, storageKey: `${ID}:${game.world.id}:${game.user.id}`,
    execute: executeRequest,
  });
  window.addEventListener("message", receive);
  const hello = () => {
    panel?.tick();
    if (popup.closed) { stop(); return; }
    if (game.socket?.connected) send({ channel: CHANNEL, nonce, type: "hello", features: ["play-actions-v1", "resource-free-abilities-v1"], player: game.user.name, world: game.world.title });
    else send({ channel: CHANNEL, nonce, type: "disconnected" });
  };
  connection = { popup, origin: url.origin, nonce, send, receive, timer: setInterval(hello, 2000) };
  hello();
  panel?.show();
}

Hooks.once("init", () => {
  game.settings.register(ID, "sheetUrl", {
    name: "Sheetshift-Adresse", hint: "Adresse deiner Sheetshift-Website. Zum lokalen Testen: http://localhost:3457. Gilt nur für diesen Browser.",
    scope: "client", config: true, type: String, default: "",
  });
});
Hooks.once("ready", () => {
  const source = {}, origin = "foundry-panel", nonce = randomId();
  const local = createReceiver({ source, origin, nonce, execute: executeRequest,
    send: data => { if (data.type === "result") panel?.receipt(data); },
    storage: window.sessionStorage, storageKey: `${ID}:${game.world.id}:${game.user.id}`,
    isOnline: () => Boolean(game.ready && game.user?.active && game.socket?.connected) });
  const localEvent = (type, request = {}) => ({ source, origin, data: { channel: CHANNEL, nonce, type, request } });
  void local(localEvent("accept"));
  panel = createPanel({ openSheet, online: () => Boolean(connection && !connection.popup.closed && game.socket?.connected),
    invoke: invocation => connection?.send({ channel: CHANNEL, nonce: connection.nonce, type: "invoke", invocation }),
    rollFree: request => local(localEvent("roll", request)),
    canRollFree: () => Boolean(game.ready && game.user?.active && game.socket?.connected),
    status: (id, isLocal) => { if (isLocal) { void local(localEvent("status", { id })); return; } if (connection) void connection.receive({ source: connection.popup, origin: connection.origin, data: { channel: CHANNEL, nonce: connection.nonce, type: "status", request: { id } } }); },
    requestCheck: async check => {
      if (!game.user.isGM || !validCheckRequest(check)) throw new Error("Invalid GM request");
      const message = await foundry.documents.ChatMessage.create({ content: `<strong>Probe angefordert: ${check.kind === "free" ? `${escapeHtml(check.label)} · ${escapeHtml(check.formula)}` : `${escapeHtml(check.talent)} + ${escapeHtml(check.attribute)}`}</strong><p>In Sheetshift-Aktionen bestätigen · 2 Minuten gültig.</p>`, whisper: [...check.targets, game.user.id], flags: { [ID]: { check } } });
      if (!message?.id) throw new Error("Request was not created");
      return message;
    },
  });
  game.modules.get(ID).api = { openSheet, openActions: () => panel.show() };
});
Hooks.on("createChatMessage", (message, _options, userId) => {
  // The initiating user is supplied by Foundry's document operation, never a claimed flag.
  const check = gmCheck(message, game.users.get(userId), game.user);
  if (check) { panel?.check(check); ui.notifications.info(check.kind === "free" ? `${check.gm}: ${check.label} · ${check.formula} angefordert` : `${check.gm}: ${check.talent} + ${check.attribute} angefordert`); }
});
Hooks.on("renderSettings", (_app, element) => {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root || root.querySelector("[data-sheetshift-open]")) return;
  const button = document.createElement("button");
  button.type = "button"; button.dataset.sheetshiftOpen = "true";
  button.innerHTML = '<i class="fas fa-dice-d20" aria-hidden="true"></i> Sheetshift öffnen';
  button.addEventListener("click", openSheet);
  const actions = document.createElement("button"); actions.type = "button"; actions.textContent = "✦ Sheetshift-Aktionen";
  actions.addEventListener("click", () => panel?.show());
  root.prepend(button, actions);
});
window.addEventListener("beforeunload", stop);
