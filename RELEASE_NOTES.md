Sheetshift Bridge 0.4.2 — show every token resource

- Show HP and every selected resource beneath linked tokens.
- Remove the CSS rule that hid Astralenergie and other resources after the first.
- Preserve existing private status sharing and resource values.
- Verified the actual overlay markup and stylesheet in a browser with three resources, including a depleted resource; Foundry integration tests pass.

Update Sheetshift Bridge to 0.4.2 through Setup → Add-on Modules, then reload Foundry. No new port, domain or Pangolin exception is needed.

---

Sheetshift Bridge 0.4.1 — inclusive weapon hit checks

- Attacks succeed when `1d100 ≤ weapon Hit`: rolling 60 hits a 60% weapon; 61 misses.
- Keep the confirmed damage action for equal-value hits.
- Align Foundry previews, chat labels and the Sheetshift result with the corrected rule.
- Tested below, equal and above the threshold through native chat rolls and the action panel.

Deploy the matching Sheetshift update, update the bridge to 0.4.1 and reconnect after reloading Foundry.

---

Sheetshift Bridge 0.4.0 — tabletop companion

- Owned-actor linking and grouped action HUD with icons and saved HP/resources/effects.
- Target portraits, scene-unit range warnings and temporary private area previews. Weapon hits retain their original targets for damage.
- Optional curated Sequencer/JB2A animations; native Dice So Nice rolls and FXMaster availability hints.
- Opt-in encrypted status for GMs, local token overlays and live party dashboard. Exact values are never stored in public Actor fields or plaintext chat flags.
- Turn reminders and explicit GM-approved turn-end requests. Defence, condition mechanics, movement and damage application remain manual.
- Native GM request progress with waiting/rolled/expired results and reload recovery.

Deploy the matching Sheetshift update, update the module through Setup → Add-on Modules, relaunch/reload the existing world, reconnect from Sheetshift öffnen, and link each owned actor. Optional visual add-ons are enabled by the GM through the normal module installer. No new port/domain/Pangolin exception is needed. See TABLETOP.md for the complete setup and acceptance checklist.

---

Sheetshift Bridge 0.3.0 — smoother combat and GM requests

- Keep each successful weapon attack available for its own confirmed damage roll, including two weapons with the same name. Discard defended hits explicitly.
- Cast abilities without resource costs: leave costs blank, use 0, or choose no resource. The ability appears in public chat without spending. Paid abilities still save the resource debit first.
- Search the GM talent catalogue by name or group, with keyboard selection and player-specific values. Catalogue selections distinguish same-name talent rows.
- Request labelled free dice rolls such as 1d100 or 2d6 + 3 from selected players. Players preview and confirm directly in Foundry, even without a connected Sheetshift tab.
- Preserve GM authentication, selected recipients, two-minute expiry, public player attribution, bounded dice formulas and persistent duplicate protection.

Deploy the matching Sheetshift update first. In Foundry Setup → Add-on Modules update Sheetshift Bridge to 0.3.0, relaunch the world and reload all player tabs. Reconnect sheets through Sheetshift öffnen. The manifest URL and connection settings stay the same.

Verified with automated vault/bridge/spending tests, a local browser simulator and release ZIP validation. The new flows should also be checked in your actual Foundry v14 world before your next session.
