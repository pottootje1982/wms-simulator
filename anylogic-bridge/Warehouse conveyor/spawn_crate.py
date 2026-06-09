"""Tiny CLI client to spawn crates in the running "Warehouse conveyor" model.

The model (via bridge.py) runs an HTTP server while it is simulating. This script
POSTs a spawn command to it; the model picks it up within ~0.25s and injects the
crate onto the conveyor belt.

Usage:
    python spawn_crate.py --type food --count 3
    python spawn_crate.py                       # one food crate (defaults)
    python spawn_crate.py --health              # check the bridge is up

Equivalent without this script:
    curl -X POST http://127.0.0.1:8421/spawn -d '{"type":"food","count":1}'
    curl http://127.0.0.1:8421/health

Stdlib only (urllib) so it runs anywhere Python 3 does.
"""

import argparse
import json
import urllib.error
import urllib.request

DEFAULT_URL = "http://127.0.0.1:8421"


def post_spawn(base_url, crate_type, count):
    body = json.dumps({"type": crate_type, "count": count}).encode("utf-8")
    req = urllib.request.Request(
        base_url.rstrip("/") + "/spawn",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


def get_health(base_url):
    with urllib.request.urlopen(base_url.rstrip("/") + "/health", timeout=5) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser(description="Spawn crates in the Warehouse conveyor model")
    parser.add_argument("--type", default="food", choices=["food", "beverage", "dish"],
                        help="crate item type (default: food)")
    parser.add_argument("--count", type=int, default=1, help="number of crates (default: 1)")
    parser.add_argument("--url", default=DEFAULT_URL, help="bridge base URL (default: %s)" % DEFAULT_URL)
    parser.add_argument("--health", action="store_true", help="just check the bridge health and exit")
    args = parser.parse_args()

    try:
        if args.health:
            print(json.dumps(get_health(args.url), indent=2))
        else:
            result = post_spawn(args.url, args.type, args.count)
            print(json.dumps(result, indent=2))
    except urllib.error.URLError as exc:
        raise SystemExit(
            "Could not reach the bridge at %s (%s).\n"
            "Is the AnyLogic model running with bridge.py loaded?" % (args.url, exc)
        )


if __name__ == "__main__":
    main()
