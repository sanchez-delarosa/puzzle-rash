"""Build app/puzzles.json from the Lichess puzzle database.

Usage (from this folder):
    python build_puzzles.py                 # downloads the database if needed, then builds
    python build_puzzles.py --input path/to/lichess_db_puzzle.csv.zst
    python build_puzzles.py --per-bin 200 --max-rd 75

The Lichess database (https://database.lichess.org/#puzzles) is public domain (CC0).
Reading the compressed .zst file needs Python 3.14+ (built-in zstd) or `pip install zstandard`.
A plain, already-decompressed .csv also works.

Only puzzles with reliable ratings are kept (low rating deviation, many plays, well liked),
then an even sample is drawn from every 50-point rating band so the difficulty ladder
has puzzles at every step.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import random
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
DEFAULT_DOWNLOAD = HERE / "data" / "lichess_db_puzzle.csv.zst"
OUTPUT = HERE / "app" / "puzzles.json"
BIN = 50


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"Downloading {url}\n  -> {dest}")
    with urllib.request.urlopen(url) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length") or 0)
        done, last = 0, 0.0
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            now = time.time()
            if now - last > 0.5:
                last = now
                pct = f"{done / total:6.1%}" if total else ""
                print(f"\r  {done / 1e6:8.1f} MB {pct}", end="", flush=True)
    print()
    tmp.replace(dest)


def open_text(path: Path):
    if path.suffix == ".zst":
        raw = open(path, "rb")
        try:
            from compression import zstd  # Python 3.14+

            stream = zstd.ZstdFile(raw)
        except ImportError:
            try:
                import zstandard
            except ImportError:
                sys.exit(
                    "This file is zstd-compressed. Install the decompressor with\n"
                    "    pip install zstandard\n"
                    "or decompress it yourself (e.g. with 7-Zip ZS) and pass the .csv with --input."
                )
            stream = zstandard.ZstdDecompressor().stream_reader(raw)
        return io.TextIOWrapper(stream, encoding="utf-8", newline="")
    return open(path, "r", encoding="utf-8", newline="")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", type=Path, help="Path to lichess_db_puzzle.csv(.zst). Downloaded if omitted.")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--per-bin", type=int, default=150, help="Puzzles per 50-point rating band (default 150)")
    ap.add_argument("--min-rating", type=int, default=400)
    ap.add_argument("--max-rating", type=int, default=3000)
    ap.add_argument("--max-rd", type=int, default=80, help="Max rating deviation (default 80)")
    ap.add_argument("--min-plays", type=int, default=300, help="Min number of plays (default 300)")
    ap.add_argument("--min-popularity", type=int, default=80, help="Min popularity, -100..100 (default 80)")
    ap.add_argument("--max-plies", type=int, default=8,
                    help="Max length of the solution line incl. opponent moves (default 8 = up to 4 of your moves)")
    ap.add_argument("--seed", type=int, default=20261030)
    ap.add_argument("--output", type=Path, default=OUTPUT)
    args = ap.parse_args()

    src = args.input
    if src is None:
        src = DEFAULT_DOWNLOAD
        if not src.exists():
            download(args.url, src)
    if not src.exists():
        sys.exit(f"Input not found: {src}")

    rng = random.Random(args.seed)
    reservoirs: dict[int, list] = {}
    seen: dict[int, int] = {}
    scanned = kept = 0
    t0 = time.time()

    with open_text(src) as fh:
        reader = csv.reader(fh)
        header = next(reader)
        col = {name: i for i, name in enumerate(header)}
        need = ["PuzzleId", "FEN", "Moves", "Rating", "RatingDeviation", "Popularity", "NbPlays", "Themes"]
        missing = [n for n in need if n not in col]
        if missing:
            sys.exit(f"Unexpected CSV header, missing columns: {missing}")
        for row in reader:
            scanned += 1
            if scanned % 250_000 == 0:
                print(f"\r  scanned {scanned:,} puzzles, kept {kept:,} ({time.time() - t0:.0f}s)", end="", flush=True)
            try:
                rating = int(row[col["Rating"]])
                rd = int(row[col["RatingDeviation"]])
                pop = int(row[col["Popularity"]])
                plays = int(row[col["NbPlays"]])
            except (ValueError, IndexError):
                continue
            if not (args.min_rating <= rating < args.max_rating):
                continue
            if rd > args.max_rd or plays < args.min_plays or pop < args.min_popularity:
                continue
            moves = row[col["Moves"]].split()
            if len(moves) < 2 or len(moves) > args.max_plies:
                continue
            kept += 1
            b = rating // BIN
            item = [row[col["PuzzleId"]], row[col["FEN"]], " ".join(moves), rating, row[col["Themes"]]]
            # Reservoir sampling: an unbiased sample of size per_bin from each band.
            n = seen.get(b, 0) + 1
            seen[b] = n
            res = reservoirs.setdefault(b, [])
            if len(res) < args.per_bin:
                res.append(item)
            else:
                j = rng.randrange(n)
                if j < args.per_bin:
                    res[j] = item
    print(f"\r  scanned {scanned:,} puzzles, {kept:,} passed the filters ({time.time() - t0:.0f}s)        ")

    puzzles = [p for b in sorted(reservoirs) for p in sorted(reservoirs[b], key=lambda x: x[3])]
    if not puzzles:
        sys.exit("No puzzles passed the filters; try loosening --max-rd / --min-plays / --min-popularity.")

    print("\n  Rating band   puzzles")
    for b in sorted(reservoirs):
        print(f"  {b * BIN:4d}-{b * BIN + BIN - 1:<4d}   {len(reservoirs[b]):5d}")

    out = {
        "source": "Lichess puzzle database (CC0), https://database.lichess.org/#puzzles",
        "built": date.today().isoformat(),
        "filters": {
            "maxRatingDeviation": args.max_rd,
            "minPlays": args.min_plays,
            "minPopularity": args.min_popularity,
            "maxPlies": args.max_plies,
            "perBin": args.per_bin,
            "binSize": BIN,
        },
        "fields": ["id", "fen", "moves", "rating", "themes"],
        "puzzles": puzzles,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.output.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    tmp.replace(args.output)
    size = args.output.stat().st_size / 1024
    print(f"\nWrote {len(puzzles):,} puzzles to {args.output} ({size:.0f} KB)")


if __name__ == "__main__":
    main()
