import {
  isId,
  isText,
  isModifier,
  validRequest,
  formulaFor,
} from "./protocol.mjs";
import {
  validProfile,
  validTabletop,
  validMapContext,
} from "./tabletop-model.mjs";
export const ATTRIBUTES = ["KK", "GE", "KL", "MU", "KO", "CH", "FF", "IT"];
// Only dice terms and whole-number additions/subtractions; never Foundry data references or code.
export function parseFreeFormula(value) {
  if (typeof value !== "string" || value.length > 80) return null;
  const raw = value.toLowerCase().replace(/w/g, "d").replace(/\s/g, "");
  const terms = raw.match(/[+-]?(?:\d*d\d+|\d+)/g);
  if (!terms?.length || terms.length > 10 || terms.join("") !== raw)
    return null;
  let minimum = 0,
    maximum = 0,
    totalDice = 0,
    firstDice;
  const normalized = [];
  for (const [index, term] of terms.entries()) {
    if (index && !/^[+-]/.test(term)) return null;
    const sign = term[0] === "-" ? -1 : 1;
    const token = term.replace(/^[+-]/, "");
    let low, high, text;
    if (token.includes("d")) {
      const [countText, sidesText] = token.split("d");
      const count = countText ? Number(countText) : 1,
        sides = Number(sidesText);
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > 20 ||
        !Number.isSafeInteger(sides) ||
        sides < 2 ||
        sides > 1000
      )
        return null;
      totalDice += count;
      if (totalDice > 20) return null;
      low = count;
      high = count * sides;
      text = `${count}d${sides}`;
      firstDice ??= { minimum: low, maximum: high };
    } else {
      low = high = Number(token);
      text = String(low);
      if (!isModifier(low)) return null;
    }
    minimum += sign > 0 ? low : -high;
    maximum += sign > 0 ? high : -low;
    normalized.push(
      `${index ? (sign > 0 ? "+ " : "- ") : sign < 0 ? "-" : ""}${text}`,
    );
  }
  return totalDice
    ? { formula: normalized.join(" "), minimum, maximum, firstDice }
    : null;
}
export function validDice(value) {
  if (typeof value !== "string") return false;
  const match = /^([1-9]\d?)d(4|6|8|10|12|20|100)$/.exec(value);
  return Boolean(match && Number(match[1]) <= 20);
}
export function validActionRequest(r) {
  if (
    !r ||
    (r.profile !== undefined && !validProfile(r.profile)) ||
    (r.map !== undefined && !validMapContext(r.map)) ||
    (r.checkId !== undefined && !isId(r.checkId))
  )
    return false;
  if (!r?.kind || r.kind === "talent") return validRequest(r);
  if (!isId(r.id) || !isText(r.character) || !isText(r.talent)) return false;
  if (r.kind === "free") return Boolean(parseFreeFormula(r.formula));
  if (r.kind === "attack") return isModifier(r.target) && r.target >= 0;
  if (r.kind === "damage") return validDice(r.dice) && isModifier(r.power);
  return (
    r.kind === "ability" &&
    typeof r.description === "string" &&
    r.description.length <= 4000 &&
    (r.resource === undefined ||
      (typeof r.resource === "string" && r.resource.length <= 120)) &&
    (r.cost === undefined ||
      (Number.isSafeInteger(r.cost) && r.cost >= 0 && r.cost <= 10000)) &&
    (!(r.cost > 0) || isText(r.resource))
  );
}
// A weapon's Hit percentage includes its boundary: 60 hits on a roll of 60.
export function attackHits(total, target) {
  return Number.isSafeInteger(total) && total >= 1 && total <= 100 &&
    isModifier(target) && target >= 0 && total <= target;
}
export function actionFormula(r) {
  if (r.kind === "free") return parseFreeFormula(r.formula)?.formula || "";
  if (r.kind === "attack") return "1d100";
  if (r.kind === "damage")
    return `${r.dice}${r.power < 0 ? " - " : " + "}${Math.abs(r.power)}`;
  if (r.kind === "ability") return "";
  return formulaFor(r);
}
export function validReceipt(r, result) {
  if (
    !result ||
    !isText(result.messageId) ||
    result.formula !== actionFormula(r)
  )
    return false;
  if (r.kind === "ability") return result.total === 0 && result.die === 0;
  if (!Number.isSafeInteger(result.total) || !Number.isSafeInteger(result.die))
    return false;
  if (r.kind === "free") {
    const parsed = parseFreeFormula(r.formula);
    return Boolean(
      parsed &&
        result.total >= parsed.minimum &&
        result.total <= parsed.maximum &&
        result.die >= parsed.firstDice.minimum &&
        result.die <= parsed.firstDice.maximum,
    );
  }
  if (r.kind === "attack")
    return result.die >= 1 && result.die <= 100 && result.total === result.die;
  if (r.kind === "damage") {
    const [count, sides] = r.dice.split("d").map(Number);
    return (
      result.die >= count &&
      result.die <= count * sides &&
      result.total === result.die + r.power
    );
  }
  return (
    result.die >= 1 &&
    result.die <= 20 &&
    result.total === result.die + r.score + r.modifier + r.bonus
  );
}
export function validSnapshot(s) {
  return Boolean(
    s &&
      isId(s.id) &&
      isText(s.character) &&
      (s.tabletop === undefined || validTabletop(s.tabletop)) &&
      Array.isArray(s.actions) &&
      s.actions.length <= 500 &&
      s.actions.every(
        (a) =>
          isText(a.id) &&
          isText(a.label) &&
          (a.profile === undefined || validProfile(a.profile)) &&
          typeof a.favorite === "boolean" &&
          (a.kind === "talent"
            ? isModifier(a.score) &&
              (a.talentKey === undefined || isText(a.talentKey)) &&
              (a.group === undefined || isText(a.group))
            : a.kind === "weapon"
              ? (a.target === undefined || isModifier(a.target)) &&
                (a.power === undefined || isModifier(a.power)) &&
                (!a.dice || validDice(a.dice))
              : a.kind === "ability" &&
                typeof a.description === "string" &&
                a.description.length <= 4000 &&
                typeof a.resource === "string" &&
                a.resource.length <= 120 &&
                (a.cost === undefined ||
                  (Number.isSafeInteger(a.cost) &&
                    a.cost >= 0 &&
                    a.cost <= 10000)) &&
                (a.current === undefined ||
                  (Number.isSafeInteger(a.current) &&
                    a.current >= 0 &&
                    a.current <= 1000000))),
      ) &&
      typeof s.busy === "boolean" &&
      Array.isArray(s.attributes) &&
      s.attributes.length <= 8 &&
      s.attributes.every(
        (a) => ATTRIBUTES.includes(a.key) && isModifier(a.modifier),
      ),
  );
}
export function gmCheck(
  message,
  initiatingUser,
  currentUser,
  now = Date.now(),
) {
  const check = message?.flags?.["sheetshift-bridge"]?.check;
  if (
    !initiatingUser?.isGM ||
    message.author?.id !== initiatingUser.id ||
    !validCheckRequest(check, now) ||
    !check.targets.includes(currentUser.id) ||
    !Number.isSafeInteger(check.expires) ||
    check.expires < now ||
    check.expires > now + 180000
  )
    return null;
  return { ...check, gm: initiatingUser.name };
}
export function validCheckRequest(check, now = Date.now()) {
  return Boolean(
    check &&
      isId(check.id) &&
      (check.kind === "free"
        ? isText(check.label) && parseFreeFormula(check.formula)
        : (check.kind === undefined || check.kind === "talent") &&
          isText(check.talent) &&
          ATTRIBUTES.includes(check.attribute) &&
          (check.talentKey === undefined || isText(check.talentKey))) &&
      Array.isArray(check.targets) &&
      check.targets.length > 0 &&
      check.targets.length <= 100 &&
      check.targets.every(isText) &&
      Number.isSafeInteger(check.expires) &&
      check.expires >= now &&
      check.expires <= now + 180000,
  );
}
