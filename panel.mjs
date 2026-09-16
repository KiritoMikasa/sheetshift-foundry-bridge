import { ATTRIBUTES, validSnapshot, validDice } from "./actions.mjs";
import { escapeHtml as esc, randomId } from "./protocol.mjs";

// All user-supplied content is text/escaped markup. No arbitrary formulas or macros.
export function createPanel({
  invoke,
  status,
  requestCheck,
  openSheet,
  online,
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
  function fresh() {
    return snapshot && online() && Date.now() - seen < 15000 && !snapshot.busy;
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
    body.innerHTML = `<p class="ss-status">${fresh() ? `● ${esc(snapshot.character)} · verbunden` : "○ Bogen nicht bereit · Aktionen pausiert"}</p>`;
    if (!snapshot) {
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
      body.querySelector("[data-status]").onclick = () => status(pending.id);
      body.querySelector("[data-reset]").onclick = () => {
        pending = null;
        selected = null;
        error = "";
        render();
      };
      return;
    }
    if (result) {
      body.insertAdjacentHTML(
        "beforeend",
        `<div class="ss-result" role="status"><strong>${esc(result.text)}</strong><small>Im öffentlichen Foundry-Chat</small></div>`,
      );
      if (
        result.action?.kind === "weapon" &&
        result.stage === "attack" &&
        result.hit
      ) {
        const button = document.createElement("button");
        button.textContent = "Treffer bestätigt · Schaden";
        button.disabled = !fresh();
        button.onclick = () => prepare(result.action.id, "damage");
        body.append(button);
      }
    }
    for (const [id, check] of checks) {
      if (check.expires < Date.now()) {
        checks.delete(id);
        continue;
      }
      const matches =
        snapshot?.actions.filter(
          (a) =>
            a.kind === "talent" &&
            a.label.toLocaleLowerCase("de") ===
              check.talent.toLocaleLowerCase("de"),
        ) || [];
      const action = matches.length === 1 ? matches[0] : null;
      const button = document.createElement("button");
      button.className = "ss-check";
      button.textContent = `${check.gm}: ${check.talent} + ${check.attribute}${action ? "" : " · Talent nicht gefunden"}`;
      button.disabled = !fresh() || !action;
      button.onclick = () => {
        checks.delete(id);
        prepare(action.id, "talent", check.attribute);
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
            : `${action.cost || "—"} ${action.resource || "Kosten konfigurieren"}`;
      button.innerHTML = `<span>${esc(action.label)}</span><small>${esc(detail)}</small>`;
      button.disabled = !fresh();
      button.onclick = () =>
        prepare(action.id, action.kind === "weapon" ? "attack" : action.kind);
      body.append(button);
    }
  }
  function prepare(id, stage, attribute = "") {
    if (!fresh()) return;
    const action = snapshot.actions.find((a) => a.id === id);
    if (!action) return;
    selected = { action, stage, attribute, snapshotId: snapshot.id };
    error = "";
    render();
  }
  function renderAction(body) {
    const { action, stage } = selected;
    const form = document.createElement("form");
    form.className = "ss-form";
    form.innerHTML = `<h3>${esc(action.label)}</h3>`;
    let allowed = fresh();
    if (action.kind === "talent") {
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
      allowed &&=
        Number.isInteger(action.cost) &&
        action.cost > 0 &&
        action.current >= action.cost;
      form.insertAdjacentHTML(
        "beforeend",
        `<p class="ss-description">${esc(action.description || "")}</p><p>${action.cost || "—"} ${esc(action.resource || "Ressource konfigurieren")} · ${action.current ?? "—"} → ${(action.current ?? 0) - (action.cost || 0)}</p><p>Kosten werden gespeichert, danach erscheint die Karte im öffentlichen Chat.</p>`,
      );
    }
    form.insertAdjacentHTML(
      "beforeend",
      `<button type="submit" ${allowed ? "" : "disabled"}>${action.kind === "ability" ? "Wirken & Kosten speichern" : "Öffentlich würfeln"}</button><button type="button" data-back>Zurück</button>`,
    );
    form.querySelector("[data-back]").onclick = () => {
      selected = null;
      render();
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      if (!fresh() || selected.snapshotId !== snapshot.id || !allowed) {
        error = "Werte geändert. Bitte Aktion erneut öffnen.";
        selected = null;
        render();
        return;
      }
      const data = new FormData(form);
      pending = { id: randomId(), action, stage };
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
    body.innerHTML = `<form class="ss-form"><h3>Probe anfordern</h3><label>Talent<input name="talent" maxlength="120" placeholder="z. B. Wahrnehmung" required></label><label>Attribut<select name="attribute">${ATTRIBUTES.map((a) => `<option>${a}</option>`).join("")}</select></label><fieldset><legend>Spieler</legend>${game.users
      .filter((u) => u.active && !u.isGM)
      .map(
        (u) =>
          `<label class="ss-player"><input type="checkbox" name="target" value="${esc(u.id)}" checked><span>${esc(u.name)}</span></label>`,
      )
      .join(
        "",
      )}</fieldset><p>Die Spieler bestätigen selbst. Ergebnisse sind öffentlich.</p><button type="submit">Anfordern</button><button type="button" data-back>Zurück</button></form>`;
    body.querySelector("[data-back]").onclick = () => {
      gmEditing = false;
      render();
    };
    body.querySelector("form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      if (!data.getAll("target").length) return;
      form.querySelector("[type=submit]").disabled = true;
      try {
        await requestCheck({
          id: randomId(),
          talent: String(data.get("talent")).trim(),
          attribute: data.get("attribute"),
          targets: data.getAll("target"),
          expires: Date.now() + 120000,
        });
        error = "";
        gmEditing = false;
        render();
      } catch {
        error = "Anforderung nicht bestätigt. Bitte Foundry-Chat prüfen.";
        gmEditing = false;
        render();
      }
    };
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
        if (selected && selected.snapshotId !== value.id) {
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
        status.textContent = fresh()
          ? `● ${snapshot.character} · verbunden`
          : "○ Bogen nicht bereit · Aktionen pausiert";
    },
    clear() {
      snapshot = undefined;
      seen = 0;
      selected = null;
      pending = null;
      result = null;
      error = "";
      render();
    },
    check(check) {
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
      pending = null;
      selected = null;
      error = "";
      render();
    },
  };
}
