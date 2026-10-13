import { tokenByUuid } from "./map-actions.mjs";
// Asset identifiers are fixed presets, resolved only from the installed JB2A database.
const PRESETS = {
  shadow: ["jb2a.darkness", "jb2a.dark_impact"],
  heal: ["jb2a.healing_generic", "jb2a.healing_word"],
  shield: ["jb2a.shield"],
  fire: ["jb2a.fire_bolt", "jb2a.fireball"],
  lightning: ["jb2a.chain_lightning", "jb2a.lightning_bolt"],
  slash: ["jb2a.melee_generic.slash", "jb2a.slash"],
};
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
) {
  if (!database) return null;
  for (const prefix of PRESETS[preset] || []) {
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
    profile.animation === "none" ||
    !request.map ||
    request.kind === "attack"
  )
    return;
  const modules = optionalModules();
  if (!modules.sequencer || !modules.jb2a) return;
  const file = animationAsset(profile.animation, undefined, profile.color),
    source = tokenByUuid(request.map.source);
  if (!file || !source) return;
  const targets = request.map.targets
    .map((t) => tokenByUuid(t.uuid))
    .filter(Boolean);
  const locations = request.map.area
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
      ["fire", "lightning"].includes(profile.animation) &&
      target !== source &&
      !request.map.area
    )
      effect = effect.atLocation(source).stretchTo(target);
    else
      effect = request.map.area ? effect.scale(1) : effect.scaleToObject(1.4);
  }
  await sequence.play();
}
