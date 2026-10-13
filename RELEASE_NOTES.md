Sheetshift Bridge 0.3.0 — smoother combat and GM requests

- Keep each successful weapon attack available for its own confirmed damage roll, including two weapons with the same name. Discard defended hits explicitly.
- Cast abilities without resource costs: leave costs blank, use 0, or choose no resource. The ability appears in public chat without spending. Paid abilities still save the resource debit first.
- Search the GM talent catalogue by name or group, with keyboard selection and player-specific values. Catalogue selections distinguish same-name talent rows.
- Request labelled free dice rolls such as 1d100 or 2d6 + 3 from selected players. Players preview and confirm directly in Foundry, even without a connected Sheetshift tab.
- Preserve GM authentication, selected recipients, two-minute expiry, public player attribution, bounded dice formulas and persistent duplicate protection.

Deploy the matching Sheetshift update first. In Foundry Setup → Add-on Modules update Sheetshift Bridge to 0.3.0, relaunch the world and reload all player tabs. Reconnect sheets through Sheetshift öffnen. The manifest URL and connection settings stay the same.

Verified with automated vault/bridge/spending tests, a local browser simulator and release ZIP validation. The new flows should also be checked in your actual Foundry v14 world before your next session.
