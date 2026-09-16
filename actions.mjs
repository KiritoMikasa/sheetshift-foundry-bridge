import {
  isId,
  isText,
  isModifier,
  validRequest,
  formulaFor,
} from "./protocol.mjs";
export const ATTRIBUTES = ["KK", "GE", "KL", "MU", "KO", "CH", "FF", "IT"];
export function validDice(value) {
  if (typeof value !== "string") return false;
  const match = /^([1-9]\d?)d(4|6|8|10|12|20|100)$/.exec(value);
  return Boolean(match && Number(match[1]) <= 20);
}
export function validActionRequest(r) {
  if (!r?.kind || r.kind === "talent") return validRequest(r);
  if (!isId(r.id) || !isText(r.character) || !isText(r.talent)) return false;
  if (r.kind === "attack") return isModifier(r.target) && r.target >= 0;
  if (r.kind === "damage") return validDice(r.dice) && isModifier(r.power);
  return (
    r.kind === "ability" &&
    typeof r.description === "string" &&
    r.description.length <= 4000 &&
    isText(r.resource) &&
    Number.isSafeInteger(r.cost) &&
    r.cost > 0 &&
    r.cost <= 10000
  );
}
export function actionFormula(r) {
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
      Array.isArray(s.actions) &&
      s.actions.length <= 500 &&
      s.actions.every(
        (a) =>
          isText(a.id) &&
          isText(a.label) &&
          typeof a.favorite === "boolean" &&
          (a.kind === "talent"
            ? isModifier(a.score)
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
                    a.cost > 0 &&
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
    !check ||
    !isId(check.id) ||
    !isText(check.talent) ||
    !ATTRIBUTES.includes(check.attribute) ||
    !Array.isArray(check.targets) ||
    !check.targets.includes(currentUser.id) ||
    !Number.isSafeInteger(check.expires) ||
    check.expires < now ||
    check.expires > now + 180000
  )
    return null;
  return { ...check, gm: initiatingUser.name };
}
