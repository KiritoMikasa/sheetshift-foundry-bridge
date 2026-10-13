import { MODULE, owns } from "./token-link.mjs";
import { isText, isId } from "./protocol.mjs";
import { validSealed } from "./private-status.mjs";
// Status is encrypted for each GM before it enters ChatMessage flags; whisper visibility is not the security boundary.
export function partyRecord(message, now = Date.now()) {
  const value = message?.flags?.[MODULE]?.party;
  const author = message?.author;
  if (
    !value ||
    !author ||
    !isId(value.characterId) ||
    !isText(value.character) ||
    !isText(value.actorId) ||
    typeof value.shared !== "boolean" ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt > now + 10000 ||
    !message.whisper?.includes(author.id)
  )
    return null;
  const viewers = message.whisper.map((id) => game.users.get(id));
  if (viewers.some((user) => !user || (user.id !== author.id && !user.isGM)))
    return null;
  const actor = game.actors?.get(value.actorId),
    link = actor?.getFlag(MODULE, "link");
  if (
    !owns(actor, author) ||
    link?.characterId !== value.characterId ||
    link.userId !== author.id ||
    value.vitals !== undefined ||
    (value.shared &&
      (!validSealed(value.sealed) ||
        value.sealed.some((box) => !game.users.get(box.userId)?.isGM)))
  )
    return null;
  return {
    ...value,
    userId: author.id,
    userName: author.name,
    messageId: message.id,
    active: author.active && now - value.updatedAt < 45000,
  };
}
export function createStatusSharing({ link, privacy, changed = () => {} }) {
  const party = new Map();
  let snapshot,
    messageId,
    lastSent = 0,
    signature = "",
    inFlight;
  function ingest(message) {
    if (!game.user.isGM && message.author?.id !== game.user.id) return;
    const value = partyRecord(message);
    if (!value) return;
    const key = `${value.userId}:${value.characterId}`,
      previous = party.get(key);
    if (previous && previous.updatedAt > value.updatedAt) return;
    if (value.shared) {
      const vitals = privacy.open(value, value.userId);
      if (vitals) party.set(key, { ...value, vitals });
      else party.delete(key);
    } else party.delete(key);
    changed();
  }
  async function publish() {
    const characterSnapshot = snapshot,
      actor = link.actor(),
      state = characterSnapshot?.tabletop;
    if (!state || !actor || !game.socket?.connected) return;
    const next = JSON.stringify({
      actor: actor.id,
      id: state.characterId,
      share: state.share,
      vitals: state.share ? state.vitals : null,
    });
    if (next === signature && Date.now() - lastSent < 15000) return;
    const whisper = [
      ...new Set([
        game.user.id,
        ...game.users.filter((u) => u.isGM).map((u) => u.id),
      ]),
    ];
    const payload = {
      characterId: state.characterId,
      character: characterSnapshot.character,
      actorId: actor.id,
      shared: state.share,
      updatedAt: Date.now(),
    };
    payload.sealed = state.share ? privacy.seal(state.vitals, payload) : [];
    if (state.share && !payload.sealed.length) return; // Wait for a GM key; never fall back to plaintext.
    let message = messageId ? game.messages?.get(messageId) : null;
    if (!message)
      message = game.messages?.contents?.findLast(
        (m) =>
          m.author?.id === game.user.id &&
          m.flags?.[MODULE]?.party?.characterId === state.characterId,
      );
    if (!state.share && !message) {
      signature = next;
      lastSent = Date.now();
      return;
    }
    if (message && message.author?.id === game.user.id) {
      await message.update({
        whisper,
        [`flags.${MODULE}.party`]: payload,
        ...(message.flags?.[MODULE]?.party?.vitals !== undefined
          ? { [`flags.${MODULE}.party.-=vitals`]: null }
          : {}),
      });
    } else {
      message = await foundry.documents.ChatMessage.create({
        content: "<p>Sheetshift · private Statusfreigabe</p>",
        whisper,
        flags: { [MODULE]: { party: payload } },
      });
    }
    if (snapshot === characterSnapshot) {
      messageId = message.id;
      signature = next;
      lastSent = Date.now();
    }
    ingest(message);
  }
  return {
    snapshot(value) {
      if (snapshot?.tabletop?.characterId !== value?.tabletop?.characterId) {
        messageId = undefined;
        signature = "";
      }
      snapshot = value;
    },
    tick() {
      if (!inFlight)
        inFlight = publish()
          .catch((error) => {
            console.warn("Sheetshift status sharing:", error?.message);
          })
          .finally(() => {
            inFlight = undefined;
          });
      return inFlight;
    },
    ingest,
    records() {
      return [...party.values()]
        .filter((row) => partyRecord(game.messages?.get(row.messageId)))
        .map((row) => ({
          ...row,
          active: Boolean(
            game.users.get(row.userId)?.active &&
              Date.now() - row.updatedAt < 45000,
          ),
        }));
    },
    remove(message) {
      for (const [key, row] of party)
        if (row.messageId === message.id) party.delete(key);
      changed();
    },
    clear() {
      snapshot = undefined;
    },
  };
}
