import { randomId, escapeHtml as esc } from "./protocol.mjs";
import {
  COLORS,
  defaultProfile,
  SHAPES,
  validMapContext,
} from "./tabletop-model.mjs";
const tokens = () => globalThis.canvas?.tokens?.placeables || [];
export const tokenByUuid = (uuid) =>
  tokens().find(
    (t) =>
      t.document.uuid === uuid && t.visible !== false && !t.document.hidden,
  );
export function mapContext(link, profile) {
  const source = link.token();
  if (!source || source.document.hidden)
    throw new Error(
      "Wähle genau einen sichtbaren Token deines verknüpften Actors.",
    );
  const targets =
    profile.target === "self"
      ? [source]
      : profile.target === "target"
        ? [...(game.user.targets || [])].filter((t) =>
            tokenByUuid(t.document.uuid),
          )
        : [];
  if (profile.target === "target" && !targets.length)
    throw new Error("Zuerst ein sichtbares Ziel in Foundry markieren.");
  if (targets.length > 20)
    throw new Error("Bitte höchstens 20 Ziele markieren.");
  return {
    actorId: source.document.actorId,
    source: source.document.uuid,
    targets: targets.map((t) => ({
      uuid: t.document.uuid,
      label: t.name.slice(0, 120),
    })),
  };
}
export function contextAvailable(link, context) {
  return (
    validMapContext(context) &&
    link.ownsContext(context) &&
    Boolean(tokenByUuid(context.source)) &&
    context.targets.every((t) => tokenByUuid(t.uuid))
  );
}
export function distance(source, target) {
  const grid = globalThis.canvas?.grid;
  const measured = grid?.measurePath?.([source.center, target.center]);
  return Number.isFinite(measured?.distance) ? measured.distance : null;
}
export function areaPoints(shape, origin, aim, radius, width) {
  const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x),
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const transform = (x, y) => ({
    x: origin.x + x * cos - y * sin,
    y: origin.y + x * sin + y * cos,
  });
  if (shape === "circle")
    return Array.from({ length: 49 }, (_, i) => ({
      x: aim.x + radius * Math.cos((i * Math.PI) / 24),
      y: aim.y + radius * Math.sin((i * Math.PI) / 24),
    }));
  if (shape === "rect")
    return [
      [-radius / 2, -radius / 2],
      [radius / 2, -radius / 2],
      [radius / 2, radius / 2],
      [-radius / 2, radius / 2],
    ].map(([x, y]) => ({ x: aim.x + x, y: aim.y + y }));
  if (shape === "ray")
    return [
      [0, -width / 2],
      [radius, -width / 2],
      [radius, width / 2],
      [0, width / 2],
    ].map(([x, y]) => transform(x, y));
  return [
    origin,
    ...Array.from({ length: 17 }, (_, i) =>
      transform(
        radius * Math.cos(-Math.PI / 6 + (i * Math.PI) / 48),
        radius * Math.sin(-Math.PI / 6 + (i * Math.PI) / 48),
      ),
    ),
  ];
}
// A local, transient drawing works on v14 without creating scene Regions or moving tokens.
export function createMapActions({ link }) {
  let drawing, cancelPlacement;
  function clear() {
    cancelPlacement?.();
    cancelPlacement = null;
    if (drawing) {
      drawing.destroy();
      drawing = null;
    }
  }
  function draw(profile, source, aim) {
    if (!globalThis.PIXI?.Graphics || !canvas.stage || !canvas.grid?.distance)
      return;
    drawing ||= canvas.stage.addChild(new PIXI.Graphics());
    drawing.eventMode = "none";
    drawing.clear();
    const color = Number.parseInt(COLORS[profile.color].slice(1), 16),
      scale = canvas.grid.size / canvas.grid.distance;
    drawing.lineStyle(2, color, 0.9);
    if (profile.range > 0)
      drawing.drawCircle(
        source.center.x,
        source.center.y,
        profile.range * scale,
      );
    if (profile.shape !== "none" && profile.size > 0 && aim) {
      const points = areaPoints(
        profile.shape,
        source.center,
        aim,
        profile.size * scale,
        canvas.grid.size,
      );
      drawing.beginFill(color, 0.18);
      drawing.drawPolygon(points.flatMap((p) => [p.x, p.y]));
      drawing.endFill();
    }
  }
  return {
    clear,
    prepare(action, previous) {
      clear();
      const profile = action.profile || defaultProfile(action.kind);
      if (!link.actor()) {
        if (
          profile.target !== "none" ||
          profile.shape !== "none" ||
          profile.range > 0 ||
          profile.animation !== "none"
        )
          throw new Error(
            "Zuerst deinen Bogen mit einem eigenen Actor verknüpfen.",
          );
        return undefined;
      }
      if (
        !previous &&
        !link.token() &&
        profile.target === "none" &&
        profile.shape === "none" &&
        !(profile.range > 0) &&
        profile.animation === "none"
      )
        return undefined;
      if (previous) {
        if (!contextAvailable(link, previous))
          throw new Error(
            "Token oder ursprüngliches Ziel nicht mehr verfügbar.",
          );
        return previous;
      }
      return mapContext(link, profile);
    },
    preview(form, action, context, update, locked = false) {
      if (!context) return;
      const profile = action.profile || defaultProfile(action.kind),
        source = tokenByUuid(context.source);
      if (!source) return;
      draw(profile, source);
      const block = document.createElement("div");
      block.className = "ss-targets";
      const units =
        canvas.grid?.units || canvas.scene?.grid?.units || "Szeneneinheiten";
      const names = context.targets.map((t) => {
        const target = tokenByUuid(t.uuid),
          d = target ? distance(source, target) : null;
        return `<span>${esc(t.label)}${d === null ? "" : ` · ${Math.round(d * 10) / 10} ${esc(units)}${profile.range !== undefined && d > profile.range ? " · außerhalb Reichweite" : ""}`}</span>`;
      });
      block.innerHTML = `<small>${esc(source.name)} → ${names.length ? names.join(" · ") : "ohne Ziel"}</small>${profile.range !== undefined ? `<small>Reichweite ${profile.range} ${esc(units)} · Sichtlinie und Regeln mit dem GM klären.</small>` : ""}`;
      if (profile.shape !== "none") {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = context.area
          ? "Fläche neu platzieren"
          : `${SHAPES[profile.shape]} platzieren · ${profile.size || "Größe fehlt"} ${units}`;
        button.disabled = locked || !(profile.size > 0);
        button.onclick = () => {
          cancelPlacement?.();
          button.textContent = "Auf die Karte klicken · Esc bricht ab";
          const stage = canvas.stage;
          const move = (event) =>
            draw(profile, source, event.getLocalPosition(stage));
          const cancel = () => {
            stage.off("pointermove", move);
            stage.off("pointerdown", click);
            window.removeEventListener("keydown", key);
            cancelPlacement = null;
            button.textContent = "Fläche platzieren";
          };
          const key = (event) => {
            if (event.key === "Escape") {
              cancel();
              clear();
            }
          };
          const click = (event) => {
            if (event.button !== undefined && event.button !== 0) return;
            const point = event.getLocalPosition(stage);
            if (point.x < 0 || point.y < 0) return;
            event.stopPropagation?.();
            const origin =
              profile.shape === "circle" || profile.shape === "rect"
                ? point
                : source.center;
            const direction =
              ((Math.atan2(
                point.y - source.center.y,
                point.x - source.center.x,
              ) *
                180) /
                Math.PI +
                360) %
              360;
            const next = {
              ...context,
              area: {
                id: randomId(),
                shape: profile.shape,
                size: profile.size,
                x: origin.x,
                y: origin.y,
                direction,
              },
            };
            cancel();
            draw(profile, source, point);
            button.textContent = "Fläche platziert · neu wählen";
            update(next);
          };
          cancelPlacement = cancel;
          stage.on("pointermove", move);
          stage.on("pointerdown", click);
          window.addEventListener("keydown", key);
        };
        block.append(button);
        block.insertAdjacentHTML(
          "beforeend",
          "<small>Nur deine Vorschau · keine automatische Wirkung. Kegel 60°, Linie eine Rasterzelle breit, Kreisgröße = Radius, Rechteckgröße = Seitenlänge.</small>",
        );
      }
      for (const target of context.targets) {
        const token = tokenByUuid(target.uuid),
          src = token?.document.texture?.src;
        if (typeof src === "string" && !/^(?:javascript|data):/i.test(src)) {
          const image = document.createElement("img");
          image.src = src;
          image.alt = target.label;
          image.className = "ss-target-portrait";
          block.append(image);
        }
      }
      form.append(block);
    },
  };
}
