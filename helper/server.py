#!/usr/bin/env python3
"""Local helper for the Multitool page. It listens on 127.0.0.1 only."""

import ipaddress
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse

HOST = "127.0.0.1"
DEFAULT_PORT = 8765
MAX_BODY = 64 * 1024
TIMEOUT_SECONDS = 30 * 60
PAGE_ORIGIN = "https://manofneptune27.github.io"
IDLE_SECONDS = 120
YTDLP_LOCK = threading.Lock()
TOUCH_LOCK = threading.Lock()
LAST_TOUCH = time.monotonic()


class Busy(Exception):
    pass


class Handler(BaseHTTPRequestHandler):
    server_version = "MultitoolHelper/1.0"

    def log_message(self, fmt, *args):
        if sys.stderr is None:
            return
        try:
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))
        except Exception:
            return

    def do_OPTIONS(self):
        if not self.origin_ok():
            self.send_json(403, {"error": "This helper only answers the Multitool page."})
            return
        touch()
        self.send_response(204)
        self.send_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        try:
            if not self.origin_ok():
                self.send_json(403, {"error": "This helper only answers the Multitool page."})
                return
            touch()
            if urlparse(self.path).path != "/health":
                self.send_json(404, {"error": "That page is not part of the helper."})
                return
            self.send_json(200, health())
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"error": "The helper hit an unexpected error."})

    def do_POST(self):
        try:
            if not self.origin_ok():
                self.send_json(403, {"error": "This helper only answers the Multitool page."})
                return
            touch()
            path = urlparse(self.path).path
            if path == "/shutdown":
                self.close_helper()
                return
            payload = self.read_json()
            if path == "/info":
                self.send_json(200, video_info(payload.get("url", "")))
                return
            if path == "/download":
                self.send_download(payload.get("url", ""), payload.get("mode", ""))
                return
            self.send_json(404, {"error": "That page is not part of the helper."})
        except Busy:
            self.send_json(409, {"error": "The helper is already working on a link."})
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except RuntimeError as exc:
            self.send_json(502, {"error": str(exc)})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"error": "The helper hit an unexpected error."})

    def origin_ok(self):
        origin = self.headers.get("Origin")
        return origin is None or origin_allowed(origin)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("That request was not valid.") from exc
        if length < 0 or length > MAX_BODY:
            raise ValueError("That request is too large.")
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("That request was not valid JSON.") from exc
        if not isinstance(data, dict):
            raise ValueError("That request was not valid JSON.")
        return data

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_download(self, url, mode):
        with tempfile.TemporaryDirectory(prefix="multitool-") as tmp:
            path, name = download_to(tmp, url, mode)
            size = path.stat().st_size
            self.send_response(200)
            self.send_cors()
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(size))
            self.send_header("Content-Disposition", content_disposition(name))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with path.open("rb") as handle:
                shutil.copyfileobj(handle, self.wfile)

    def send_cors(self):
        origin = self.headers.get("Origin")
        if not origin_allowed(origin):
            return
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Private-Network-Access-Name", "multitool")
        self.send_header("Private-Network-Access-ID", "02:00:00:00:00:01")

    def close_helper(self):
        self.send_response(204)
        self.send_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()
        threading.Thread(target=self.server.shutdown, daemon=True).start()


def say(text):
    if sys.stdout is None:
        return
    try:
        print(text, flush=True)
    except Exception:
        return


def touch():
    global LAST_TOUCH
    with TOUCH_LOCK:
        LAST_TOUCH = time.monotonic()


def seconds_idle():
    with TOUCH_LOCK:
        return time.monotonic() - LAST_TOUCH


def watch_idle(server):
    while True:
        time.sleep(5)
        if YTDLP_LOCK.locked():
            continue
        if seconds_idle() < IDLE_SECONDS:
            continue
        server.shutdown()
        return


def origin_allowed(origin):
    if not origin:
        return False
    if origin == PAGE_ORIGIN:
        return True
    parsed = urlparse(origin)
    return parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}


def public_url(url):
    if not isinstance(url, str):
        raise ValueError("Use a full http or https link.")
    raw = url.strip()
    if len(raw) > 2000:
        raise ValueError("That link is too long.")
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme not in {"http", "https"} or not host:
        raise ValueError("Use a full http or https link.")
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".localhost") or host.endswith(".local"):
        raise ValueError("That link has to be a public page.")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("That link has to be a public page.")
    return raw


def ytdlp_command():
    root = Path(__file__).resolve().parent
    if os.name == "nt":
        candidate = root / ".venv" / "Scripts" / "yt-dlp.exe"
    else:
        candidate = root / ".venv" / "bin" / "yt-dlp"
    if candidate.is_file():
        return [str(candidate)]
    found = shutil.which("yt-dlp")
    if found:
        return [found]
    return [sys.executable, "-m", "yt_dlp"]


def ytdlp_version():
    try:
        proc = subprocess.run(
            ytdlp_command() + ["--version"],
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    version = proc.stdout.strip()
    return version or None


def ffmpeg_path():
    found = shutil.which("ffmpeg")
    if found:
        return found
    local_name = "ffmpeg.exe" if os.name == "nt" else "ffmpeg"
    local = Path(__file__).resolve().parent / ".bin" / local_name
    if local.is_file():
        return str(local)
    try:
        import imageio_ffmpeg
        bundled = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        bundled = None
    if bundled and Path(bundled).is_file():
        return bundled
    return None


def health():
    return {
        "ok": True,
        "ytdlp": ytdlp_version(),
        "ffmpeg": bool(ffmpeg_path()),
    }


def run_ytdlp(command):
    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("That took too long and was stopped.") from exc
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "yt-dlp failed").strip()
        lines = [line.strip() for line in detail.splitlines() if line.strip()]
        raise RuntimeError("\n".join(lines[-6:])[-1500:] or "yt-dlp failed.")
    return proc


def parse_info(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise RuntimeError("yt-dlp did not return video info.")


def shape_info(data):
    if data.get("_type") == "playlist":
        entries = [entry for entry in (data.get("entries") or []) if isinstance(entry, dict)]
        if not entries:
            raise RuntimeError("That page did not include a downloadable file.")
        shaped = shape_info(entries[0])
        if len(entries) > 1:
            shaped["kind"] = "playlist"
            shaped["count"] = len(entries)
        return shaped

    vcodec = data.get("vcodec")
    acodec = data.get("acodec")
    if vcodec and vcodec != "none":
        kind = "video"
    elif acodec and acodec != "none":
        kind = "audio"
    else:
        kind = "image"
    thumbnail = data.get("thumbnail") if isinstance(data.get("thumbnail"), str) else ""
    if not thumbnail.startswith(("http://", "https://")):
        thumbnail = ""
    duration = data.get("duration")
    if not isinstance(duration, (int, float)):
        duration = None
    filesize = data.get("filesize") or data.get("filesize_approx")
    if not isinstance(filesize, (int, float)):
        filesize = None
    return {
        "title": data.get("title") or "Untitled",
        "site": data.get("extractor") or data.get("extractor_key") or "Unknown",
        "duration": duration,
        "thumbnail": thumbnail,
        "filesize": filesize,
        "kind": kind,
        "ffmpeg": bool(ffmpeg_path()),
    }


def video_info(url):
    raw = public_url(url)
    if not ytdlp_version():
        raise RuntimeError("yt-dlp is not installed. Run: python3 -m pip install --user yt-dlp")
    if not YTDLP_LOCK.acquire(blocking=False):
        raise Busy()
    try:
        print("info %s" % urlparse(raw).hostname, flush=True)
        proc = run_ytdlp(ytdlp_command() + [
            "--ignore-config",
            "--no-playlist",
            "--max-downloads", "10",
            "--dump-single-json",
            "--no-warnings",
            "--skip-download",
            raw,
        ])
    finally:
        YTDLP_LOCK.release()
    return shape_info(parse_info(proc.stdout))


def download_to(tmp, url, mode):
    raw = public_url(url)
    if mode not in {"video", "audio"}:
        raise ValueError("Choose video or audio.")
    if not ytdlp_version():
        raise RuntimeError("yt-dlp is not installed. Run: python3 -m pip install --user yt-dlp")
    if not YTDLP_LOCK.acquire(blocking=False):
        raise Busy()
    try:
        print("%s %s" % (mode, urlparse(raw).hostname), flush=True)
        command = ytdlp_command() + [
            "--ignore-config",
            "--no-playlist",
            "--max-downloads", "10",
            "--no-warnings",
            "--restrict-filenames",
            "-P", tmp,
            "-o", "%(title).80s-%(id)s.%(ext)s",
        ]
        ffmpeg = ffmpeg_path()
        if mode == "audio":
            command += ["-f", "ba/b"]
        elif ffmpeg:
            command += ["-f", "bv*+ba/b", "--merge-output-format", "mp4", "--ffmpeg-location", ffmpeg]
        else:
            # A combined file when the site offers one, otherwise picture without sound.
            command += ["-f", "b/bv*"]
        command.append(raw)
        run_ytdlp(command)
    finally:
        YTDLP_LOCK.release()

    root = Path(tmp)
    files = [
        path for path in root.rglob("*")
        if path.is_file() and path.suffix not in {".part", ".ytdl"} and not path.name.endswith(".temp")
    ]
    if not files:
        raise RuntimeError("yt-dlp finished without a file.")
    finals = [path for path in files if not re.search(r"\.f\d+\.", path.name)]
    chosen = finals or files
    if len(chosen) == 1:
        return chosen[0], safe_download_name(chosen[0].name)
    zip_path = root / "multitool-download.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for item in files:
            archive.write(item, safe_download_name(item.name))
    return zip_path, "multitool-download.zip"


def safe_download_name(name):
    cleaned = Path(name).name
    cleaned = re.sub(r"[^A-Za-z0-9._ ()-]+", "_", cleaned).strip("._") or "download"
    return cleaned[:180]


def content_disposition(name):
    ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._") or "download"
    return "attachment; filename=\"%s\"; filename*=UTF-8''%s" % (ascii_name, quote(name))


def self_test():
    assert HOST == "127.0.0.1"
    accepted = [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://x.com/example/status/1",
        "https://bsky.app/profile/example/post/abc",
        "https://www.instagram.com/reel/abc/",
    ]
    rejected = [
        "",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "http://127.0.0.1/secret",
        "http://localhost/secret",
        "https://192.168.1.20/a",
        "https://10.1.1.1/a",
        "http://169.254.169.254/latest",
        "https://printer.local/a",
    ]
    for url in accepted:
        assert public_url(url) == url
    for url in rejected:
        try:
            public_url(url)
        except ValueError:
            continue
        raise AssertionError("accepted unsafe url: %s" % url)
    assert origin_allowed(PAGE_ORIGIN)
    assert origin_allowed("http://127.0.0.1:8080")
    assert origin_allowed("http://localhost:8080")
    assert not origin_allowed("https://evil.example")
    assert not origin_allowed("https://manofneptune27.github.io.evil.com")
    assert not origin_allowed("http://manofneptune27.github.io")
    assert safe_download_name("../etc/passwd") == "passwd"
    exercise_http()
    print("self-test ok")


def exercise_http():
    import urllib.error
    import urllib.request

    server = ThreadingHTTPServer((HOST, 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    try:
        health_request = urllib.request.Request(
            "http://127.0.0.1:%s/health" % port,
            headers={"Origin": PAGE_ORIGIN},
        )
        with urllib.request.urlopen(health_request, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
            assert body["ok"] is True
            assert "ffmpeg" in body
            assert response.headers["Access-Control-Allow-Origin"] == PAGE_ORIGIN
            assert response.headers["Access-Control-Allow-Private-Network"] == "true"

        blocked = urllib.request.Request(
            "http://127.0.0.1:%s/health" % port,
            headers={"Origin": "https://evil.example"},
        )
        try:
            urllib.request.urlopen(blocked, timeout=10)
            raise AssertionError("evil origin was allowed")
        except urllib.error.HTTPError as exc:
            assert exc.code == 403
            assert exc.headers.get("Access-Control-Allow-Origin") is None

        bad = urllib.request.Request(
            "http://127.0.0.1:%s/info" % port,
            data=json.dumps({"url": "file:///etc/passwd"}).encode("utf-8"),
            headers={"Origin": "http://127.0.0.1:9999", "Content-Type": "application/json"},
        )
        try:
            urllib.request.urlopen(bad, timeout=10)
            raise AssertionError("file url was accepted")
        except urllib.error.HTTPError as exc:
            assert exc.code == 400

        bad_mode = urllib.request.Request(
            "http://127.0.0.1:%s/download" % port,
            data=json.dumps({"url": "https://example.com/a", "mode": "best;rm"}).encode("utf-8"),
            headers={"Origin": PAGE_ORIGIN, "Content-Type": "application/json"},
        )
        try:
            urllib.request.urlopen(bad_mode, timeout=30)
            raise AssertionError("bad mode was accepted")
        except urllib.error.HTTPError as exc:
            assert exc.code in {400, 502}

        blocked_stop = urllib.request.Request(
            "http://127.0.0.1:%s/shutdown" % port,
            data=b"",
            headers={"Origin": "https://evil.example"},
            method="POST",
        )
        try:
            urllib.request.urlopen(blocked_stop, timeout=10)
            raise AssertionError("evil shutdown was allowed")
        except urllib.error.HTTPError as exc:
            assert exc.code == 403

        stop = urllib.request.Request(
            "http://127.0.0.1:%s/shutdown" % port,
            data=b"",
            headers={"Origin": PAGE_ORIGIN},
            method="POST",
        )
        with urllib.request.urlopen(stop, timeout=10) as response:
            assert response.status == 204
        deadline = time.time() + 5
        while time.time() < deadline:
            try:
                urllib.request.urlopen("http://127.0.0.1:%s/health" % port, timeout=1)
            except Exception:
                break
            time.sleep(0.1)
        else:
            raise AssertionError("helper stayed up after shutdown")
    finally:
        server.shutdown()
        server.server_close()


def main(argv):
    if "--self-test" in argv:
        self_test()
        return 0
    port = DEFAULT_PORT
    if len(argv) > 1:
        try:
            port = int(argv[1])
        except ValueError:
            print("Port must be a number.", file=sys.stderr)
            return 1
    if not 1 <= port <= 65535:
        print("Port must be from 1 to 65535.", file=sys.stderr)
        return 1
    server = ThreadingHTTPServer((HOST, port), Handler)
    touch()
    threading.Thread(target=watch_idle, args=(server,), daemon=True).start()
    say("Multitool helper listening on http://%s:%s" % (HOST, port))
    say("It closes when you lock the page, or about two minutes after you leave.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        say("Stopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
