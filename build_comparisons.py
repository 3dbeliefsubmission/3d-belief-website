#!/usr/bin/env python3
"""Build side-by-side comparison videos for the website.

Layout per panel: [GT | 3D-Belief (Ours) | DFoT | Gen3C/NWM]

The conditioning frame (kf0) is prepended from GT to every model so all
clips have the same number of frames and stay aligned with GT.
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

PACK = Path("/home/yyin34/vertical_imagination_panel_episodes_pack_20260507")
OUT_DIR = Path("/home/yyin34/research/projects/3dbelief/demo_site/3d-belief-website/static/videos/comparisons")
OUT_DIR.mkdir(parents=True, exist_ok=True)

CELL = 256
LABEL_H = 32
RE10K_FPS = 10
SPOC_FPS = 3

RE10K_IMAGINATION = [
    ("episode_000006_000013_000062_000070", "imagined_kf0_to_kf1"),
    ("episode_000092_000017_000069_000073", "imagined_kf0_to_kf1"),
    ("episode_000131_000000_000037_000079", "imagined_kf0_to_kf1"),
    ("episode_000181_000000_000050_000079", "imagined_kf0_to_kf1"),
    ("episode_000187_000032_000072_000086", "imagined_kf0_to_kf1"),
    ("episode_000658_000000_000057_000079", "imagined_kf0_to_kf1"),
]
SPOC_IMAGINATION = [
    ("episode_000057_000000_000005_000010", "imagined_kf0_to_kf1"),
    ("episode_000062_000002_000007_000012", "imagined_kf0_to_kf1"),
    ("episode_000070_000000_000005_000010", "imagined_kf0_to_kf1"),
    ("episode_000076_000000_000005_000010", "imagined_kf0_to_kf1"),
    ("episode_000097_000033_000038_000044", "imagined_kf0_to_kf1"),
]


def run(cmd):
    subprocess.run(cmd, check=True)


def make_clip(frame_paths, fps, out_path):
    """Build an mp4 from an explicit ordered list of frame files."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        for i, src in enumerate(frame_paths):
            os.symlink(src, td / f"f_{i:05d}.png")
        run([
            "ffmpeg", "-y", "-loglevel", "error",
            "-framerate", str(fps),
            "-i", str(td / "f_%05d.png"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            str(out_path),
        ])


def make_panel(clips_with_labels, fps, out_path):
    n = len(clips_with_labels)
    inputs = []
    for path, _ in clips_with_labels:
        inputs += ["-i", str(path)]
    cell_h = CELL + LABEL_H
    fc = []
    for i, (_, label) in enumerate(clips_with_labels):
        safe = label.replace(":", "\\:").replace("'", "\\'")
        fc.append(
            f"[{i}:v]fps={fps},scale={CELL}:{CELL}:flags=lanczos,setsar=1,"
            f"pad={CELL}:{cell_h}:0:{LABEL_H}:color=black,"
            f"drawtext=text='{safe}':fontcolor=white:fontsize=18:"
            f"x=(w-text_w)/2:y=({LABEL_H}-text_h)/2[v{i}]"
        )
    fc.append("".join(f"[v{i}]" for i in range(n)) + f"hstack=inputs={n}[outv]")
    run([
        "ffmpeg", "-y", "-loglevel", "error",
        *inputs,
        "-filter_complex", ";".join(fc),
        "-map", "[outv]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
        "-movflags", "+faststart",
        str(out_path),
    ])


def model_frame(ep_dir: Path, model: str, segment: str, idx: int) -> Path:
    """Frame for `model` at local index `idx`. Falls back to GT for kf0."""
    p = ep_dir / model / segment / "frames" / f"frame_{idx:04d}.png"
    if p.exists():
        return p
    # kf0 conditioning frame is identical to GT and not re-saved by predictors
    return ep_dir / "ground_truth" / "frames" / f"frame_{idx:04d}.png"


def build_episode(dataset, episode, segment, fps, out_name):
    ep_dir = PACK / dataset / episode
    if dataset == "re10k":
        baselines = [("3d_belief", "3D-Belief (Ours)"), ("dfot", "DFoT"), ("gen3c", "Gen3C")]
    else:
        baselines = [("3d_belief", "3D-Belief (Ours)"), ("dfot", "DFoT"), ("nwm", "NWM")]

    trace = json.loads((ep_dir / "3d_belief" / "trace.json").read_text())
    local_kf0 = trace["episode"]["local_kf0"]
    manifest = json.loads((ep_dir / "3d_belief" / segment / "manifest.json").read_text())
    pred_indices = list(manifest["requested_frame_indices"])
    full_indices = [local_kf0] + pred_indices

    tmp = OUT_DIR / "_tmp"
    tmp.mkdir(exist_ok=True)

    gt_frames = [ep_dir / "ground_truth" / "frames" / f"frame_{i:04d}.png" for i in full_indices]
    for p in gt_frames:
        if not p.exists():
            raise FileNotFoundError(p)
    gt_clip = tmp / f"gt_{dataset}_{episode}_{segment}.mp4"
    make_clip(gt_frames, fps, gt_clip)
    clips = [(gt_clip, "GT")]

    for sub, label in baselines:
        if not (ep_dir / sub / segment).exists():
            print(f"  skip {sub}: no segment dir")
            continue
        frame_paths = [model_frame(ep_dir, sub, segment, i) for i in full_indices]
        missing = [p for p in frame_paths if not p.exists()]
        if missing:
            print(f"  skip {sub}: missing {missing[0]}")
            continue
        clip = tmp / f"{sub}_{dataset}_{episode}_{segment}.mp4"
        make_clip(frame_paths, fps, clip)
        clips.append((clip, label))

    out_path = OUT_DIR / out_name
    make_panel(clips, fps, out_path)
    print(f"wrote {out_path}")


def main():
    for ep, seg in RE10K_IMAGINATION:
        build_episode("re10k", ep, seg, RE10K_FPS, f"imagination_re10k_{ep}.mp4")
    for ep, seg in SPOC_IMAGINATION:
        build_episode("spoc", ep, seg, SPOC_FPS, f"imagination_spoc_{ep}.mp4")

    tmp = OUT_DIR / "_tmp"
    if tmp.exists():
        shutil.rmtree(tmp)


if __name__ == "__main__":
    main()
