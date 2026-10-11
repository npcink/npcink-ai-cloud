# Local WordPress draft closed-loop validation — 2026-09-23

Status: local development evidence only. This record is not user-acceptance,
commercial, production, or real Provider evidence.

The `magick-ai` Local site passed readiness with WordPress 7.1.1, WordPress AI
1.3.0, and Cloud Addon 0.2.0. The existing browser smoke was run with its
disposable fake-provider transport and a unique draft fixture. The fixture was
created through WP-CLI, opened in the real block editor, exercised through a
failed title attempt and recovery, title preview and insert, summary preview,
selected paragraph rephrase and accept, and one explicit local Save/Update.

Evidence from the run:

- five bounded requests were intercepted locally; all were `suggestion_only`,
  `result_only`, and `transport_preempted`;
- zero post/autosave REST writes occurred before explicit Save/Update;
- exactly one post write and one revision occurred at explicit Save/Update;
- title, summary, selected paragraph, and untouched sentinel blocks were
  read back consistently from WordPress;
- the temporary draft, authentication session, fake-provider plugin, and
  fixture options were verified removed (`post_id=281121` in this run).

No real payment, sandbox payment, Provider dispatch, credit assertion, or
production deployment was used. The generated screenshots were stored in the
host temporary directory by the existing smoke and are not product evidence.
