import { MODULE, owns } from "./token-link.mjs";
import { randomId, isId, isText, escapeHtml as esc } from "./protocol.mjs";
export function currentTurn(link) {
  const combat = game.combat,
    actor = link.actor(),
    combatant = combat?.combatant;
  return combat?.started && actor && combatant?.actorId === actor.id
    ? {
        combat,
        combatant,
        key: `${combat.id}:${combat.round}:${combat.turn}:${combatant.id}`,
      }
    : null;
}
export function endTurnRequest(message, initiator) {
  const r = message?.flags?.[MODULE]?.endTurn,
    combat = game.combat;
  if (
    !r ||
    !initiator ||
    message.author?.id !== initiator.id ||
    !isId(r.id) ||
    !isText(r.combatId) ||
    !isText(r.combatantId) ||
    !Number.isSafeInteger(r.round) ||
    !Number.isSafeInteger(r.turn) ||
    !Number.isSafeInteger(r.expires) ||
    r.expires < Date.now() ||
    r.expires > Date.now() + 120000 ||
    !message.whisper?.includes(initiator.id) ||
    message.whisper.some(
      (id) => id !== initiator.id && !game.users.get(id)?.isGM,
    )
  )
    return null;
  const current = combat?.combatant;
  if (
    combat?.id !== r.combatId ||
    combat.round !== r.round ||
    combat.turn !== r.turn ||
    current?.id !== r.combatantId ||
    !owns(current.actor, initiator)
  )
    return null;
  return { ...r, player: initiator.name, userId: initiator.id };
}
export function createCombatCompanion({ link, changed = () => {} }) {
  let announced = "",
    requested = "",
    sending = false;
  const requests = new Map();
  return {
    turn: () => currentTurn(link),
    tick() {
      const turn = currentTurn(link);
      if (turn?.key && turn.key !== announced) {
        announced = turn.key;
        ui.notifications.info("Du bist dran · Sheetshift-Aktionen bereit.");
        changed();
      }
      if (!turn && announced) {
        announced = "";
        changed();
      }
    },
    async finish() {
      if (sending) throw new Error("Anfrage wird gesendet.");
      sending = true;
      try {
        const turn = currentTurn(link);
        if (!turn) throw new Error("Dein verknüpfter Actor ist nicht am Zug.");
        // Advancing initiative always requires an explicit click; no mechanical effects run here.
        if (game.user.isGM && turn.combat.canUserModify(game.user, "update"))
          return turn.combat.nextTurn();
        if (requested === turn.key)
          throw new Error("Der GM hat bereits deine Anfrage für diesen Zug.");
        const check = {
          id: randomId(),
          combatId: turn.combat.id,
          combatantId: turn.combatant.id,
          round: turn.combat.round,
          turn: turn.combat.turn,
          expires: Date.now() + 120000,
        };
        const whisper = [
          game.user.id,
          ...game.users.filter((u) => u.isGM).map((u) => u.id),
        ];
        const message = await foundry.documents.ChatMessage.create({
          content: `<p>${esc(game.user.name)}: Zug beenden · GM-Bestätigung erforderlich.</p>`,
          whisper,
          flags: { [MODULE]: { endTurn: check } },
        });
        if (!message?.id)
          throw new Error("Anfrage konnte nicht gesendet werden.");
        requested = turn.key;
        ui.notifications.info("Zugende beim GM angefragt.");
      } finally {
        sending = false;
      }
    },
    ingest(message, user) {
      const request = endTurnRequest(message, user);
      if (game.user.isGM && request) {
        requests.set(request.id, request);
        ui.notifications.info(
          `${request.player}: Zugende angefragt · Gruppe & Proben öffnen.`,
        );
        changed();
      }
    },
    requests() {
      return [...requests.values()].filter(
        (r) =>
          r.expires >= Date.now() &&
          game.combat?.id === r.combatId &&
          game.combat?.round === r.round &&
          game.combat?.turn === r.turn &&
          game.combat?.combatant?.id === r.combatantId,
      );
    },
    async confirm(id) {
      const r = requests.get(id),
        combat = game.combat;
      if (
        !game.user.isGM ||
        !r ||
        !this.requests().some((v) => v.id === id) ||
        !combat?.canUserModify(game.user, "update") ||
        !owns(combat.combatant.actor, game.users.get(r.userId))
      )
        throw new Error("Zugende nicht mehr gültig oder nicht erlaubt.");
      requests.delete(id);
      await combat.nextTurn();
      changed();
    },
  };
}
