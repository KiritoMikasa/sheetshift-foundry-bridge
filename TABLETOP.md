# Foundry tabletop companion (0.4.1)

Sheetshift Bridge 0.4.1 includes the tabletop companion. Deploy the matching Sheetshift update before updating the module in Foundry.

The companion targets Foundry v14 with owned actors/tokens, including Simple World-Building. Sheetshift remains the source of truth. Existing talent, d100 attack, confirmed damage, free abilities and GM free-roll requests remain available without token linking or animation add-ons.

Attack checks use **1d100 ≤ weapon Hit**: a roll of 60 hits a 60% weapon. This correction requires Sheetshift Bridge **0.4.1** and the matching Sheetshift update.

## Set it up

1. Deploy the matching Sheetshift update.
2. Between sessions, in Foundry **Setup → Add-on Modules**, update **Sheetshift Bridge** to **0.4.1**. Relaunch the existing world and reload everyone's browser. The existing manifest URL and Sheetshift address stay the same; no new port, domain or Pangolin exception is needed.
3. The GM joins once in their usual browser. The module automatically creates a local status-decryption key and publishes its public key to the GM's Foundry user. Keep browser storage enabled. Use one browser/profile per GM user during this first version; changing browser/profile publishes a new public key, and connected players refresh their encrypted status within about 15 seconds. Clearing storage loses the old decryption key, but fresh updates restore the current view.
4. Each player joins as their own Foundry user, clicks **Sheetshift öffnen**, signs in and accepts the connection.
5. In **Sheetshift-Aktionen → Actor verknüpfen**, choose the Foundry actor you own and confirm. The bridge refuses NPCs you do not own and actors linked to another sheet/user. Select exactly one token belonging to that actor on the map for targeted actions. To switch actors, first explicitly unlink the existing one.
6. In Sheetshift **Foundry-Aktionen**, star favourite weapons, abilities and talents. Under each weapon/ability's **Kartenaktion & Animation**, choose its icon, optional animation, target mode, range and area size. Leave animation/area/target off to keep ordinary actions simple.
7. Optional: in **Token-Status & Freigabe**, enable **HP, Ressourcen und Zustände nur mit dem GM teilen**. Sharing starts off. Your own HUD and token status work without sharing. The GM opens **Gruppe & Proben** to see voluntary shares and requested-roll progress.

## Playing from the map

- The movable, collapsible HUD groups **Angriffe**, **Fähigkeiten**, and **Talente**, with icons and costs. Its header displays your saved HP/resources and temporary effects. Edit these in Sheetshift; they refresh in Foundry.
- **Markierte Ziele** uses Foundry's normal target tool. The confirmation shows target portraits/names and grid distance in the scene's configured units. Target choices are captured when opening the action. Reopen the action to change them. A successful weapon attack keeps its own target for the later damage roll, including when two same-name weapons are used.
- Range is a visual ring plus a distance warning. It does not resolve walls, elevation, line of sight, defence, or whether an attack is legal.
- For an area, configure a positive size, click **Fläche platzieren**, move the cursor and click the map. Escape cancels placement. A circle's size is its radius; a rectangle's size is its side length; cones use a 60° angle and configured length; lines use the configured length and one grid-cell width. Area previews are private local drawings, removed on back/confirmation/disconnection/scene changes. They create no scene Regions or permanent records, apply no damage, and do not select affected targets automatically.
- Ability animations play after the public card exists. Weapon animations play on confirmed damage, rather than treating a successful hit check as a resolved defence. A missing asset or animation failure cannot invalidate an already posted card, charge again, or reroll dice.
- Exact token HP/resources and condition badges are visible locally to the owner; GM views use opted-in shared status. The displays leave public actor system fields, native token bars and ActiveEffects untouched. Disconnected shares become stale after 45 seconds; the dashboard labels them and map displays stop using them. Disabling sharing publishes an empty encrypted-status record; it cannot erase values a GM already saw.
- **Du bist dran** follows Foundry's existing initiative tracker and shows current sheet effects. Unresolved weapon hits stay in the HUD as reminders. Conditions, expiry and damage remain manual.
- **Zug beenden** sends a private request to the GM. The GM confirms it in **Gruppe & Proben**; it advances only the same combat/round/turn that was requested. An already-authorized GM can explicitly advance their own linked actor's turn. There is no automatic turn advancement.
- The GM dashboard updates status and tracks the most recent 30 requested checks from the last day as **wartet**, **gewürfelt**, or **abgelaufen**, with the player's public roll total. Native chat documents let the tracker recover after a reload. Requests still require each player to confirm; free rolls still work without a connected sheet.

## Optional add-ons

The GM can install these through Foundry's normal module installer and enable them in the existing world. The bridge never installs modules itself.

- [Sequencer](https://foundryvtt.com/packages/sequencer/) plus [JB2A Free](https://foundryvtt.com/packages/JB2A_DnD5e/) enable the curated shadow, healing, shield, fire, lightning and melee presets. The free asset collection is a substantial download; no paid pack is required, although availability varies by installed assets. The bridge chooses installed matching files only; no arbitrary scripts, paths or remote asset URLs are accepted. An unavailable preset is skipped. Colours prefer matching assets where available. Audio is off by default and only uses audio embedded in the chosen animation, respecting Foundry volume controls.
- [Dice So Nice](https://foundryvtt.com/packages/dice-so-nice/) supplies animated 3D dice through the existing native roll flow. Configure its appearance directly in Foundry.
- [FXMaster](https://foundryvtt.com/packages/fxmaster/) supplies GM-controlled scene ambience. Configure weather/effects directly in Foundry; the companion only reports its availability.

## Data boundaries and checks

The pairing still requires the exact opener window, origin and session nonce. Actor links store only a hashed character identity, user ID and display name; they never contain Sheetshift filenames or saved character files. Linking requires Foundry OWNER permission. Public rolls/cards use the current Foundry player and bounded structured action values. A resource debit is still saved atomically in Sheetshift before the corresponding ability card.

Exact shared HP/resources/conditions are encrypted separately for each GM with X25519, HKDF-SHA256 and AES-256-GCM before being stored in whispered chat flags. The encryption authenticates the world, actual document author, character, actor, update time and recipient. The bridge uses bundled, version-pinned Noble cryptography; it has no third-party relay or runtime CDN. GM private keys stay in browser local storage and are never uploaded. GM public keys live on the GM's Foundry user. Invalid keys or unavailable storage pause sharing rather than sending plaintext. Actor ownership and linkage are checked again on received status. Whisper recipients, role checks and UI hiding are additional controls, not the encryption boundary.

This protects exact values from other Foundry players; it does not replace HTTPS, protect a compromised GM browser, or prevent a player editing their own character values. Public action cards can still reveal their chosen ability cost/description or roll modifiers as they did before.

Automated checks cover pairing/deduplication, weapon-hit retention and target retention, private recipient validation, encryption/tamper rejection, actor ownership, manual turn permissions, bounded action/area metadata and request authorship. The local browser simulator exercises the real HUD forms and controls. Actual v14 canvas rendering, installed JB2A/Sequencer assets, Dice So Nice and two separate player/GM sessions still need a live-world acceptance check before the next session.

### Live-world acceptance checklist

1. Connect one player and GM; link the player's owned actor. Attempt to select a non-owned NPC and confirm it cannot be linked.
2. Change HP/resources in Sheetshift; verify the player's HUD and visible token update. With sharing off, the GM dashboard has no exact values. Enable it and check GM values; a second player must see none. Inspect a status message's flags: only encrypted envelopes contain the status.
3. Mark target A, attack, change target to B and attack with the other weapon. Resolve damage for A first, then B. Both original hit entries and targets must survive.
4. Use a free ability and a paid one; ensure only the paid one spends. Try a missing animation preset; chat and resource confirmation must still work.
5. Try a range and each area shape, cancel with Escape and switch scenes. Confirm no scene records, token movement or automatic damage are created.
6. Start combat with the linked actor. Confirm the reminder appears; request turn end and let the GM confirm. Repeated or stale requests must not advance another turn.
7. Request a talent check and a free roll for two players. Confirm each independently and check waiting/rolled/expired progress, including after a Foundry reload.
