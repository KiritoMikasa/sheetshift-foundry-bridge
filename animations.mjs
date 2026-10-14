import { tokenByUuid } from "./map-actions.mjs";
import { ANIMATION_PRESETS, TOKEN_EFFECT_PRESETS } from "./animation-presets.mjs";
// Asset identifiers are fixed presets, resolved only from the installed JB2A database.
export function optionalModules() {
  return {
    sequencer: Boolean(
      game.modules.get("sequencer")?.active &&
        globalThis.Sequence &&
        globalThis.Sequencer?.Database,
    ),
    jb2a: Boolean(
      game.modules.get("JB2A_DnD5e")?.active ||
        game.modules.get("jb2a_patreon")?.active,
    ),
    dice: Boolean(game.modules.get("dice-so-nice")?.active),
    ambience: Boolean(game.modules.get("fxmaster")?.active),
  };
}
export function animationAsset(
  preset,
  database = globalThis.Sequencer?.Database,
  color,
  presets = ANIMATION_PRESETS,
) {
  if (!database) return null;
  for (const prefix of presets[preset]?.paths || []) {
    if (!database.entryExists(prefix)) continue;
    const paths = database.getPathsUnder(prefix, { fullyQualified: true });
    const candidates =
      paths?.filter((p) => p === prefix || p.startsWith(`${prefix}.`)).sort() ||
      [];
    const shade = {
      violet: "purple",
      blue: "blue",
      red: "red",
      green: "green",
      gold: "yellow",
    }[color];
    const path =
      candidates.find((p) => shade && p.split(".").includes(shade)) ||
      candidates[0];
    if (path) return path;
  }
  return null;
}
export async function playAnimation(request) {
  const profile = request.profile;
  if (
    !profile ||
    request.mode?.active === false ||
    profile.animation === "none" ||
    !request.map ||
    request.kind === "attack"
  )
    return;
  const modules = optionalModules();
  if (!modules.sequencer || !modules.jb2a) return;
  const preset = ANIMATION_PRESETS[profile.animation];
  if (!preset) return;
  const file = animationAsset(profile.animation, undefined, profile.color),
    source = tokenByUuid(request.map.source);
  if (!file || !source) return;
  const targets = request.map.targets
    .map((t) => tokenByUuid(t.uuid))
    .filter(Boolean);
  const locations = preset.mode === "self" ? [source] : request.map.area
    ? [{ x: request.map.area.x, y: request.map.area.y }]
    : targets.length
      ? targets
      : [source];
  const sequence = new Sequence();
  for (const target of locations) {
    let effect = sequence
      .effect()
      .file(file)
      .atLocation(target)
      .duration(1800)
      .fadeIn(150)
      .fadeOut(300)
      .volume(profile.sound ? 0.35 : 0);
    if (
      preset.mode === "projectile" &&
      target !== source &&
      !request.map.area
    )
      effect = effect.atLocation(source).stretchTo(target);
    else
      effect = request.map.area && preset.mode !== "self" ? effect.scale(1) : effect.scaleToObject(1.4);
    if (preset.mode === "ground") effect.belowTokens();
  }
  await sequence.play();
}

export const tokenEffectAsset = (preset, database, color) => animationAsset(preset, database, color, TOKEN_EFFECT_PRESETS);
