import { isId } from "./protocol.mjs";
export const MODULE = "sheetshift-bridge";
export function owns(actor, user = game.user) {
  return Boolean(
    actor &&
      (actor.testUserPermission
        ? actor.testUserPermission(user, "OWNER")
        : actor.isOwner && user.id === game.user.id),
  );
}
export function createTokenLink({ changed = () => {} } = {}) {
  let snapshot;
  function records() {
    const value = game.settings.get(MODULE, "tokenLinks");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }
  function characterId() {
    return snapshot?.tabletop?.characterId;
  }
  function actor() {
    const id = characterId(),
      record = id ? records()[id] : null;
    const value = record
      ? game.actors?.get(record.actorId)
      : (game.actors?.contents || []).find((a) => {
          const flag = a.getFlag(MODULE, "link");
          return flag?.characterId === id && flag.userId === game.user.id;
        });
    const link = value?.getFlag(MODULE, "link");
    return value &&
      owns(value) &&
      link?.characterId === id &&
      link.userId === game.user.id
      ? value
      : null;
  }
  function token() {
    const bound = actor();
    if (!bound) return null;
    const matches = (globalThis.canvas?.tokens?.controlled || []).filter(
      (t) =>
        t.document.actorId === bound.id && owns(t.actor) && t.visible !== false,
    );
    return matches.length === 1 ? matches[0] : null;
  }
  return {
    snapshot(value) {
      snapshot = value;
    },
    actor,
    token,
    characterId,
    choices: () => (game.actors?.contents || []).filter((a) => owns(a)),
    async bind(actorId) {
      const id = characterId(),
        value = game.actors?.get(actorId);
      if (!isId(id) || !owns(value))
        throw new Error(
          "Bitte einen eigenen Actor und einen verbundenen Bogen auswählen.",
        );
      const bound = actor();
      if (bound && bound.id !== value.id)
        throw new Error("Die bestehende Actor-Verknüpfung zuerst lösen.");
      const previous = value.getFlag(MODULE, "link");
      if (
        previous &&
        (previous.characterId !== id || previous.userId !== game.user.id)
      )
        throw new Error(
          "Dieser Actor ist bereits verknüpft. Die bestehende Verknüpfung zuerst in deren Bogen lösen.",
        );
      await value.setFlag(MODULE, "link", {
        characterId: id,
        userId: game.user.id,
        character: snapshot.character,
      });
      await game.settings.set(MODULE, "tokenLinks", {
        ...records(),
        [id]: { actorId: value.id },
      });
      changed();
    },
    async unbind() {
      const id = characterId(),
        value = actor(),
        next = { ...records() };
      if (value) await value.unsetFlag(MODULE, "link");
      delete next[id];
      await game.settings.set(MODULE, "tokenLinks", next);
      changed();
    },
    ownsContext(context) {
      const source = (globalThis.canvas?.tokens?.placeables || []).find(
        (t) => t.document.uuid === context?.source,
      );
      return Boolean(
        source &&
          owns(source.actor) &&
          source.document.actorId === context.actorId &&
          actor()?.id === context.actorId,
      );
    },
  };
}
