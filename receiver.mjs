import { CHANNEL, isId } from "./protocol.mjs";

// No socket relay or GM impersonation: only the window opened by this player can send checks.
import { validActionRequest } from "./actions.mjs";

export function createReceiver({ source, origin, nonce, execute, send, storage, storageKey, isOnline = () => true, now = Date.now, onMessage = () => {} }) {
  const records = new Map();
  let accepted = false;
  let lastRoll = 0;
  function reply(type, data = {}) { send({ channel: CHANNEL, nonce, type, ...data }); }
  return async function receive(event) {
    const data = event.data;
    if (event.source !== source || event.origin !== origin || !data || data.channel !== CHANNEL || data.nonce !== nonce) return;
    if (!isOnline()) { reply("disconnected"); return; }
    if (data.type === "accept") { accepted = true; reply("connected"); return; }
    if (data.type === "disconnect") { accepted = false; return; }
    if (!accepted) return;
    if (data.type === "snapshot") { onMessage(data); return; }
    if (data.type === "actionError") { onMessage(data); return; }
    if (data.type === "ping") { reply("pong"); return; }
    if (!["roll", "status"].includes(data.type) || !isId(data.request?.id)) return;
    const request = data.request;
    const key = `${storageKey}:${request.id}`;
    let record = records.get(request.id);
    try { record ??= JSON.parse(storage.getItem(key) || "null"); }
    catch { reply("result", { id: request.id, error: "Browserspeicher nicht verfügbar. Bitte zuerst den Foundry-Chat prüfen." }); return; }
    if (record) { reply("result", { id: request.id, ...record }); return; }
    if (data.type === "status") { reply("result", { id: request.id, error: "Kein gespeicherter Status. Bitte den Foundry-Chat prüfen; es wurde nicht erneut gewürfelt." }); return; }
    if (!validActionRequest(request)) { reply("result", { id: request.id, error: "Ungültige Probe." }); return; }
    if (now() - lastRoll < 750) { reply("result", { id: request.id, error: "Bitte kurz warten, bevor du erneut würfelst." }); return; }
    lastRoll = now();
    const pending = { pending: true };
    // Persist before rolling. An uncertain request is never executed again, even after reload.
    try { storage.setItem(key, JSON.stringify(pending)); }
    catch { reply("result", { id: request.id, error: "Browserspeicher voll oder gesperrt. Es wurde nicht gewürfelt." }); return; }
    records.set(request.id, pending);
    try { record = { result: await execute(request) }; }
    catch { record = { error: "Foundry konnte den Wurf nicht bestätigen. Bitte den Chat prüfen, bevor du einen neuen Wurf startest." }; }
    records.set(request.id, record);
    try { storage.setItem(key, JSON.stringify(record)); } catch { /* In-memory receipt still allows status queries. */ }
    reply("result", { id: request.id, ...record });
  };
}
