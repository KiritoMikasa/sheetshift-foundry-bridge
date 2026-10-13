import { createPrivateStatus } from "./private-status.mjs";
import { createTokenLink } from "./token-link.mjs";
import { createStatusSharing } from "./status-sharing.mjs";
import { createMapActions } from "./map-actions.mjs";
import { createTokenOverlays, vitalsMarkup } from "./token-overlays.mjs";
import { createCombatCompanion } from "./combat-companion.mjs";
import { createRequestTracker, renderDashboard } from "./gm-dashboard.mjs";
import { optionalModules, playAnimation } from "./animations.mjs";
import { defaultProfile, ICONS } from "./tabletop-model.mjs";
import { escapeHtml as esc } from "./protocol.mjs";
export function createTabletop({ changed = () => {} } = {}) {
  let snapshot;
  const link = createTokenLink({
    changed: () => {
      void sharing.tick();
      changed();
    },
  });
  const privacy = createPrivateStatus();
  const sharing = createStatusSharing({ link, privacy }),
    map = createMapActions({ link });
  void privacy.init().then(() => {
    for (const message of game.messages?.contents || [])
      sharing.ingest(message);
  });
  const overlays = createTokenOverlays({
    link,
    sharing,
    getSnapshot: () => snapshot,
  });
  const combat = createCombatCompanion({ link, changed }),
    tracker = createRequestTracker();
  let hud, hudSignature, dashboard, dashboardBack, dashboardSignature;
  const api = {
    link,
    sharing,
    combat,
    tracker,
    snapshot(value) {
      snapshot = value;
      link.snapshot(value);
      sharing.snapshot(value);
      void sharing.tick();
    },
    clear() {
      snapshot = undefined;
      link.snapshot(undefined);
      sharing.clear();
      map.clear();
      overlays.clear();
    },
    tick() {
      void sharing.tick();
      combat.tick();
      overlays.draw();
      if (hud?.isConnected) api.renderHUD(hud);
      if (dashboard?.isConnected) {
        const signature = JSON.stringify({
          party: sharing.records().map((r) => ({
            user: r.userId,
            character: r.characterId,
            vitals: r.vitals,
            active: r.active,
          })),
          checks: tracker.rows(),
          turns: combat.requests(),
        });
        if (signature !== dashboardSignature) {
          dashboardSignature = signature;
          renderDashboard(dashboard, {
            sharing,
            tracker,
            combat,
            onBack: dashboardBack,
          });
        }
      }
    },
    message(message, initiator) {
      sharing.ingest(message);
      tracker.ingest(message, initiator);
      combat.ingest(message, initiator);
    },
    animation: playAnimation,
    prepare: map.prepare,
    validate(context) {
      return !context || link.ownsContext(context);
    },
    preview: map.preview,
    clearPreview: map.clear,
    clearCanvas() {
      map.clear();
      overlays.clear();
    },
    icon(action) {
      return ICONS[(action.profile || defaultProfile(action.kind)).icon];
    },
    dashboard(body, onBack) {
      dashboard = body;
      dashboardSignature = undefined;
      dashboardBack = () => {
        dashboard = undefined;
        onBack();
      };
      renderDashboard(body, {
        sharing,
        tracker,
        combat,
        onBack: dashboardBack,
      });
    },
    renderHUD(element) {
      hud = element;
      if (!snapshot?.tabletop) {
        element.innerHTML = "";
        return;
      }
      const actor = link.actor(),
        token = link.token(),
        turn = combat.turn();
      const sharingHint = !snapshot.tabletop.share
        ? "Status nur für dich"
        : !actor
          ? "Für GM-Freigabe: Actor verknüpfen"
          : game.users.some(
                (u) =>
                  u.isGM &&
                  /^[0-9a-f]{64}$/.test(
                    u.getFlag?.("sheetshift-bridge", "statusKey") || "",
                  ),
              )
            ? "GM-Freigabe aktiv"
            : "Wartet auf GM-Verbindung";
      const signature = JSON.stringify({
        actor: actor?.id,
        token: token?.id,
        vitals: snapshot.tabletop.vitals,
        turn: turn?.key,
        sharingHint,
      });
      if (hudSignature === signature && element.dataset.signature === signature)
        return;
      hudSignature = signature;
      element.dataset.signature = signature;
      element.innerHTML = `<div class="ss-token-link"><strong>${esc(actor?.name || "Deinen Token verknüpfen")}</strong><small>${actor ? (token ? `Token: ${esc(token.name)}` : "Eigenen Token auswählen") : "Einmalig einen eigenen Foundry-Actor wählen"}</small><button type="button" data-link>${actor ? "Verknüpfung ändern" : "Actor verknüpfen"}</button></div>${vitalsMarkup(snapshot.tabletop.vitals)}<small class="ss-hint">${sharingHint}</small>${turn ? '<p class="ss-turn" role="status">✦ Du bist dran</p><button data-end-turn type="button">Zug beenden · GM bestätigen lassen</button>' : ""}`;
      element.querySelector("[data-link]").onclick = () =>
        api.bindingForm(element);
      const end = element.querySelector("[data-end-turn]");
      if (end)
        end.onclick = async () => {
          end.disabled = true;
          try {
            await combat.finish();
          } catch (e) {
            ui.notifications.warn(e.message);
          } finally {
            end.disabled = false;
          }
        };
    },
    bindingForm(element) {
      hud = undefined;
      hudSignature = undefined;
      delete element.dataset.signature;
      const actor = link.actor(),
        form = document.createElement("form");
      form.className = "ss-form";
      form.innerHTML = `<label>Eigener Foundry-Actor<select name="actor" required><option value="">Bitte wählen</option>${link
        .choices()
        .map(
          (a) =>
            `<option value="${esc(a.id)}" ${actor?.id === a.id ? "selected" : ""}>${esc(a.name)}</option>`,
        )
        .join(
          "",
        )}</select></label><small>Nur eine Verknüpfung. HP und Ressourcen werden nicht in öffentliche Actor-Felder geschrieben.</small><button type="submit">Verknüpfen</button>${actor ? '<button type="button" data-unlink>Verknüpfung lösen</button>' : ""}<button type="button" data-back>Zurück</button>`;
      const run = async (fn) => {
        try {
          await fn();
          api.renderHUD(element);
        } catch (e) {
          ui.notifications.warn(e.message);
        }
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        void run(() => link.bind(new FormData(form).get("actor")));
      };
      const unlink = form.querySelector("[data-unlink]");
      if (unlink) unlink.onclick = () => void run(() => link.unbind());
      form.querySelector("[data-back]").onclick = () => api.renderHUD(element);
      element.replaceChildren(form);
    },
    renderAddons(body) {
      const enabled = optionalModules();
      const details = document.createElement("details");
      details.className = "ss-addons";
      details.innerHTML = `<summary>Optionale Effekte</summary><small>Sequencer + JB2A: ${enabled.sequencer && enabled.jb2a ? "bereit" : "nicht aktiv"} · Presets im Bogen auswählen.</small><small>Dice So Nice: ${enabled.dice ? "aktiv" : "optional"} · native Würfe nutzen dessen 3D-Würfel.</small><small>FXMaster: ${enabled.ambience ? "aktiv" : "optional"} · Szenenstimmung stellt der GM direkt in Foundry ein.</small>`;
      body.append(details);
    },
  };
  return api;
}
