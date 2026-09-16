# Sheetshift Bridge

Send talent checks from your Sheetshift character sheet to Foundry VTT's public chat. Foundry rolls `1d20 + Talent + Attribute modifier + Bonus` as the currently signed-in player, then sends the confirmed result back to the sheet.

This first preview targets **Foundry VTT 14**. Automated tests use a mocked Foundry API; compatibility still needs verification in a real Foundry world. Your Sheetshift website must also include the Foundry connection feature.

## Install from Foundry's web interface

No access to the hosting machine is required.

1. Between sessions, open Foundry's **Setup** screen.
2. Select **Add-on Modules → Install Module**.
3. Paste this into **Manifest URL** and click **Install**:

   ```text
   https://raw.githubusercontent.com/KiritoMikasa/sheetshift-foundry-bridge/main/module.json
   ```

4. Launch your existing world and join as GM.
5. In the settings sidebar, open **Active Modules** / **Manage Modules**, enable **Sheetshift Bridge**, save, and let the world reload.

Setup is Foundry's administration screen. You do not need to recreate your world or install Foundry again.

## Connect each player's sheet

1. Join Foundry as your own player, in a desktop browser.
2. Open the settings sidebar → **Game Settings → Sheetshift Bridge**.
3. Enter your normal Sheetshift website address in **Sheetshift-Adresse** and save. This setting applies to your browser. For development on your own computer, use `http://localhost:3457`.
4. Click **Sheetshift öffnen** in the settings sidebar. Allow a popup for Foundry if your browser blocks it.
5. In that new tab, log into Pangolin and Sheetshift normally, then open your character.
6. Check the offered Foundry world/player and click **Diese Sitzung verbinden**.
7. Keep both tabs open. In **Talente**, click a talent, select the GM's requested attribute, set any bonus/malus, and click **In Foundry würfeln**.
8. Verify one public chat roll appears under your player, with the same total in Sheetshift. Ask another player to confirm they can see it.

If the opener button is missing, confirm the module is enabled and reload. A Foundry Script macro can also open the sheet, subject to your world's macro permissions:

```js
game.modules.get("sheetshift-bridge").api.openSheet();
```

## Hosting and passwords

Foundry's server downloads this public module from GitHub. The actual connection happens between the two tabs in each player's browser. Foundry does not log into your Sheetshift server.

Keep your existing Pangolin password protection. No additional public domain, authentication bypass, API key, relay service, or open port is needed. The player signs in through the existing website. If a login redirect breaks the connection, finish signing in, then click **Sheetshift öffnen** again in Foundry. Strict browser isolation or `Cross-Origin-Opener-Policy` headers can prevent the connection; investigate the specific deployment instead of broadly disabling security protections.

GitHub hosts the module code and download only. Character data and roll messages do not pass through GitHub.

## During play

- All bridge rolls are **public**, even if Foundry's chat roll selector is set to a private mode.
- The first version handles talent checks; it does not automate damage, resources, rests, or house rules.
- After reloading Foundry, open Sheetshift from Foundry again and approve the new connection. Independently opened tabs cannot pair.
- If a roll times out, check chat before trying another roll. **Status prüfen · kein neuer Wurf** checks the original receipt without rolling again.
- If the bridge is offline, Sheetshift can copy the prepared `/r ...` command for Foundry chat.
- The module validates the source window, origin, session nonce, and structured roll values. Session storage prevents re-executing a request after a lost acknowledgement. It refuses to roll when it cannot save a receipt.

## Development

Requires Node.js 22+ and Python 3. No npm dependencies are needed.

```sh
node --test tests/*.test.mjs
python3 scripts/package.py --tag v0.1.0
```

The package contains only `module.json`, `bridge.mjs`, `receiver.mjs`, and `protocol.mjs`, under `sheetshift-bridge/`. Tests cover the receiver and the Foundry adapter, including duplicate requests and public chat attribution.

To release, update the manifest version and its versioned download URL, update release notes, commit, and push a matching `v<version>` tag. GitHub Actions runs tests, builds the ZIP, and publishes a preview release. Keep the manifest on `main` aligned with a published release before asking users to update.

See Foundry's [module installation guide](https://foundryvtt.com/article/modules/) and [module development documentation](https://foundryvtt.com/article/module-development/).
