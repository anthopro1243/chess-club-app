# Unfinished agent work (container restart, 2026-09-26)

Nine parallel agents were building backlog items 5–12 when the cloud container restarted and
killed them before they finished. These patches are exactly what each left on disk, diffed
against 727aa36. **None of it is reviewed, merged, or known to pass tests.** Apply one with
`git apply docs/wip-2026-09-26/<file>.patch` to continue it.

| Patch | Feature |
|---|---|
| agent-a1994c164d419a731 | Plain-English mistake explanations (explain.js, partial) |
| agent-a2337cea8c151f20c | Homework (pure module committed with tests; store, UI, 0020 migration unfinished) |
| agent-a32bb0a7c6d37e68b | Player home dashboard (module + tests + component, unverified) |
| agent-a403720c03a3bf8cb | Board accessibility (SAN input, announcements; not wired) |
| agent-a5518917aef88aec5 | Tuesday sessions + session planner (modules + tests + components, unwired) |
| agent-ac7a14f09c34d534f | Repertoire UI (partial) |
