#!/usr/bin/env python3
"""Build an offline 小红书小工具 zip. Does not log in, upload, or submit."""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent.parent
DIST = HERE / "dist"
STAGE = HERE / ".stage"
ZIP = HERE / "pixel-farm-xhs-tool.zip"

JS_FILES = [
    "animals.js", "family.js", "fish.js", "fx.js", "game.js", "playlog.js",
    "save.js", "sim.js", "surprise.js", "ui.js", "world.js",
]
ASSETS = [
    "palette.js", "sprites.js", "chars.png", "crops.png", "hud_icons.png", "palette.png",
]

OPTIONAL_CHAIN = (
    "matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener?.('change', fit);"
)
OPTIONAL_CHAIN_FIX = (
    "(function (m) { if (m && m.addEventListener) m.addEventListener('change', fit); })"
    "(matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx'));"
)


def official_audit_scripts() -> tuple[Path, Path]:
    wf = Path("/home/box/agent-data/workflows/minitool-zip-builder/scripts")
    if (wf / "audit_artifact.py").is_file():
        return wf / "audit_artifact.py", wf / "audit_artifact.mjs"
    local = HERE / "scripts"
    return local / "audit_artifact.py", local / "audit_artifact.mjs"


def stage() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    if DIST.exists():
        shutil.rmtree(DIST)
    if ZIP.exists():
        ZIP.unlink()
    (STAGE / "assets").mkdir(parents=True)
    DIST.mkdir(parents=True)

    for name in JS_FILES:
        shutil.copy2(ROOT / name, STAGE / name)
    for name in ASSETS:
        shutil.copy2(ROOT / "assets" / name, STAGE / "assets" / name)
    shutil.copy2(HERE / "platform.js", STAGE / "platform.js")
    shutil.copy2(HERE / "mobile.js", STAGE / "mobile.js")
    shutil.copy2(HERE / "mobile.css", STAGE / "mobile.css")
    shutil.copy2(HERE / "boot.js", STAGE / "boot.js")
    shutil.copy2(HERE / "leaderboard.js", STAGE / "leaderboard.js")
    shutil.copy2(HERE / "ui-icons.png", STAGE / "ui-icons.png")

    game = (STAGE / "game.js").read_text()
    if OPTIONAL_CHAIN in game:
        (STAGE / "game.js").write_text(game.replace(OPTIONAL_CHAIN, OPTIONAL_CHAIN_FIX, 1))
        print("patched optional chaining in staged game.js")
    else:
        print("warn: optional-chaining site not found in game.js, leaving as-is", file=sys.stderr)

    src = (ROOT / "index.html").read_text()
    out = re.sub(r'\s*<script src="[^"]+"></script>\s*', "\n", src)
    out = out.replace(
        'content="width=device-width,initial-scale=1"',
        'content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"',
        1,
    )
    if "</head>" in out and 'mobile.css' not in out:
        out = out.replace("</head>", '  <link rel="stylesheet" href="mobile.css">\n</head>', 1)
    out = out.replace(
        "</body>",
        "  <script src=\"platform.js\"></script>\n  <script src=\"mobile.js\"></script>\n  <script src=\"boot.js\"></script>\n</body>",
        1,
    )
    out = out.replace("像素堆叠 · 放置农场", "像素农场（小红书小工具预览）", 1)
    (STAGE / "index.html").write_text(out)
    print("wrote staged index.html")


def write_zip() -> None:
    with zipfile.ZipFile(ZIP, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(STAGE.rglob("*")):
            if not path.is_file():
                continue
            if path.name in {".DS_Store"} or path.name.startswith("._"):
                continue
            zf.write(path, path.relative_to(STAGE).as_posix())
    # unzipped tree for `redapp dev --dir`
    shutil.copytree(STAGE, DIST, dirs_exist_ok=True)
    shutil.copy2(ZIP, DIST / "pixel-farm-xhs-tool.zip")
    print("---- zip listing ----")
    with zipfile.ZipFile(ZIP) as zf:
        for info in zf.infolist():
            print(f"{info.file_size:10d}  {info.filename}")
        zs = ZIP.stat().st_size
        un = sum(i.file_size for i in zf.infolist())
    print("---- sizes ----")
    print(f"zip {zs} bytes ({zs/1048576:.2f} MiB), unzipped {un} bytes ({un/1048576:.2f} MiB)")
    print("limit: zip <= 10 MiB (recommend <= 2 MiB); unzip <= 30 MiB")


def audit() -> int:
    py, js = official_audit_scripts()
    rc = 0
    print(f"---- official audit (python: {py}) ----")
    r = subprocess.run([sys.executable, str(py), str(ZIP)])
    rc = r.returncode or rc
    print(f"---- official audit (js: {js}) ----")
    r = subprocess.run(["node", str(js), str(ZIP)])
    rc = r.returncode or rc
    return rc


def main() -> int:
    stage()
    write_zip()
    return audit()


if __name__ == "__main__":
    raise SystemExit(main())
