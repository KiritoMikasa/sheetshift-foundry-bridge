import { validSnapshot, validDice } from "./actions.mjs";
import { escapeHtml as esc, randomId } from "./protocol.mjs";
import { requestForm } from "./gm-requests.mjs";

// All user-supplied content is text/escaped markup. No arbitrary formulas or macros.
export function createPanel({
  invoke,
  status,
  requestCheck,
  openSheet,
  online,
  rollFree,
  canRollFree = online,
}) {
  let root,
    snapshot,
    seen = 0,
    pending,
    result,
    error = "",
    selected,
    collapsed = false,
    lastReady = false,
    gmEditing = false;
  const checks = new Map();
  const hits = new Map();
  const completedChecks = new Set();
  function fresh() {
    return snapshot && online() && Date.now() - seen < 15000 && !snapshot.busy;
  }
  function connectionText() {
    return fresh() ? `● ${snapshot.character} · verbunden` : canRollFree() ? "● Foundry bereit · Bogen nicht bereit" : "○ Foundry offline · Aktionen pausiert";
  }
  function show() {
    if (!root) {
      root = document.createElement("section");
      root.className = "sheetshift-play";
      root.setAttribute("aria-label", "Sheetshift Aktionen");
      document.body.append(root);
    }
    collapsed = false;
    gmEditing = false;
    render();
  }
  function render() {
    if (!root || gmEditing) return;
    lastReady = Boolean(fresh());
    root.classList.toggle("ss-collapsed", collapsed);
    root.innerHTML = `<header><strong>✦ Sheetshift</strong><button type="button" data-collapse aria-label="${collapsed ? "Aktionen öffnen" : "Aktionen einklappen"}">${collapsed ? "+" : "−"}</button></header>`;
    const header = root.querySelector("header");
    header.title = "Ziehen, um das Panel zu verschieben";
    header.onpointerdown = (event) => {
      if (event.target.closest("button")) return;
      const rect = root.getBoundingClientRect(),
        dx = event.clientX - rect.left,
        dy = event.clientY - rect.top;
      header.setPointerCapture(event.pointerId);
      header.onpointermove = (e) => {
        root.style.left = `${Math.max(0, Math.min(innerWidth - root.offsetWidth, e.clientX - dx))}px`;
        root.style.top = `${Math.max(0, Math.min(innerHeight - 45, e.clientY - dy))}px`;
      };
      header.onpointerup = header.onpointercancel = () => {
        header.onpointermove = null;
      };
    };
    root.querySelector("[data-collapse]").onclick = () => {
      collapsed = !collapsed;
      render();
    };
    if (collapsed) return;
    const body = document.createElement("div");
    body.className = "ss-body";
    root.append(body);
    body.innerHTML = `<p class="ss-status">${esc(connectionText())}</p>`;
    const freeContext = selected?.action.kind === "free" || result?.action.kind === "free" || [...checks.values()].some(check => check.kind === "free");
    if (!snapshot && !freeContext) {
      body.insertAdjacentHTML(
        "beforeend",
        "<p>Öffne deinen Bogen, bestätige die Verbindung und wähle dort deine Foundry-Favoriten.</p><button data-open>Bogen öffnen</button>",
      );
      body.querySelector("[data-open]").onclick = openSheet;
    }
    if (game.user.isGM) {
      const button = document.createElement("button");
      button.textContent = "Probe anfordern";
      button.onclick = gmForm;
      body.append(button);
    }
    if (error) {
      const p = document.createElement("p");
      p.className = "ss-error";
      p.setAttribute("role", "alert");
      p.textContent = error;
      body.append(p);
    }
    if (pending) {
      body.insertAdjacentHTML(
        "beforeend",
        '<p role="status">Aktion gesendet. Bei fehlender Bestätigung zuerst den Chat prüfen.</p><button data-status>Status prüfen · keine Wiederholung</button><button data-reset>Chat geprüft · abschließen</button>',
      );
      body.querySelector("[data-status]").onclick = () => status(pending.id, pending.local);
      body.querySelector("[data-reset]").onclick = () => {
        // The player explicitly checked the chat; do not offer uncertain damage twice.
        if (pending.attackId) hits.delete(pending.attackId);
        if (pending.checkId) completedChecks.add(pending.checkId);
        pending = null;
        selected = null;
        error = "";
        render();
      };
      return;
    }
    if (result && !hits.has(result.id)) {
      body.insertAdjacentHTML(
        "beforeend",
        `<div class="ss-result" role="status"><small>${esc(result.action.label)}</small><strong>${esc(result.text)}</strong><small>Im öffentlichen Foundry-Chat</small></div>`,
      );
    }
    for (const [id, hit] of hits) {
      const card = document.createElement("div");
      card.className = "ss-result";
      card.innerHTML = `<small>${esc(hit.action.label)} · Treffer &lt; ${hit.action.target}</small><strong>${esc(hit.text)}</strong><small>Verteidigung mit dem GM klären</small>`;
      const damage = document.createElement("button");
      damage.textContent = "Treffer bestätigt · Schaden";
      damage.disabled = !fresh() || !snapshot.actions.some((a) => a.id === hit.action.id && a.kind === "weapon");
      damage.onclick = () => prepare(hit.action.id, "damage", "", id);
      const discard = document.createElement("button");
      discard.textContent = "Treffer verwerfen";
      discard.onclick = () => {
        hits.delete(id);
        if (selected?.attackId === id) selected = null;
        if (result?.id === id) result = null;
        render();
      };
      card.append(damage, discard);
      body.append(card);
    }
    for (const [id, check] of checks) {
      if (check.expires < Date.now()) {
        checks.delete(id);
        continue;
      }
      const keyed = check.talentKey ? snapshot?.actions.filter(a => a.kind === "talent" && a.talentKey === check.talentKey) || [] : [];
      const matches = check.kind === "free" ? [] : keyed.length ? keyed :
        snapshot?.actions.filter(
          (a) =>
            a.kind === "talent" &&
            a.label.toLocaleLowerCase("de") ===
              check.talent.toLocaleLowerCase("de"),
        ) || [];
      const action = matches.length === 1 ? matches[0] : null;
      const button = document.createElement("button");
      button.className = "ss-check";
      button.textContent = check.kind === "free" ? `${check.gm}: ${check.label} · ${check.formula}` : `${check.gm}: ${check.talent} + ${check.attribute}${action ? "" : " · Talent nicht gefunden"}`;
      button.disabled = check.kind === "free" ? !canRollFree() : !fresh() || !action;
      button.onclick = () => {
        if (check.kind === "free") {
          selected = { action: { id, kind: "free", label: check.label, formula: check.formula }, stage: "free", checkId: id };
          error = ""; render();
        } else {
          prepare(action.id, "talent", check.attribute, undefined, id);
        }
      };
      body.append(button);
    }
    if (selected) {
      renderAction(body);
      return;
    }
    const actions = snapshot?.actions.filter((a) => a.favorite) || [];
    if (snapshot && !actions.length)
      body.insertAdjacentHTML(
        "beforeend",
        "<p>Favoriten im Bogen unter „Foundry-Aktionen“ auswählen.</p>",
      );
    for (const action of actions) {
      const button = document.createElement("button");
      button.className = "ss-action";
      const detail =
        action.kind === "talent"
          ? `+${action.score}`
          : action.kind === "weapon"
            ? `Treffer < ${action.target ?? "—"}`
            : action.cost > 0
              ? `${action.cost} ${action.resource}`
              : "Ohne Ressourcenkosten";
      button.innerHTML = `<span>${esc(action.label)}</span><small>${esc(detail)}</small>`;
      button.disabled = !fresh();
      button.onclick = () =>
        prepare(action.id, action.kind === "weapon" ? "attack" : action.kind);
      body.append(button);
    }
  }
  function prepare(id, stage, attribute = "", attackId, checkId) {
    if (!fresh()) return;
    const action = snapshot.actions.find((a) => a.id === id);
    if (!action) return;
    if (stage === "damage" && !hits.has(attackId)) return;
    selected = { action, stage, attribute, snapshotId: snapshot.id, attackId, checkId };
    error = "";
    render();
  }
  function renderAction(body) {
    const { action, stage } = selected;
    const form = document.createElement("form");
    form.className = "ss-form";
    form.innerHTML = `<h3>${esc(action.label)}</h3>`;
    let allowed = action.kind === "free" ? canRollFree() && checks.get(selected.checkId)?.expires >= Date.now() : fresh();
    if (action.kind === "free") {
      form.insertAdjacentHTML("beforeend", `<p>${esc(action.formula)}</p><small>Vom GM angefordert · ohne Talent- oder Attributwerte · öffentlich im Foundry-Chat</small>`);
    } else if (action.kind === "talent") {
      form.insertAdjacentHTML(
        "beforeend",
        `<label>Attribut<select name="attribute" required><option value="">Bitte wählen</option>${snapshot.attributes.map((a) => `<option value="${a.key}" ${a.key === selected.attribute ? "selected" : ""}>${a.key} (${a.modifier >= 0 ? "+" : ""}${a.modifier})</option>`).join("")}</select></label><label>Bonus / Malus<input name="bonus" type="number" step="1" min="-10000" max="10000" value="0" required></label><p>1d20 + Talent ${action.score} + Attribut + Bonus</p>`,
      );
    } else if (action.kind === "weapon") {
      allowed &&=
        stage === "attack"
          ? Number.isSafeInteger(action.target)
          : validDice(action.dice) && Number.isSafeInteger(action.power);
      form.insertAdjacentHTML(
        "beforeend",
        `<p>${stage === "attack" ? `1d100 &lt; ${action.target ?? "—"}<br>Gleichstand trifft nicht.` : `${esc(action.dice || "Schadenswürfel im Bogen konfigurieren")} + Angriffskraft ${action.power ?? "—"}<br>Nur nach bestätigtem Treffer würfeln.`}</p>`,
      );
    } else {
      allowed &&= !(action.cost > 0) || action.current >= action.cost;
      form.insertAdjacentHTML(
        "beforeend",
        `<p class="ss-description">${esc(action.description || "")}</p>${action.cost > 0 ? `<p>${action.cost} ${esc(action.resource)} · ${action.current ?? "—"} → ${(action.current ?? 0) - action.cost}</p><p>Kosten werden gespeichert, danach erscheint die Karte im öffentlichen Chat.</p>` : "<p>Ohne Ressourcenkosten · Fähigkeit im öffentlichen Chat anzeigen.</p>"}`,
      );
    }
    form.insertAdjacentHTML(
      "beforeend",
      `<button type="submit" ${allowed ? "" : "disabled"}>${action.kind === "ability" ? (action.cost > 0 ? "Wirken & Kosten speichern" : "Wirken") : "Öffentlich würfeln"}</button><button type="button" data-back>Zurück</button>`,
    );
    form.querySelector("[data-back]").onclick = () => {
      selected = null;
      render();
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      if (!allowed || (action.kind === "free" ? !canRollFree() || checks.get(selected.checkId)?.expires < Date.now() : !fresh() || selected.snapshotId !== snapshot.id)) {
        error = action.kind === "free" ? "Anforderung abgelaufen oder Foundry offline. Bitte den GM erneut anfordern lassen." : "Werte geändert. Bitte Aktion erneut öffnen.";
        selected = null;
        render();
        return;
      }
      const data = new FormData(form);
      pending = { id: action.kind === "free" ? selected.checkId : randomId(), action, stage, attackId: selected.attackId, checkId: selected.checkId, local: action.kind === "free" };
      if (selected.checkId) checks.delete(selected.checkId);
      if (action.kind === "free") {
        const request = { id: pending.id, kind: "free", character: fresh() ? snapshot.character : game.user.name, talent: action.label, formula: action.formula };
        render();
        void rollFree(request);
        return;
      }
      invoke({
        id: pending.id,
        actionId: action.id,
        snapshotId: snapshot.id,
        stage,
        attribute: data.get("attribute"),
        bonus: Number(data.get("bonus") || 0),
      });
      render();
    };
    body.append(form);
  }
  function gmForm() {
    if (!game.user.isGM || !root) return;
    gmEditing = true;
    const body = root.querySelector(".ss-body");
    requestForm({ body, talents: snapshot?.actions.filter(a => a.kind === "talent") || [], onRequest: requestCheck,
      onBack: () => { gmEditing = false; render(); } });
  }
  return {
    show,
    snapshot(value) {
      if (!validSnapshot(value)) return;
      const changed =
        snapshot?.id !== value.id || snapshot?.busy !== value.busy || !fresh();
      snapshot = value;
      seen = Date.now();
      if (changed) {
        if (selected && selected.action.kind !== "free" && selected.snapshotId !== value.id) {
          selected = null;
          error = "Charakterwerte aktualisiert. Bitte Aktion erneut wählen.";
        }
        render();
      }
    },
    tick() {
      if (!root) return;
      if (lastReady !== Boolean(fresh())) render();
      const status = root.querySelector(".ss-status");
      if (status)
        status.textContent = connectionText();
    },
    clear() {
      snapshot = undefined;
      seen = 0;
      selected = null;
      pending = null;
      result = null;
      hits.clear();
      error = "";
      render();
    },
    check(check) {
      if (completedChecks.has(check.id) || pending?.checkId === check.id) return;
      checks.set(check.id, check);
      show();
    },
    receipt(data) {
      if (!pending || data.id !== pending.id || data.pending) return;
      if (data.error) {
        error = data.error;
        render();
        return;
      }
      const r = data.result;
      if (!r) return;
      const hit = pending.stage === "attack" && r.total < pending.action.target;
      result = {
        ...pending,
        hit,
        text:
          pending.action.kind === "ability"
            ? `${pending.action.label} gewirkt`
            : `${r.total}${pending.stage === "attack" ? (hit ? " · Trefferprobe gelungen" : " · Verfehlt") : ""}`,
      };
      if (hit) hits.set(result.id, result);
      if (pending.stage === "damage") hits.delete(pending.attackId);
      if (pending.checkId) completedChecks.add(pending.checkId);
      pending = null;
      selected = null;
      error = "";
      render();
    },
  };
}
