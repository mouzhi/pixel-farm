#!/usr/bin/env python3
"""Build an offline 小红书小工具 zip. Does not log in, upload, or submit."""
from __future__ import annotations

import base64
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
    "animals.js", "family.js", "fish.js", "fx.js", "game.js", "path.js", "playlog.js",
    "save.js", "sim.js", "surprise.js", "ui.js", "world.js", "audio.js",
    "wood.js", "kids.js", "weather.js", "insects.js", "codex.js", "codex_icons.js",
]
ASSETS = [
    "palette.js", "sprites.js", "family_sprites.js", "chars.png", "crops.png", "hud_icons.png", "palette.png",
]

OPTIONAL_CHAIN = (
    "matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener?.('change', fit);"
)
OPTIONAL_CHAIN_FIX = (
    "(function (m) { if (m && m.addEventListener) m.addEventListener('change', fit); })"
    "(matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx'));"
)

# Chrome 61 does not support ??. These are the known sites in game.js.
NULLISH_FIXES = [
    ("p.bend ?? p.w", "(p.bend != null ? p.bend : p.w)"),
    ("s.ax ?? 18", "(s.ax != null ? s.ax : 18)"),
    ("s.ay ?? 35", "(s.ay != null ? s.ay : 35)"),
]


def b64_mp3(path: Path, *, music: bool = False) -> str:
    """Embed an mp3 as base64. Long music tracks are re-encoded to 64 kbps stereo
    when ffmpeg is available, so the zip stays well under the 10 MiB cap."""
    data = path.read_bytes()
    if music and shutil.which("ffmpeg") and path.stat().st_size > 700_000:
        import tempfile
        tmp = Path(tempfile.mkstemp(suffix=".mp3")[1])
        try:
            r = subprocess.run(
                ["ffmpeg", "-y", "-i", str(path), "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "2", str(tmp)],
                capture_output=True,
            )
            if r.returncode == 0 and tmp.stat().st_size > 1000:
                data = tmp.read_bytes()
                print(f"reencoded {path.name} {path.stat().st_size} -> {len(data)} bytes @64k")
        finally:
            if tmp.exists():
                tmp.unlink()
    return base64.b64encode(data).decode("ascii")


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
    shutil.copy2(HERE / "atlas_hud_128_q90.webp", STAGE / "atlas_hud_128_q90.webp")
    shutil.copy2(HERE / "atlas_128_q90.webp", STAGE / "atlas_128_q90.webp")
    shutil.copy2(HERE / "note-copy.js", STAGE / "note-copy.js")
    shutil.copy2(HERE / "audio-config.js", STAGE / "audio-config.js")
    shutil.copy2(HERE / "atlas_extra_128_q90.webp", STAGE / "atlas_extra_128_q90.webp")
    # Official preview/submit allowlist has no audio extensions (preview API
    # rejected in-package .mp3 even though the zip auditor allowed it). CSP also
    # forbids data:/blob: on <audio>, so recorded samples are base64-embedded in
    # .js files and decoded with Web Audio. assets/audio-data.js holds morning +
    # core SFX; afternoon/evening/night and extra SFX are separate assets/ files.
    # None of these are on the boot critical path: audio.js lazy-loads them after
    # the first frames or when the player turns sound on. Music is 64 kbps stereo.
    def write_audio_data() -> None:
        def b64(path: Path, music: bool = False) -> str:
            return b64_mp3(path, music=music)

        def write_merge(dest: Path, tracks: dict[str, str], sfx: dict[str, str]) -> None:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open("w", encoding="ascii") as fh:
                fh.write("(function(){var D=window.PF_AUDIO_DATA||(window.PF_AUDIO_DATA={tracks:{},sfx:{}});")
                fh.write("D.tracks=D.tracks||{};D.sfx=D.sfx||{};")
                for key, val in tracks.items():
                    fh.write(f'D.tracks["{key}"]="{val}";')
                for key, val in sfx.items():
                    fh.write(f'D.sfx["{key}"]="{val}";')
                fh.write("})();")
                fh.write("\n")
            print(
                "wrote", dest.relative_to(STAGE),
                "tracks=", list(tracks),
                "sfx=", list(sfx) if len(sfx) <= 12 else f"{len(sfx)} keys",
                "bytes=", dest.stat().st_size,
            )

        morning = ROOT / "audio" / "morning.mp3"
        if not morning.is_file():
            morning = ROOT / "assets" / "audio" / "morning.mp3"
        tracks_m: dict[str, str] = {}
        if morning.is_file():
            tracks_m["morning"] = b64(morning, music=True)
        core_sfx: dict[str, str] = {}
        sfx_dir = ROOT / "sfx"
        if sfx_dir.is_dir():
            for src in sorted(sfx_dir.glob("*.mp3")):
                core_sfx[src.stem] = b64(src)
        write_merge(STAGE / "assets" / "audio-data.js", tracks_m, core_sfx)

        for slot in ("afternoon", "evening", "night"):
            src = ROOT / "assets" / "audio" / f"{slot}.mp3"
            if src.is_file():
                write_merge(STAGE / "assets" / f"audio-{slot}.js", {slot: b64(src, music=True)}, {})

        more_sfx: dict[str, str] = {}
        more_dir = ROOT / "assets" / "audio" / "sfx"
        if more_dir.is_dir():
            for src in sorted(more_dir.glob("*.mp3")):
                more_sfx[src.stem] = b64(src)
        if more_sfx:
            write_merge(STAGE / "assets" / "audio-sfx-more.js", {}, more_sfx)

    write_audio_data()
    note_dir = HERE / "note"
    if note_dir.is_dir():
        (STAGE / "note").mkdir(parents=True, exist_ok=True)
        for img in sorted(note_dir.iterdir()):
            if img.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                shutil.copy2(img, STAGE / "note" / img.name)

    game = (STAGE / "game.js").read_text()
    patched = []
    if OPTIONAL_CHAIN in game:
        game = game.replace(OPTIONAL_CHAIN, OPTIONAL_CHAIN_FIX, 1)
        patched.append("optional-chaining")
    else:
        print("warn: optional-chaining site not found in game.js, leaving as-is", file=sys.stderr)
    for src, dst in NULLISH_FIXES:
        if src in game:
            game = game.replace(src, dst)
            patched.append(src)
    (STAGE / "game.js").write_text(game)
    if patched:
        print("patched staged game.js:", ", ".join(patched))
    leftover = []
    for staged in STAGE.rglob("*.js"):
        text = staged.read_text(errors="ignore")
        if "?." in text or "??" in text:
            leftover.append(str(staged.relative_to(STAGE)))
    if leftover:
        print("warn: staged JS still contains ?. or ?? :", ", ".join(leftover), file=sys.stderr)

    src = (ROOT / "index.html").read_text()
    # Web builds append ?v= for GitHub Pages cache-busting. The offline zip
    # loads scripts via boot.js with bare filenames — query strings can miss
    # files under the container file protocol and are not needed here.
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
        "  <script src=\"platform.js\"></script>\n  <script src=\"note-copy.js\"></script>\n  <script src=\"mobile.js\"></script>\n  <script src=\"boot.js\"></script>\n</body>",
        1,
    )
    out = out.replace("像素堆叠 · 放置农场", "像素农场（小红书小工具预览）", 1)
    if re.search(r'<script[^>]+src="[^"]*\?', out):
        raise SystemExit("staged index.html still has query-string script src; offline zip must use bare paths")
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
