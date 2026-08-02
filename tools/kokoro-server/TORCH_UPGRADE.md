# Upgrading torch on the voice servers

`torch==2.6.0` carries eight advisories on both `tools/kokoro-server` and
`tools/tts-server`. Five have a fix, three do not. The gate now sees all of them
(`node scripts/audit-gate.mjs --level=moderate`), and the three moderate ones are
allowlisted until **2026-09-15**, at which point the build fails until they are
either fixed or re-argued.

This upgrade cannot be verified in CI or from a developer machine. `kokoro-server`
is the default engine behind the `content-audio` edge function, so the only proof
that a bump works is a real deploy that renders real audio. That is why the
version has not been bumped in the repo yet: changing the pin without deploying
would make the gate report clean while the live app still runs 2.6.0, which is a
worse state than the one this document exists to fix.

## Recommended target: torch 2.13.0

Checked before recommending:

| Question | Answer |
|---|---|
| Does `kokoro==0.9.4` constrain torch? | No. Its metadata requires `torch` with no version bound. |
| Is there a CPU wheel for the runtime? | Yes. `torch-2.13.0+cpu` for cp312 exists on the PyTorch CPU index, which is what the Dockerfile installs from. |
| Does the Dockerfile's Python suit it? | Yes. `python:3.12-slim`; torch 2.13 needs >=3.10 and kokoro needs <3.13. |
| Does it conflict with the pinned `numpy==1.26.0`? | Not by metadata. torch 2.13 declares no numpy bound. |
| What does it buy? | All five fixable advisories close in one move: `GHSA-3749-ghw9-m3mg`, `GHSA-887c-mr87-cxwp`, `GHSA-vgrw-7cvw-pwgx`, `GHSA-qfhq-4f3w-5fph`, `GHSA-rrmf-rvhw-rf47`. |

Three advisories have no fix at any version and will remain after any bump:
`GHSA-x3gm-94wq-g975`, `GHSA-f4hp-rmr7-r7v8`, `GHSA-c678-jfcj-6jmf`. They stay on
the allowlist with the reachability argument, which is that the server takes an
audio script over a shared-secret endpoint and never accepts tensors, model files
or torch arguments from a caller.

The residual risk is runtime, not metadata: a large jump can break a model at
load or change how it sounds. That is exactly what the deploy check below is for.

## Two files change together

`requirements.txt` is not the only pin. The Dockerfile installs torch first, from
the CPU index, and `requirements.txt` repeats the pin. Both must move or they
disagree:

- `tools/kokoro-server/Dockerfile` line 12: `pip install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu`
- `tools/kokoro-server/requirements.txt`: `torch==2.6.0`

`tools/tts-server` additionally pins `torchaudio==2.6.0`, which must move to the
matching torchaudio release for the chosen torch.

## The check that decides it

Run from `tools/kokoro-server` after editing both pins.

```bash
fly deploy --app founderfirst-kokoro
```

```bash
curl -sS https://founderfirst-kokoro.fly.dev/health
```

Then render something real. A health check only proves the process started; it
does not prove torch can still load the model or produce audio.

```bash
curl -sS -X POST https://founderfirst-kokoro.fly.dev/render_item -H "content-type: application/json" -H "x-kokoro-secret: $KOKORO_SERVER_SECRET" -d '{"item_id":"upgrade-smoke","script":"This is a torch upgrade smoke test. If you can hear this sentence clearly, the render path survived the bump."}'
```

It passes only if all four hold:

1. `/health` returns ok.
2. `/render_item` returns success, not a 5xx.
3. An audio file is actually produced and is not silence or a truncated clip.
4. It sounds like the same voice. A model that loads on a new torch can still
   change its output, and a voice that quietly changes is a product regression
   even though nothing errored.

## If it fails, walk down

Each step still closes fewer advisories, so stop at the highest one that renders
correctly and record which step you stopped at and why.

| torch | Fixable advisories closed |
|---|---|
| 2.13.0 | 5 of 5 |
| 2.10.0 | 3 of 5 |
| 2.9.1 | 2 of 5 |
| 2.8.0 | 1 of 5 |

## After it passes

1. Update both pins in both services, and `torchaudio` for tts-server.
2. Delete the now-stale allowlist entries. The gate reports stale entries as a
   warning, so they will not fail the build, but leaving them means the next
   reader believes a live exception exists where none does.
3. Re-run `node scripts/audit-gate.mjs --level=moderate`.
4. Note the deploy date here, so the next person knows when this was last proven
   rather than last assumed.
