"""Build the explicitly allowlisted Foundry module release."""

import argparse
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
FILES = ("module.json", "bridge.mjs", "receiver.mjs", "protocol.mjs", "actions.mjs", "panel.mjs", "bridge.css")
REPOSITORY = "https://github.com/KiritoMikasa/sheetshift-foundry-bridge"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()
    manifest = json.loads((ROOT / "module.json").read_text())
    if args.tag != f"v{manifest['version']}":
        raise SystemExit("Release tag must match the module version")
    expected_download = f"{REPOSITORY}/releases/download/{args.tag}/sheetshift-bridge.zip"
    if manifest["id"] != "sheetshift-bridge" or manifest["download"] != expected_download:
        raise SystemExit("Unexpected module ID or download URL")
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    (output / "module.json").write_bytes((ROOT / "module.json").read_bytes())
    archive = output / "sheetshift-bridge.zip"
    with ZipFile(archive, "w", compression=ZIP_DEFLATED) as package:
        for filename in FILES:
            info = ZipInfo(f"sheetshift-bridge/{filename}", date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, (ROOT / filename).read_bytes())
    with ZipFile(archive) as package:
        assert package.testzip() is None
        assert package.namelist() == [f"sheetshift-bridge/{name}" for name in FILES]
        assert json.loads(package.read("sheetshift-bridge/module.json")) == manifest
    print(f"Built {archive.name}: {len(FILES)} files, {archive.stat().st_size} bytes")


if __name__ == "__main__":
    main()
