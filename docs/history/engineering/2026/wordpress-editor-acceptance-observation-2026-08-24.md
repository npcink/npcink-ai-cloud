# WordPress Editor Acceptance Observation — 2026-08-24

Status: initial observation sample; not a performance or recommendation-quality
claim.

## Scope

Five consecutive local acceptance samples were collected against three existing
WordPress posts (`277152`, `275598`, and `287418`). Each sample made six
read-only editor content-support requests: three `related_articles` and three
`internal_links`. No cache was cleared and no Provider call was added for this
observation.

## Result

| Measure | Observation |
| --- | ---: |
| Samples | 5 |
| Posts per sample | 3 |
| Requests | 30 |
| Cloud vector evidence | 30/30 |
| Fallback results | 0 |
| Non-200 responses | 0 |
| WordPress write-boundary failures | 0 |
| Unchanged post snapshots | 5/5 |
| Failed samples | 0 |
| Related articles p50 / max | 0.7 ms / 3630.3 ms |
| Internal links p50 / max | 15.1 ms / 858.6 ms |
| First request p50 / max | 12.3 ms / 3630.3 ms |

## Interpretation

The first sample took 7.931 seconds overall; the next four took between 0.326
and 0.374 seconds. The outlier was the first `related_articles` request. This
is consistent with a cold or uncached path, but this small observational
sample does not establish causality or a stable SLA. The current evidence does
not justify changing ranking, adding a second retrieval algorithm, or adding a
new cache layer.

## Next observation

Collect natural samples on another day or after an ordinary local restart. Keep
cold and warm observations labelled when the environment makes that fact
visible. Escalate to an isolated performance change only if the same latency
pattern repeats across independent samples or a request returns non-vector
evidence, a non-200 status, or a WordPress write.

The raw local JSON samples remain under `.tmp/editor-acceptance-samples/` and
are intentionally not source or release evidence.
