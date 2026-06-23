# Cloud Skill Execution v1

Status: retired from local plugin gates.

Cloud skill execution policy is not a local Magick AI package gate. Any durable queue, worker, hosted callback, or operator recovery behavior must be specified and tested in `cloud/`.

The local plugin may expose bounded call sites and readonly summaries, but it must not own a second scheduler, second repair console, or local Cloud execution truth.

