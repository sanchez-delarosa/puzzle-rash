"""Local server for Puzzle Rush.

    python serve.py            # serves the app on http://127.0.0.1:8765 and opens your browser
    python serve.py --port 9000 --no-browser

The server stops by itself a few seconds after you close the last browser tab with the
app (use --keep-alive to keep it running). A reload doesn't stop it.

Your history is saved to data/history.json in this folder (a plain JSON file you own).
A dated copy is kept in data/backups/ the first time the server starts each day.
Only standard-library Python is needed.
"""

from __future__ import annotations

import argparse
import json
import shutil
import threading
import time
import webbrowser
from datetime import date
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP_DIR = HERE / "app"
DATA_DIR = HERE / "data"
HISTORY = DATA_DIR / "history.json"
BACKUPS = DATA_DIR / "backups"
MAX_BODY = 5 * 1024 * 1024

_lock = threading.Lock()

# ---- auto-stop when the app's browser tabs are gone -------------------------
# Each open tab sends a heartbeat every few seconds and says goodbye when it closes.
# When no tab is left, wait a short grace period (so a reload doesn't stop us) and
# then shut down. A tab that goes silent for a long time (e.g. the browser crashed)
# is dropped too; the long timeout leaves room for background-tab throttling.
CLOSE_GRACE_S = 8
SILENT_TAB_TIMEOUT_S = 10 * 60
_tabs: dict[str, float] = {}
_tabs_lock = threading.Lock()
_ever_connected = False


def tab_seen(tab: str) -> None:
    global _ever_connected
    with _tabs_lock:
        _tabs[tab] = time.monotonic()
        _ever_connected = True


def tab_gone(tab: str) -> None:
    with _tabs_lock:
        _tabs.pop(tab, None)


def watch_tabs(server) -> None:
    empty_since = None
    while True:
        time.sleep(1)
        now = time.monotonic()
        with _tabs_lock:
            for tab, seen in list(_tabs.items()):
                if now - seen > SILENT_TAB_TIMEOUT_S:
                    del _tabs[tab]
            open_tabs = len(_tabs)
            armed = _ever_connected
        if not armed or open_tabs:
            empty_since = None
            continue
        if empty_since is None:
            empty_since = now
        elif now - empty_since >= CLOSE_GRACE_S:
            print("\nThe app's browser tab was closed, so the server is stopping. Run start.bat to play again.")
            with _lock:  # let any save in progress finish first
                server.shutdown()
            return


def empty_store() -> dict:
    return {"version": 1, "runs": [], "settings": {}}


def load_store() -> dict:
    if not HISTORY.exists():
        return empty_store()
    with open(HISTORY, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    data.setdefault("version", 1)
    data.setdefault("runs", [])
    data.setdefault("settings", {})
    return data


def save_store(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = HISTORY.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(HISTORY)


def daily_backup() -> None:
    if not HISTORY.exists():
        return
    BACKUPS.mkdir(parents=True, exist_ok=True)
    dest = BACKUPS / f"history-{date.today().isoformat()}.json"
    if not dest.exists():
        shutil.copy2(HISTORY, dest)


class Handler(SimpleHTTPRequestHandler):
    # Explicit types: on Windows the registry can map .js to text/plain, which breaks ES modules.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
    }
    def log_request(self, code="-", size="-"):  # keep the console quiet except for errors
        try:
            if int(code) >= 400:
                super().log_request(code, size)
        except (TypeError, ValueError):
            super().log_request(code, size)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code: int, payload) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            raise ValueError("bad body size")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        if self.path.split("?")[0] == "/api/data":
            with _lock:
                return self._json(200, load_store())
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        try:
            payload = self._read_json()
        except Exception as exc:  # noqa: BLE001
            return self._json(400, {"error": f"invalid JSON: {exc}"})
        if path in ("/api/heartbeat", "/api/bye"):
            tab = str(payload.get("tab", "")) if isinstance(payload, dict) else ""
            if not tab:
                return self._json(400, {"error": "tab id required"})
            (tab_seen if path == "/api/heartbeat" else tab_gone)(tab)
            return self._json(200, {"ok": True})
        with _lock:
            data = load_store()
            if path == "/api/runs":
                runs = payload if isinstance(payload, list) else [payload]
                known = {r.get("id") for r in data["runs"]}
                added = 0
                for run in runs:
                    if not isinstance(run, dict) or "id" not in run:
                        return self._json(400, {"error": "run needs an id"})
                    if run["id"] not in known:
                        data["runs"].append(run)
                        known.add(run["id"])
                        added += 1
                save_store(data)
                return self._json(200, {"ok": True, "added": added, "total": len(data["runs"])})
            if path == "/api/settings":
                if not isinstance(payload, dict):
                    return self._json(400, {"error": "settings must be an object"})
                data["settings"] = payload
                save_store(data)
                return self._json(200, {"ok": True})
        return self._json(404, {"error": "unknown endpoint"})


def main() -> None:
    ap = argparse.ArgumentParser(description="Serve Puzzle Rush locally")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--keep-alive", action="store_true",
                    help="keep running after the browser tab is closed (stop with Ctrl+C)")
    args = ap.parse_args()

    if not (APP_DIR / "puzzles.json").exists():
        print("Note: app/puzzles.json is missing. Run `python build_puzzles.py` first to get puzzles.\n")
    daily_backup()

    handler = partial(Handler, directory=str(APP_DIR))
    server = None
    for port in range(args.port, args.port + 10):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit(f"No free port between {args.port} and {args.port + 9}")

    url = f"http://127.0.0.1:{server.server_address[1]}/"
    print(f"Puzzle Rush is running at {url}")
    print(f"History file: {HISTORY}")
    if args.keep_alive:
        print("Press Ctrl+C to stop.")
    else:
        print("Closing the app's browser tab stops the server (Ctrl+C works too).")
        threading.Thread(target=watch_tabs, args=(server,), daemon=True).start()
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
