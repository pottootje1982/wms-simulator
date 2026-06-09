"""Python <-> AnyLogic bridge for the "Warehouse conveyor" model.

This module is imported by AnyLogic's Pypeline add-on (PyCommunicator) when the
model starts:

    pyCommunicator.run("from bridge import drain_commands");

Pypeline only lets AnyLogic *call* Python, so to let an external process drive the
running simulation we invert control with a command queue + polling pattern:

  * On import, this module starts a tiny HTTP server (stdlib only) on a daemon
    thread. External clients POST spawn-commands to it; they land on a
    thread-safe queue.
  * A cyclic Event in Main polls `drain_commands()` a few times per second. That
    call (running on the Pypeline request thread) drains the queue and returns the
    pending commands, which AnyLogic then injects as crates onto a conveyor.

No third-party dependencies: the interpreter Pypeline launches may be a bare
Python 3 without pip packages, so we rely entirely on the standard library.

Manual smoke test (outside AnyLogic):

    python bridge.py            # starts the server in the foreground
    curl localhost:8421/health
    curl -X POST localhost:8421/spawn -d '{"type":"food","count":2}'
"""

import json
import queue
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = "127.0.0.1"
PORT = 8421

# Item/crate types the warehouse model understands (matches the ItemType enum).
VALID_TYPES = ("food", "beverage", "dish")
DEFAULT_TYPE = "food"
MAX_COUNT = 1000  # guard against a typo flooding the sim

# Thread-safe queue shared between the HTTP server thread (producer) and the
# Pypeline request thread that calls drain_commands() (consumer).
_queue: "queue.Queue[dict]" = queue.Queue()

# Module-level guard so a second `import bridge` (Pypeline may import more than
# once) does not try to bind the port again.
_server_started = False
_server_lock = threading.Lock()


def enqueue_spawn(crate_type=DEFAULT_TYPE, count=1):
    """Validate and push a spawn command onto the queue. Returns the count queued."""
    if crate_type not in VALID_TYPES:
        raise ValueError(
            "type must be one of %s, got %r" % (", ".join(VALID_TYPES), crate_type)
        )
    count = int(count)
    if count < 1 or count > MAX_COUNT:
        raise ValueError("count must be between 1 and %d, got %d" % (MAX_COUNT, count))
    _queue.put({"type": crate_type, "count": count})
    return count


def drain_commands():
    """Pop every pending spawn command and return them as a list of dicts.

    Pypeline serializes the returned list of dicts into a Java List<Map>. Returns
    an empty list when nothing is queued. Kept for callers that want the per-command
    detail (type/count); the model's poll event uses the simpler `drain_count()`.
    """
    commands = []
    while True:
        try:
            commands.append(_queue.get_nowait())
        except queue.Empty:
            break
    return commands


def drain_count():
    """Pop every pending command and return the TOTAL number of crates to spawn.

    Called by AnyLogic via `pyCommunicator.runResults(Integer.class, "drain_count()")`.
    Returning a bare int keeps the Pypeline round-trip maximally robust (no
    list/map deserialization). Returns 0 when nothing is queued.

    Note: v1 spawns a randomly-composed order per crate (matching the model's own
    order-arrival logic), so the per-command `type` is not yet used here.
    """
    return sum(cmd["count"] for cmd in drain_commands())


class _Handler(BaseHTTPRequestHandler):
    # Silence the default per-request stderr logging so it does not spam the
    # AnyLogic console; errors are still reported via _send below.
    def log_message(self, *args):
        pass

    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            self._send(200, {"ok": True, "pending": _queue.qsize()})
        else:
            self._send(404, {"error": "not found", "path": self.path})

    def do_POST(self):
        if self.path.split("?")[0] != "/spawn":
            self._send(404, {"error": "not found", "path": self.path})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            data = json.loads(raw or b"{}")
            crate_type = data.get("type", DEFAULT_TYPE)
            count = data.get("count", 1)
            queued = enqueue_spawn(crate_type, count)
        except (ValueError, json.JSONDecodeError) as exc:
            self._send(400, {"error": str(exc)})
            return
        self._send(200, {"queued": queued, "type": crate_type, "pending": _queue.qsize()})


def start_server(host=HOST, port=PORT):
    """Start the HTTP server on a daemon thread exactly once. Idempotent."""
    global _server_started
    with _server_lock:
        if _server_started:
            return
        httpd = HTTPServer((host, port), _Handler)
        thread = threading.Thread(
            target=httpd.serve_forever, name="warehouse-bridge-http", daemon=True
        )
        thread.start()
        _server_started = True
        print("[bridge] warehouse conveyor bridge listening on http://%s:%d" % (host, port))


# Start automatically on import (this is how AnyLogic/Pypeline brings it up).
start_server()


if __name__ == "__main__":
    # Foreground mode for manual testing without AnyLogic.
    import time

    print("[bridge] running in foreground; Ctrl-C to stop")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
