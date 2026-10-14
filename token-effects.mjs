import { optionalModules, tokenEffectAsset } from "./animations.mjs";
import { TOKEN_EFFECT_PRESETS } from "./animation-presets.mjs";
import { owns } from "./token-link.mjs";
const hex = value => Array.from(new TextEncoder().encode(value), b => b.toString(16).padStart(2, "0")).join("");

// Reconcile only this Foundry user's named Sheetshift effects, never another module's effects.
export function createTokenEffects({ link, getSnapshot }) {
  let running = false;
  const origin = `sheetshift-modes:${hex(`${game.world.id}:${game.user.id}`)}`;
  const scenes = new Set();
  const starting = new Set();
  try {
    const saved = JSON.parse(globalThis.window?.localStorage?.getItem(`${origin}:scenes`) || "[]");
    if (Array.isArray(saved)) for (const id of saved.slice(0, 1000))
      if (typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)) scenes.add(id);
  } catch { /* Current-scene cleanup still works without local storage. */ }
  return {
    async sync() {
      const snapshot = getSnapshot();
      if (running || !snapshot?.tabletop || !globalThis.canvas?.ready) return;
      const modules = optionalModules(), manager = globalThis.Sequencer?.EffectManager;
      if (!modules.sequencer || !manager?.getEffects || !manager?.endEffects) return;
      running = true;
      try {
        const actor = link.actor(), desired = new Map();
        const sceneId = canvas.scene?.id || canvas.tokens?.placeables?.[0]?.document.uuid?.split(".")[1];
        if (typeof sceneId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(sceneId) && !scenes.has(sceneId)) {
          scenes.add(sceneId);
          try { globalThis.window?.localStorage?.setItem(`${origin}:scenes`, JSON.stringify([...scenes])); } catch { /* Cosmetic preference only. */ }
        }
        const tokens = (canvas.tokens?.placeables || []).filter(token => actor && token.document.actorId === actor.id && owns(token.actor) && token.visible !== false && (!token.document.hidden || game.user.isGM));
        for (const action of snapshot.actions || []) {
          if (!modules.jb2a || !action.toggle || !action.active || !action.toggleKey) continue;
          const preset = TOKEN_EFFECT_PRESETS[action.profile?.tokenEffect];
          if (!preset || !preset.paths.length) continue;
          const file = tokenEffectAsset(action.profile.tokenEffect, undefined, action.profile.color);
          if (!file) continue;
          for (const token of tokens) {
            const name = `sheetshift-mode-${hex(`${snapshot.tabletop.characterId}:${action.toggleKey}:${token.document.uuid}:${file}`)}`;
            desired.set(name, { token, preset, file });
          }
        }
        const effects = [...scenes].flatMap(sceneId => manager.getEffects({ origin, sceneId }).map(effect => ({ effect, sceneId })));
        if (!scenes.size) effects.push(...manager.getEffects({ origin }).map(effect => ({ effect })));
        const current = new Set();
        const seen = new Set();
        for (const {effect, sceneId} of effects) {
          if (seen.has(effect)) continue;
          seen.add(effect);
          const name = effect.data?.name;
          if (typeof name !== "string" || !name.startsWith("sheetshift-mode-")) continue;
          if (!desired.has(name) || current.has(name))
            await manager.endEffects({ effects: [effect], origin, ...(sceneId ? { sceneId } : {}) });
          else { current.add(name); starting.delete(name); }
        }
        for (const name of starting) if (!desired.has(name)) starting.delete(name);
        for (const [name, {token, preset, file}] of desired) {
          if (current.has(name) || starting.has(name)) continue;
          const sequence = new Sequence();
          const effect = sequence.effect().file(file).attachTo(token).scaleToObject(1.5)
            .name(name).origin(origin).persist(true, { persistTokenPrototype: false }).fadeIn(200).fadeOut(250).volume(0);
          if (preset.below) effect.belowTokens();
          // Do not await the lifetime of an indefinite effect: deactivation must remain possible.
          starting.add(name);
          void Promise.resolve().then(() => sequence.play()).catch(error => {
            starting.delete(name);
            console.warn("Sheetshift token effect:", error?.message);
          });
        }
      } finally { running = false; }
    },
  };
}
