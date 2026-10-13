import { isText, isId } from "./protocol.mjs";
export const ICONS = {
  sword: "fa-sword",
  wand: "fa-wand-magic-sparkles",
  skull: "fa-skull",
  flame: "fa-fire",
  shield: "fa-shield-halved",
  moon: "fa-moon",
  bolt: "fa-bolt",
  heart: "fa-heart",
  book: "fa-book-open",
};
export const ANIMATIONS = {
  none: "Keine",
  shadow: "Schatten",
  heal: "Heilung",
  shield: "Schild",
  fire: "Feuer",
  lightning: "Blitz",
  slash: "Waffenhieb",
};
export const COLORS = {
  violet: "#b694f4",
  blue: "#7dbbf2",
  red: "#ef8c7e",
  green: "#8ed3a2",
  gold: "#e2bf7c",
};
export const TARGETS = {
  none: "Ohne Ziel",
  self: "Auf mich",
  target: "Markierte Ziele",
};
export const SHAPES = {
  none: "Keine Fläche",
  circle: "Kreis",
  cone: "Kegel",
  ray: "Linie",
  rect: "Rechteck",
};
const number = (value, maximum = 1000000) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= maximum;
export function validProfile(p) {
  return Boolean(
    p &&
      Object.hasOwn(ICONS, p.icon) &&
      Object.hasOwn(ANIMATIONS, p.animation) &&
      Object.hasOwn(COLORS, p.color) &&
      Object.hasOwn(TARGETS, p.target) &&
      Object.hasOwn(SHAPES, p.shape) &&
      typeof p.sound === "boolean" &&
      (p.range === undefined || number(p.range, 10000)) &&
      (p.size === undefined || number(p.size, 10000)),
  );
}
export function defaultProfile(kind) {
  return {
    icon: kind === "weapon" ? "sword" : kind === "talent" ? "book" : "wand",
    animation: "none",
    color: "violet",
    target: "none",
    shape: "none",
    sound: false,
  };
}
export function validVitals(v) {
  return Boolean(
    v &&
      (v.health === null ||
        (number(v.health?.current) &&
          number(v.health?.max) &&
          v.health.current <= v.health.max)) &&
      Array.isArray(v.resources) &&
      v.resources.length <= 8 &&
      v.resources.every(
        (r) =>
          isText(r.label) &&
          number(r.current) &&
          number(r.max) &&
          r.current <= r.max,
      ) &&
      Array.isArray(v.conditions) &&
      v.conditions.length <= 2000 &&
      v.conditions.every(
        (c) =>
          isText(c.label) &&
          typeof c.duration === "string" &&
          c.duration.length <= 120,
      ),
  );
}
export function validTabletop(s) {
  return Boolean(
    s &&
      isId(s.characterId) &&
      typeof s.share === "boolean" &&
      s.audience === "gm" &&
      validVitals(s.vitals),
  );
}
const uuid = (value) =>
  typeof value === "string" &&
  /^Scene\.[A-Za-z0-9_-]{1,64}\.Token\.[A-Za-z0-9_-]{1,64}$/.test(value);
export function validMapContext(c) {
  return Boolean(
    c &&
      isText(c.actorId) &&
      uuid(c.source) &&
      Array.isArray(c.targets) &&
      c.targets.length <= 20 &&
      c.targets.every((t) => uuid(t.uuid) && isText(t.label)) &&
      (c.area === undefined ||
        (isText(c.area.id) &&
          number(c.area.x, 10000000) &&
          number(c.area.y, 10000000) &&
          number(c.area.size, 10000) &&
          Object.hasOwn(SHAPES, c.area.shape) &&
          number(c.area.direction, 360))),
  );
}
export function conditionIcon(label) {
  const value = label.toLocaleLowerCase("de");
  if (/brenn|feuer|burn/.test(value)) return "flame";
  if (/gift|poison|fluch|curse/.test(value)) return "skull";
  if (/schild|shield|schutz/.test(value)) return "shield";
  if (/betäub|stun|lähm|paraly/.test(value)) return "bolt";
  return "wand";
}
