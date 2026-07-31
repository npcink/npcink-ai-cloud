Runtime-related test fixtures belong in this directory.

- `cloud/.runtime/**` is runtime-generated output and is ignored by git.
- Checked-in samples for tests should live under `cloud/tests/fixtures/runtime/**`.
- Keep fixtures minimal and purpose-specific so tests do not depend on live
  worker or deploy artifacts.

The former shared-account multi-user synthetic matrix is intentionally retired
while the validation-stage product enforces one account and one owner identity.
Reintroduce an organization matrix only after the organization trigger and
contract gates in `docs/customer-account-identity-stage-standard-v1.md` are
approved.
