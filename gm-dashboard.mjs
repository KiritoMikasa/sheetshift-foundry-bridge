import { MODULE } from "./token-link.mjs";
import { validCheckRequest } from "./actions.mjs";
import { isId, escapeHtml as esc } from "./protocol.mjs";
import { vitalsMarkup } from "./token-overlays.mjs";
export function createRequestTracker() {
  const checks = new Map();
  return {
    ingest(message, initiator) {
      const check = message.flags?.[MODULE]?.check;
      if (
        initiator?.isGM &&
        message.author?.id === initiator.id &&
        validCheckRequest(
          check,
          Math.min(Date.now(), check?.expires ?? Date.now()),
        ) &&
        check.expires >= Date.now() - 86400000 &&
        check.targets.every((id) => message.whisper?.includes(id))
      ) {
        if (!checks.has(check.id))
          checks.set(check.id, {
            ...check,
            gm: initiator.id,
            results: new Map(),
          });
        while (checks.size > 30) checks.delete(checks.keys().next().value);
      }
      const id = message.flags?.[MODULE]?.checkId,
        request = checks.get(id);
      if (
        !isId(id) ||
        !request ||
        !initiator ||
        message.author?.id !== initiator.id ||
        !request.targets.includes(initiator.id) ||
        !message.rolls?.length ||
        !isId(message.flags?.[MODULE]?.requestId)
      )
        return;
      // Correlation is informational: use the actual Foundry author and a native roll document.
      if (!request.results.has(initiator.id))
        request.results.set(initiator.id, {
          total: message.rolls[0].total,
          messageId: message.id,
        });
    },
    rows() {
      return [...checks.values()].reverse().map((r) => ({
        ...r,
        targets: r.targets.map((id) => ({
          id,
          name: game.users.get(id)?.name || "Spieler",
          result: r.results.get(id),
          status: r.results.has(id)
            ? "gewürfelt"
            : r.expires < Date.now()
              ? "abgelaufen"
              : "wartet",
        })),
      }));
    },
  };
}
export function renderDashboard(body, { sharing, tracker, combat, onBack }) {
  if (!game.user.isGM) return;
  body.innerHTML =
    '<h3>Gruppe & Proben</h3><p class="ss-hint">Private Freigaben · Werte bleiben beim Spieler. Offline-Werte sind veraltet.</p>';
  for (const row of sharing.records()) {
    const card = document.createElement("article");
    card.className = "ss-party";
    card.innerHTML = `<strong>${esc(row.character)}</strong><small>${esc(row.userName)} · ${row.active ? "verbunden" : "offline / veraltet"}</small>${vitalsMarkup(row.vitals)}`;
    body.append(card);
  }
  if (!sharing.records().length)
    body.insertAdjacentHTML(
      "beforeend",
      "<p>Noch keine Freigaben. Spieler verknüpfen einen eigenen Actor und aktivieren im Bogen „nur mit dem GM teilen“.</p>",
    );
  for (const request of combat.requests()) {
    const button = document.createElement("button");
    button.textContent = `${request.player} · Zug beenden bestätigen`;
    button.onclick = async () => {
      button.disabled = true;
      try {
        await combat.confirm(request.id);
        button.remove();
      } catch (e) {
        ui.notifications.warn(e.message);
        button.disabled = false;
      }
    };
    body.append(button);
  }
  body.insertAdjacentHTML("beforeend", "<h3>Angeforderte Proben</h3>");
  for (const row of tracker.rows()) {
    body.insertAdjacentHTML(
      "beforeend",
      `<article class="ss-party"><strong>${esc(row.kind === "free" ? `${row.label} · ${row.formula}` : `${row.talent} + ${row.attribute}`)}</strong>${row.targets.map((t) => `<small>${esc(t.name)} · ${t.status}${t.result ? ` · ${esc(String(t.result.total))}` : ""}</small>`).join("")}</article>`,
    );
  }
  const refresh = document.createElement("button");
  refresh.textContent = "Aktualisieren";
  refresh.onclick = () =>
    renderDashboard(body, { sharing, tracker, combat, onBack });
  const back = document.createElement("button");
  back.textContent = "Zurück";
  back.onclick = onBack;
  body.append(refresh, back);
}
