# Warehouse conveyor — Python control bridge

Control the running **Warehouse conveyor** AnyLogic model from Python: spawn a crate
on demand and watch the conveyor belt transport it.

## How it works

AnyLogic's **Pypeline** add-on only lets the model *call* Python — there is no built-in
way for an outside process to push into a running simulation. So we invert control with
a **command queue + polling** pattern:

```
  API client (curl / spawn_crate.py)
        │  POST /spawn {"type":"food","count":1}
        ▼
  bridge.py  ──HTTP server (daemon thread)──►  thread-safe queue
        ▲
        │  drain_count()  → total crates to spawn (int)   (called by Pypeline)
  AnyLogic Main:
        • StartupCode:  pyCommunicator.run("from bridge import drain_commands");
        • Event pollPython (cyclic, 0.5s):
              Integer n = pyCommunicator.runResults(Integer.class, "drain_count()");
              for (i = 0..n)  → Order o = add_orders();
                                cartonsEnter.take(new Carton(o));   // rides cartonInitialLine
```

A spawned **crate is a `Carton`** — created exactly the way the model creates one on a
normal order arrival (`add_orders()` builds a random order, a `Carton` is dropped onto
the `cartonInitialLine` conveyor via the existing `cartonsEnter` block and flows through
the real order-picking / sorting workflow). Reusing the model's own tested path keeps it
type-safe and avoids disturbing the conveyor logic. The poll event returns a plain `int`
(via `drain_count()`) so the Pypeline round-trip needs no list/map deserialization.

`bridge.py` is launched as Pypeline's interpreter process. On import it starts an HTTP
server on `127.0.0.1:8421` on a daemon thread; that thread stays alive for the whole run.
`drain_commands()` runs on the Pypeline request thread and shares the queue with the HTTP
thread — `queue.Queue` keeps that safe.

## Prerequisites

1. The **Pypeline** add-on installed in your AnyLogic environment
   (https://www.anylogic.com/pypeline) — same requirement as the Supply Chain Optimizer demo.
2. **Python 3** reachable by the command configured on the model's `pyCommunicator`
   (the `pythonCommand` parameter — set it to your interpreter, e.g. `python3`).
3. `bridge.py` lives in this folder (the model's working directory), so `from bridge import ...`
   resolves.

## Run it

1. Open **Warehouse conveyor.alp** in AnyLogic and start the model.
   On startup the console prints:
   `[bridge] warehouse conveyor bridge listening on http://127.0.0.1:8421`
2. Check the bridge is up:
   ```
   curl http://127.0.0.1:8421/health
   # {"ok": true, "pending": 0}
   ```
3. Spawn a crate:
   ```
   python spawn_crate.py --type food --count 1
   # or:
   curl -X POST http://127.0.0.1:8421/spawn -d '{"type":"food","count":1}'
   ```
   Within ~0.25s a crate appears on the conveyor in the 2D/3D view and is transported.
4. Spawn a burst and watch the queue drain:
   ```
   python spawn_crate.py --type beverage --count 5
   curl http://127.0.0.1:8421/health   # "pending" returns to 0 once injected
   ```

## API

| Method | Path      | Body                                  | Response                              |
|--------|-----------|---------------------------------------|---------------------------------------|
| POST   | `/spawn`  | `{"type":"food\|beverage\|dish","count":N}` | `{"queued":N,"type":...,"pending":M}` |
| GET    | `/health` | —                                     | `{"ok":true,"pending":M}`             |

`type` defaults to `food`, `count` to `1`. `count` is capped at 1000.

> **v1 note:** each spawned crate is a randomly-composed order (matching the model's own
> order-arrival logic), so `count` controls *how many* crates appear but `type` is accepted
> and validated yet not yet used to force the crate contents. Per-type spawning is a small
> follow-up: have the poll event read `drain_commands()` (which already carries `type`)
> instead of `drain_count()`, and bias `add_orders()` accordingly.

## Files

- `bridge.py` — HTTP server + `drain_commands()` (stdlib only; imported by Pypeline).
- `spawn_crate.py` — CLI client (stdlib `urllib`).
- `requirements.txt` — nothing to install for the bridge.
- `Warehouse conveyor.alp` — the model. Edits: a `pyCommunicator` (PyCommunicator) object in
  `Main`, the Pypeline import in `Main`'s startup code, a Pypeline `RequiredLibraryReference`,
  and the cyclic `pollPython` event.

## Testing bridge.py without AnyLogic

```
python bridge.py &                 # foreground server
curl -X POST localhost:8421/spawn -d '{"type":"dish","count":2}'
python -c "import bridge, time; time.sleep(0.2); print(bridge.drain_commands())"
```
(Note: the second command runs in a *separate* process with its own empty queue — to see
`drain_commands()` return the items, call it within the same process that received the POST.)
