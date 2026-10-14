import test from "node:test";
import assert from "node:assert/strict";
import {
  createTokenLink,
  MODULE,
} from "../token-link.mjs";
import {
  validProfile,
  validMapContext,
  validVitals,
  defaultProfile,
} from "../tabletop-model.mjs";
import {
  partyRecord,
  createStatusSharing,
} from "../status-sharing.mjs";
import {
  createMapActions,
  mapContext,
  areaPoints,
  contextAvailable,
  distance,
} from "../map-actions.mjs";
import {
  createCombatCompanion,
  endTurnRequest,
} from "../combat-companion.mjs";
import { createRequestTracker } from "../gm-dashboard.mjs";
import {
  animationAsset,
  playAnimation,
} from "../animations.mjs";
import { createPrivateStatus } from "../private-status.mjs";
import { ANIMATION_PRESETS } from "../animation-presets.mjs";
import {
  statusKeyPair,
  sealStatus,
  openStatus,
} from "../private-status-crypto.mjs";
const id = "a".repeat(32),
  vitals = {
    health: { current: 35, max: 50 },
    resources: [{ label: "Energie", current: 20, max: 30 }],
    conditions: [{ label: "Brennend", duration: "2 Runden" }],
  };
function fixture() {
  const player = { id: "player", name: "Lyren", active: true },
    gm = { id: "gm", name: "GM", isGM: true, active: true },
    other = { id: "other", name: "Other", active: true };
  const pair = statusKeyPair();
  gm.getFlag = () => pair.publicKey;
  gm.setFlag = async (_m, _k, v) => {
    pair.publicKey = v;
  };
  const saved = new Map();
  const storage = {
    getItem: (k) => saved.get(k) || null,
    setItem: (k, v) => saved.set(k, v),
  };
  const users = [player, gm, other];
  users.get = (id) => users.find((u) => u.id === id);
  let flag,
    settings = {};
  const writes = [];
  const actor = {
    id: "actor",
    name: "Lyren",
    testUserPermission: (u) => u?.id === "player" || u?.isGM,
    getFlag: () => flag,
    setFlag: async (_module, key, value) => {
      writes.push({ key, value });
      flag = value;
    },
    unsetFlag: async () => {
      flag = undefined;
    },
  };
  const actors = new Map([
    ["actor", actor],
    [
      "npc",
      { id: "npc", testUserPermission: () => false, getFlag: () => null },
    ],
  ]);
  actors.contents = [...actors.values()];
  const source = {
    id: "token",
    name: "Lyren",
    actor,
    visible: true,
    document: { actorId: "actor", uuid: "Scene.scene.Token.token" },
    center: { x: 50, y: 50 },
  };
  const target = {
    id: "enemy",
    name: "Enemy",
    actor: {},
    visible: true,
    document: { actorId: "enemyActor", uuid: "Scene.scene.Token.enemy" },
    center: { x: 150, y: 50 },
  };
  globalThis.canvas = {
    tokens: { controlled: [source], placeables: [source, target] },
    grid: { measurePath: () => ({ distance: 5 }) },
  };
  globalThis.game = {
    world: { id: "world" },
    user: player,
    users,
    actors,
    socket: { connected: true },
    modules: new Map(),
    settings: {
      get: () => settings,
      set: async (_m, _key, value) => {
        settings = value;
      },
    },
    messages: new Map(),
  };
  game.messages.contents = [];
  globalThis.ui = { notifications: { info() {}, warn() {} } };
  const creates = [];
  globalThis.foundry = {
    documents: {
      ChatMessage: {
        create: async (data) => {
          creates.push(data);
          const m = {
            ...data,
            id: `msg${creates.length}`,
            author: player,
            update: async (update) => {
              Object.assign(m, { whisper: update.whisper });
              m.flags[MODULE].party = update[`flags.${MODULE}.party`];
            },
          };
          game.messages.set(m.id, m);
          game.messages.contents.push(m);
          return m;
        },
      },
    },
  };
  const link = createTokenLink();
  link.snapshot({
    character: "Lyren",
    tabletop: { characterId: id, share: true, audience: "gm", vitals },
  });
  return {
    player,
    gm,
    other,
    actor,
    source,
    target,
    link,
    writes,
    creates,
    privacy: createPrivateStatus({ storage }),
  };
}
test("token binding requires ownership and cannot replace another character link", async () => {
  const f = fixture();
  await assert.rejects(f.link.bind("npc"));
  await f.link.bind("actor");
  assert.equal(f.link.actor(), f.actor);
  assert.equal(f.link.token(), f.source);
  await f.actor.setFlag(MODULE, "link", {
    characterId: "b".repeat(32),
    userId: f.player.id,
  });
  await assert.rejects(f.link.bind("actor"), /bereits/);
  assert.ok(
    f.writes.every((w) => w.key === "link"),
    "only identity flag, never HP/resource actor data",
  );
});
test("GM sharing whispers exact values only to author and GMs and revocation removes values", async () => {
  const f = fixture();
  await f.link.bind("actor");
  game.user = f.gm;
  await f.privacy.init();
  game.user = f.player;
  const sharing = createStatusSharing({ link: f.link, privacy: f.privacy });
  sharing.snapshot({
    character: "Lyren",
    tabletop: { characterId: id, share: true, audience: "gm", vitals },
  });
  await sharing.tick();
  assert.deepEqual(f.creates[0].whisper, ["player", "gm"]);
  assert.ok(partyRecord(game.messages.contents[0]));
  assert.equal(
    JSON.stringify(f.creates[0]).includes("Energie"),
    false,
    "chat flags contain ciphertext, never exact status",
  );
  game.user = f.gm;
  sharing.ingest(game.messages.contents[0]);
  assert.equal(sharing.records().length, 1);
  game.user = f.player;
  sharing.snapshot({
    character: "Lyren",
    tabletop: { characterId: id, share: false, audience: "gm", vitals },
  });
  await sharing.tick();
  assert.equal(game.messages.contents[0].flags[MODULE].party.vitals, undefined);
  assert.equal(sharing.records().length, 0);
  assert.equal(
    f.creates.length,
    1,
    "reuse private record instead of chat spam",
  );
});
test("status records reject public recipients, forged identities and lost ownership", async () => {
  const f = fixture();
  await f.link.bind("actor");
  const data = {
    characterId: id,
    character: "Lyren",
    actorId: "actor",
    shared: true,
    updatedAt: Date.now(),
  };
  data.sealed = f.privacy.seal(vitals, data);
  const m = {
    id: "msg",
    author: f.player,
    whisper: ["player", "gm"],
    flags: { [MODULE]: { party: data } },
  };
  assert.ok(partyRecord(m));
  assert.equal(partyRecord({ ...m, whisper: ["player", "gm", "other"] }), null);
  assert.equal(partyRecord({ ...m, author: f.other }), null);
  await f.link.unbind();
  assert.equal(partyRecord(m), null);
});
test("map actions require the linked owned source and preserve explicit targets and scene distance", async () => {
  const f = fixture();
  await f.link.bind("actor");
  game.user.targets = new Set([f.target]);
  const context = mapContext(f.link, {
    ...defaultProfile("weapon"),
    target: "target",
  });
  assert.equal(context.targets[0].uuid, f.target.document.uuid);
  assert.ok(contextAvailable(f.link, context));
  assert.equal(distance(f.source, f.target), 5);
  canvas.tokens.controlled = [f.target];
  assert.throws(() => mapContext(f.link, defaultProfile("weapon")));
  f.target.visible = false;
  assert.equal(contextAvailable(f.link, context), false);
});
test("profiles, map metadata and private vitals reject unbounded or executable inputs", () => {
  assert.ok(validProfile(defaultProfile("ability")));
  assert.equal(
    validProfile({ ...defaultProfile("ability"), animation: "run(script)" }),
    false,
  );
  assert.equal(
    validProfile({ ...defaultProfile("ability"), size: Infinity }),
    false,
  );
  assert.ok(validVitals(vitals));
  assert.equal(
    validVitals({ ...vitals, health: { current: 51, max: 50 } }),
    false,
  );
  assert.equal(
    validMapContext({ actorId: "actor", source: "Actor.secret", targets: [] }),
    false,
  );
  const points = areaPoints("ray", { x: 0, y: 0 }, { x: 100, y: 0 }, 100, 20);
  assert.deepEqual(points, [
    { x: 0, y: -10 },
    { x: 100, y: -10 },
    { x: 100, y: 10 },
    { x: 0, y: 10 },
  ]);
  assert.equal(
    areaPoints("circle", { x: 0, y: 0 }, { x: 50, y: 50 }, 10, 20).length,
    49,
  );
});
test("end turn is requested privately and only the GM can explicitly advance the matching turn", async () => {
  const f = fixture();
  await f.link.bind("actor");
  let advances = 0;
  game.combat = {
    id: "combat",
    started: true,
    round: 1,
    turn: 0,
    combatant: { id: "combatant", actorId: "actor", actor: f.actor },
    canUserModify: (u) => u.isGM,
    nextTurn: async () => {
      advances++;
    },
  };
  const combat = createCombatCompanion({ link: f.link });
  await combat.finish();
  assert.equal(advances, 0);
  const message = { ...f.creates[0], author: f.player };
  assert.ok(endTurnRequest(message, f.player));
  assert.equal(endTurnRequest(message, f.other), null);
  game.user = f.gm;
  combat.ingest(message, f.player);
  await combat.confirm(message.flags[MODULE].endTurn.id);
  assert.equal(advances, 1);
  await assert.rejects(combat.confirm(message.flags[MODULE].endTurn.id));
});
test("request tracking uses real GM and player authors and rejects unrelated rolls", () => {
  const f = fixture(),
    tracker = createRequestTracker(),
    check = {
      id,
      kind: "free",
      label: "Luck",
      formula: "1d100",
      targets: ["player"],
      expires: Date.now() + 120000,
    };
  tracker.ingest(
    { author: f.gm, whisper: ["player", "gm"], flags: { [MODULE]: { check } } },
    f.gm,
  );
  tracker.ingest(
    {
      author: f.player,
      rolls: [{ total: 42 }],
      flags: { [MODULE]: { checkId: id, requestId: "b".repeat(32) } },
    },
    f.other,
  );
  assert.equal(tracker.rows()[0].targets[0].status, "wartet");
  tracker.ingest(
    {
      author: f.player,
      rolls: [{ total: 42 }],
      flags: { [MODULE]: { checkId: id, requestId: "b".repeat(32) } },
    },
    f.player,
  );
  assert.equal(tracker.rows()[0].targets[0].result.total, 42);
});
test("animations accept fixed installed presets and stay optional", async () => {
  fixture();
  assert.equal(
    animationAsset("evil", {
      entryExists: () => true,
      getPathsUnder: () => ["https://evil"],
    }),
    null,
  );
  assert.equal(
    animationAsset("heal", {
      entryExists: () => true,
      getPathsUnder: () => ["jb2a.healing_generic.blue", "https://evil"],
    }),
    "jb2a.healing_generic.blue",
  );
  await playAnimation({
    kind: "ability",
    profile: { ...defaultProfile("ability"), animation: "heal" },
    map: { source: "Scene.scene.Token.token", targets: [] },
  });
});

test("animation presets place projectiles, bursts, ground effects and self effects without moving tokens", async () => {
  const f = fixture();
  const [source, target] = canvas.tokens.placeables;
  // Only a fake installed database and Sequencer effect surface: document movement is forbidden.
  let moved = 0;
  source.document.update = async () => { moved++; };
  const effects = [];
  let plays = 0;
  game.modules = new Map([["sequencer", { active: true }], ["JB2A_DnD5e", { active: true }]]);
  globalThis.Sequencer = { Database: {
    entryExists: () => true,
    getPathsUnder: prefix => [`${prefix}.blue`],
  } };
  globalThis.Sequence = class {
    effect() {
      const calls = {};
      effects.push(calls);
      const effect = new Proxy({}, { get(_target, method) { return (...args) => { calls[method] = args; return effect; }; } });
      return effect;
    }
    async play() { plays++; }
  };
  const context = { source: source.document.uuid, targets: [{ uuid: target.document.uuid, label: "Enemy" }] };
  const run = async animation => {
    effects.length = 0;
    await playAnimation({ kind: "ability", profile: { ...defaultProfile("ability"), animation }, map: context });
    return effects[0];
  };
  try {
    const missile = await run("missile");
    assert.deepEqual(missile.atLocation, [source]);
    assert.deepEqual(missile.stretchTo, [target]);
    const explosion = await run("fireball");
    assert.deepEqual(explosion.atLocation, [target]);
    assert.equal(explosion.stretchTo, undefined, "explosions must not stretch like projectiles");
    const circle = await run("circle");
    assert.deepEqual(circle.belowTokens, []);
    const mist = await run("mist");
    assert.deepEqual(mist.atLocation, [source], "self effects ignore marked enemies");
    assert.equal(mist.stretchTo, undefined);
    assert.equal(moved, 0);
    await playAnimation({ kind: "attack", profile: { ...defaultProfile("weapon"), animation: "arrow" }, map: context });
    assert.equal(plays, 4, "attack checks do not announce unconfirmed damage effects");
    globalThis.Sequencer.Database.entryExists = () => false;
    await run("ice");
    assert.equal(plays, 4, "missing assets are optional and do not play an invalid file");
    assert.equal(animationAsset("https://example.test/macro", globalThis.Sequencer.Database), null);
    assert.equal(Object.keys(ANIMATION_PRESETS).length - 1, 29);
  } finally {
    delete globalThis.Sequence;
    delete globalThis.Sequencer;
  }
});

test("status encryption needs the GM private key and authenticates the whole context", () => {
  const gm = statusKeyPair(),
    other = statusKeyPair(),
    context = "world/player/character/actor/time/gm";
  const sealed = sealStatus(vitals, gm.publicKey, context);
  assert.deepEqual(openStatus(sealed, gm.secret, context), vitals);
  assert.throws(() => openStatus(sealed, other.secret, context));
  assert.throws(() => openStatus(sealed, gm.secret, "changed-author"));
  assert.throws(() =>
    openStatus(
      {
        ...sealed,
        data:
          sealed.data.slice(0, -2) +
          (parseInt(sealed.data.slice(-2), 16) ^ 1)
            .toString(16)
            .padStart(2, "0"),
      },
      gm.secret,
      context,
    ),
  );
});

test("area placement uses scene units and removes only its local drawing and listeners", async () => {
  const f = fixture();
  await f.link.bind("actor");
  const events = new Map(),
    keys = new Map();
  let destroyed = 0;
  const circles = [];
  globalThis.window = {
    addEventListener: (n, fn) => keys.set(n, fn),
    removeEventListener: (n) => keys.delete(n),
  };
  globalThis.PIXI = {
    Graphics: class {
      clear() {}
      lineStyle() {}
      drawCircle(x, y, r) {
        circles.push(r);
      }
      beginFill() {}
      drawPolygon() {}
      endFill() {}
      destroy() {
        destroyed++;
      }
    },
  };
  canvas.stage = {
    addChild: (x) => x,
    on: (n, fn) => events.set(n, fn),
    off: (n) => events.delete(n),
  };
  canvas.grid = { size: 100, distance: 5, units: "m" };
  const blocks = [];
  globalThis.document = {
    createElement: () => ({
      children: [],
      append(...c) {
        this.children.push(...c);
      },
      insertAdjacentHTML() {},
    }),
  };
  const action = {
    kind: "ability",
    profile: {
      ...defaultProfile("ability"),
      shape: "circle",
      size: 10,
      range: 20,
    },
  };
  const maps = createMapActions({ link: f.link });
  let chosen;
  maps.preview(
    { append: (b) => blocks.push(b) },
    action,
    mapContext(f.link, action.profile),
    (c) => (chosen = c),
  );
  const button = blocks[0].children.find((c) => c.onclick);
  assert.ok(button.textContent.includes("10 m"));
  button.onclick();
  events.get("pointerdown")({
    button: 0,
    getLocalPosition: () => ({ x: 200, y: 300 }),
    stopPropagation() {},
  });
  assert.deepEqual(
    {
      ...chosen.area,
      id: undefined,
      direction: Math.round(chosen.area.direction * 100) / 100,
    },
    {
      id: undefined,
      shape: "circle",
      size: 10,
      x: 200,
      y: 300,
      direction: 59.04,
    },
  );
  assert.ok(
    circles.every((r) => r === 400),
    "20 scene units become 400 pixels on this grid",
  );
  assert.equal(events.size, 0);
  assert.equal(keys.size, 0);
  maps.clear();
  assert.equal(destroyed, 1);
  assert.equal(
    f.writes.length,
    1,
    "placement does not write actor, token, region, or condition documents",
  );
  delete globalThis.PIXI;
});
