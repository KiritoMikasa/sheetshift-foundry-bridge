import { escapeHtml as esc } from "./protocol.mjs";
import { ICONS, conditionIcon } from "./tabletop-model.mjs";
export function vitalsMarkup(vitals) {
  const rows = [
    ...(vitals.health ? [{ label: "HP", ...vitals.health }] : []),
    ...vitals.resources,
  ];
  return (
    rows
      .map(
        (r) =>
          `<div class="ss-vital" title="${esc(r.label)}: ${r.current} / ${r.max}"><small>${esc(r.label)} <b>${r.current} / ${r.max}</b></small><div><i style="width:${r.max ? Math.min(100, (r.current / r.max) * 100) : 0}%"></i></div></div>`,
      )
      .join("") +
    `<div class="ss-conditions">${vitals.conditions.map((c) => `<span title="${esc(`${c.label}${c.duration ? ` · ${c.duration}` : ""}`)}"><i class="fas ${ICONS[conditionIcon(c.label)]}" aria-hidden="true"></i> ${esc(c.label)}</span>`).join("")}</div>`
  );
}
export function createTokenOverlays({ link, sharing, getSnapshot }) {
  let root;
  return {
    draw() {
      const canvas = globalThis.canvas;
      if (!canvas?.ready || !canvas.stage?.worldTransform || !document.body)
        return;
      root ||= document.body.appendChild(
        Object.assign(document.createElement("div"), {
          className: "ss-token-overlays",
        }),
      );
      const current = getSnapshot(),
        own = link.actor(),
        records = game.user.isGM ? sharing.records() : [];
      const view = canvas.app?.canvas || canvas.app?.view;
      const rect = view?.getBoundingClientRect?.() || { left: 0, top: 0 };
      const list = [];
      for (const token of canvas.tokens?.placeables || []) {
        if (
          token.visible === false ||
          (token.document.hidden && !game.user.isGM)
        )
          continue;
        const row = records.find(
          (r) => r.actorId === token.document.actorId && r.active,
        );
        const vitals =
          own?.id === token.document.actorId
            ? current?.tabletop?.vitals
            : row?.vitals;
        if (!vitals) continue;
        const point = canvas.stage.worldTransform.apply({
          x: token.center.x,
          y: token.y + token.h,
        });
        list.push(
          `<div class="ss-token-status" style="left:${point.x + rect.left}px;top:${point.y + rect.top + 4}px" aria-label="${esc(token.name)} · privater Status">${vitalsMarkup(vitals)}</div>`,
        );
      }
      const markup = list.join("");
      if (root.innerHTML !== markup) root.innerHTML = markup;
    },
    clear() {
      root?.remove();
      root = undefined;
    },
  };
}
