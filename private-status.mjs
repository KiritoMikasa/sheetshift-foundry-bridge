import {
  statusKeyPair,
  sealStatus,
  openStatus,
} from "./private-status-crypto.mjs";
import { MODULE } from "./token-link.mjs";
import { validVitals } from "./tabletop-model.mjs";
const hex = (s, length) =>
  typeof s === "string" && s.length === length && /^[0-9a-f]+$/.test(s);
export function validSealed(boxes) {
  return (
    Array.isArray(boxes) &&
    boxes.length > 0 &&
    boxes.length <= 100 &&
    boxes.every(
      (b) =>
        typeof b.userId === "string" &&
        b.userId.length <= 120 &&
        hex(b.key, 64) &&
        hex(b.ephemeral, 64) &&
        hex(b.nonce, 24) &&
        typeof b.data === "string" &&
        b.data.length >= 32 &&
        b.data.length <= 1400000 &&
        b.data.length % 2 === 0 &&
        /^[0-9a-f]+$/.test(b.data),
    )
  );
}
const context = (p, author, recipient) =>
  JSON.stringify([
    "sheetshift-status-v1",
    game.world.id,
    author,
    p.characterId,
    p.actorId,
    p.updatedAt,
    recipient,
  ]);
export function createPrivateStatus({ storage } = {}) {
  let keys,
    failed = false,
    initializing;
  return {
    async init() {
      if (!game.user.isGM || keys || failed) return;
      if (initializing) return initializing;
      initializing = (async () => {
        try {
          storage ||= globalThis.window?.localStorage;
          if (!storage || !game.user.setFlag)
            throw new Error("GM-Schlüsselspeicher nicht verfügbar.");
          const name = `${MODULE}:private-key:${game.world.id}:${game.user.id}`;
          const saved = storage.getItem(name);
          if (saved && !hex(saved, 64))
            throw new Error("GM-Schlüsselspeicher ungültig.");
          const pair = statusKeyPair(saved);
          storage.setItem(name, pair.secret);
          if (storage.getItem(name) !== pair.secret)
            throw new Error("GM-Schlüssel konnte nicht gespeichert werden.");
          await game.user.setFlag(MODULE, "statusKey", pair.publicKey);
          keys = pair;
        } catch (error) {
          failed = true;
          ui.notifications.warn(
            `Private Statusfreigabe pausiert: ${error.message}`,
          );
        }
      })();
      return initializing;
    },
    seal(vitals, payload) {
      const boxes = [];
      for (const user of game.users.filter((u) => u.isGM)) {
        const pub = user.getFlag?.(MODULE, "statusKey");
        if (!hex(pub, 64)) continue;
        boxes.push({
          userId: user.id,
          ...sealStatus(vitals, pub, context(payload, game.user.id, user.id)),
        });
      }
      return boxes;
    },
    open(payload, author) {
      if (!game.user.isGM || !keys) return null;
      const box = payload.sealed?.find(
        (b) => b.userId === game.user.id && b.key === keys.publicKey,
      );
      if (!box) return null;
      try {
        const vitals = openStatus(
          box,
          keys.secret,
          context(payload, author, game.user.id),
        );
        return validVitals(vitals) ? vitals : null;
      } catch {
        return null;
      }
    },
  };
}
