Runtime-related test fixtures belong in this directory.

- `cloud/.runtime/**` is runtime-generated output and is ignored by git.
- Checked-in samples for tests should live under `cloud/tests/fixtures/runtime/**`.
- Keep fixtures minimal and purpose-specific so tests do not depend on live
  worker or deploy artifacts.

`portal_synthetic_multi_user_matrix_v1.json` contains only reserved synthetic
identities and stable scalar IDs. The PostgreSQL integration test creates a
uniquely named database, migrates it to head, loads the matrix, and drops the
database in `finally`. It must not target a production host or a long-lived
application database.

Run it explicitly in the approved M4 test lane:

```bash
pnpm run m4:preview:test -- \
  --focused tests/integration/test_portal_synthetic_multi_user_matrix.py
```
