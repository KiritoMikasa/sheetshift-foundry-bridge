Initial preview of Sheetshift Bridge for Foundry VTT 14.

- Open a connected Sheetshift tab from Foundry's settings sidebar.
- Send talent checks to native public Foundry chat as the current player.
- Return the confirmed total to Sheetshift.
- Require explicit pairing and validate message source, origin, nonce, and roll values.
- Preserve request receipts so lost acknowledgements do not cause duplicate rolls.

Requires the matching Foundry connection feature on your Sheetshift website. Automated tests pass with a mocked Foundry API; a real Foundry world still needs to be tested.

Installation and connection instructions are in the repository README.
