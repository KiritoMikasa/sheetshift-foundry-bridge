import { CHANNEL, escapeHtml, formulaFor, randomId, sheetUrl } from "./protocol.mjs";
import { createReceiver } from "./receiver.mjs";

const ID = "sheetshift-bridge";
let connection;
function stop() {
  if (!connection) return;
  connection.send({ channel: CHANNEL, nonce: connection.nonce, type: "disconnected" });
  window.removeEventListener("message", connection.receive);
  clearInterval(connection.timer);
  connection = undefined;
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
  const send = data => { if (!popup.closed) popup.postMessage(data, url.origin); };
  const receive = createReceiver({ source: popup, origin: url.origin, nonce, send,
    isOnline: () => Boolean(game.socket?.connected),
    storage: window.sessionStorage, storageKey: `${ID}:${game.world.id}:${game.user.id}`,
    execute: async request => {
      if (!game.ready || !game.user?.active || !game.socket?.connected) throw new Error("Foundry is offline");
      const roll = new foundry.dice.Roll(formulaFor(request));
      await roll.evaluate({ allowInteractive: false });
      const message = await roll.toMessage({
        speaker: { alias: game.user.name },
        flavor: `<strong>${escapeHtml(request.character)} · ${escapeHtml(request.talent)}</strong><br>`
          + `${escapeHtml(request.attribute)} · Talent ${request.score} · Attribut ${request.modifier} · Bonus ${request.bonus} · Sheetshift`,
        flags: { [ID]: { requestId: request.id } },
      }, { messageMode: "public" });
      if (!message?.id) throw new Error("Chat message was not created");
      return { total: roll.total, die: roll.dice[0]?.total, formula: formulaFor(request), messageId: message.id };
    },
  });
  window.addEventListener("message", receive);
  const hello = () => {
    if (popup.closed) { stop(); return; }
    if (game.socket?.connected) send({ channel: CHANNEL, nonce, type: "hello", player: game.user.name, world: game.world.title });
    else send({ channel: CHANNEL, nonce, type: "disconnected" });
  };
  connection = { popup, origin: url.origin, nonce, send, receive, timer: setInterval(hello, 2000) };
  hello();
}

Hooks.once("init", () => {
  game.settings.register(ID, "sheetUrl", {
    name: "Sheetshift-Adresse", hint: "Adresse deiner Sheetshift-Website. Zum lokalen Testen: http://localhost:3457. Gilt nur für diesen Browser.",
    scope: "client", config: true, type: String, default: "",
  });
});
Hooks.once("ready", () => { game.modules.get(ID).api = { openSheet }; });
Hooks.on("renderSettings", (_app, element) => {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root || root.querySelector("[data-sheetshift-open]")) return;
  const button = document.createElement("button");
  button.type = "button"; button.dataset.sheetshiftOpen = "true";
  button.innerHTML = '<i class="fas fa-dice-d20" aria-hidden="true"></i> Sheetshift öffnen';
  button.addEventListener("click", openSheet);
  root.prepend(button);
});
window.addEventListener("beforeunload", stop);
