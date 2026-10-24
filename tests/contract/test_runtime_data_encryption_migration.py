from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from cryptography.fernet import Fernet

from app.core.config import Settings
from app.core.db import dispose_engine, get_session, init_schema
from app.core.models import (
    PortalMutationIdempotencyReceipt,
    PortalOAuthState,
    Principal,
    ProviderConnection,
    RunRecord,
    ServiceSetting,
    Site,
    SiteApiKey,
)
from app.core.secrets import decrypt_runtime_data_plaintext
from app.domain.runtime import runtime_data_reencryption as reencryption_module
from app.domain.runtime.runtime_data_reencryption import (
    ADDON_PAYLOAD_PURPOSE,
    PORTAL_IDEMPOTENCY_PURPOSE,
    RUN_INPUT_PURPOSE,
    RUNTIME_CALLBACK_PURPOSE,
    SITE_API_KEY_PURPOSE,
    LegacyRuntimeDataKey,
    RuntimeDataReencryptionError,
    apply_runtime_data_reencryption,
    dry_run_runtime_data_reencryption,
    inventory_runtime_data_ciphertexts,
    verify_runtime_data_ciphertexts,
)
from app.ops.reencrypt_runtime_data import main as reencryption_cli_main

LEGACY_ROOT = "legacy-admin-session-root-secret-at-least-32b"
OLD_RDE_KEY_ID = "runtime-key-2026-06"
CURRENT_ROOT = base64.urlsafe_b64encode(b"r" * 32).decode("ascii")
LEGACY_FERNET_KEYS_BY_PURPOSE = {
    SITE_API_KEY_PURPOSE: ("41136455a95d4be52ce1ff60b5932820a2e246ad8165864cfd2ce663c5276bc1"),
    RUNTIME_CALLBACK_PURPOSE: "e0c1db7ee10fe2bc64e43d24cf33997d53d625528463300e97c24eee7b287e9b",
    ADDON_PAYLOAD_PURPOSE: "ff8272734bf9162fda3dbab73916ad19f2c4dbd04aaf1256b6ef1671a7eb1e69",
    PORTAL_IDEMPOTENCY_PURPOSE: "ecf7e3828c7c796ffb05850ebce77a452e5a626221726c53b7afacd9fbaa0169",
    RUN_INPUT_PURPOSE: "9a267e2b97a7b0240c98448894dc0e9336df6108483b917c8adb5fa35b866427",
}


@pytest.fixture
def migration_database(tmp_path: Path) -> str:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'runtime-data-migration.db'}"
    init_schema(database_url)
    try:
        yield database_url
    finally:
        dispose_engine(database_url)


def _settings(database_url: str) -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        database_url=database_url,
        runtime_data_encryption_secret=CURRENT_ROOT,
        runtime_data_encryption_key_id="runtime-key-2026-07",
    )


def _legacy_ciphertext(plaintext: bytes, *, purpose: str) -> str:
    derived_key = bytes.fromhex(LEGACY_FERNET_KEYS_BY_PURPOSE[purpose])
    return Fernet(base64.urlsafe_b64encode(derived_key)).encrypt(plaintext).decode("utf-8")


def _seed_all_five_legacy_ciphertexts(
    database_url: str,
    *,
    envelope_key_id: str | None = None,
) -> dict[str, str]:
    now = datetime.now(UTC)
    ciphertexts = {
        "site_api_key": _legacy_ciphertext(b"site-signing-secret", purpose=SITE_API_KEY_PURPOSE),
        "site_runtime_callback": _legacy_ciphertext(
            b"callback-secret",
            purpose=RUNTIME_CALLBACK_PURPOSE,
        ),
        "addon_connection_payload": _legacy_ciphertext(
            b'{"api_key":"addon-secret"}',
            purpose=ADDON_PAYLOAD_PURPOSE,
        ),
        "portal_idempotency_response": _legacy_ciphertext(
            b'{"ok":true}',
            purpose=PORTAL_IDEMPOTENCY_PURPOSE,
        ),
        "runtime_execution_input": _legacy_ciphertext(
            b'{"prompt":"hello"}',
            purpose=RUN_INPUT_PURPOSE,
        ),
    }
    if envelope_key_id is not None:
        ciphertexts = {
            kind: f"rde.v1.{envelope_key_id}.{ciphertext}"
            for kind, ciphertext in ciphertexts.items()
        }
    with get_session(database_url) as session:
        session.add(
            Principal(
                principal_id="prn_migration",
                email="migration@example.com",
                status="active",
                session_version=1,
                metadata_json={"preserve": True},
            )
        )
        session.add(
            Site(
                site_id="site_migration",
                account_id=None,
                name="Migration site",
                status="active",
                site_url="https://example.com",
                platform_kind="wordpress",
                metadata_json={
                    "preserve": {"site": True},
                    "runtime_callbacks": {
                        "terminal": {
                            "url": "https://example.com/callback",
                            "secret_ciphertext": ciphertexts["site_runtime_callback"],
                        },
                        "preserve": True,
                    },
                },
            )
        )
        session.flush()
        session.add(
            SiteApiKey(
                key_id="key_migration",
                site_id="site_migration",
                secret_hash="hash",
                signing_secret_ciphertext=ciphertexts["site_api_key"],
                status="active",
                metadata_json={"preserve": True},
            )
        )
        session.add(
            PortalOAuthState(
                state_id="oauth_migration",
                provider="wordpress_addon_connection",
                state_hash="state-hash",
                status="pending",
                expires_at=now + timedelta(hours=1),
                metadata_json={
                    "payload_ciphertext": ciphertexts["addon_connection_payload"],
                    "preserve": {"oauth": True},
                },
            )
        )
        session.add(
            PortalMutationIdempotencyReceipt(
                receipt_id="receipt_migration",
                principal_id="prn_migration",
                idempotency_key="idempotency-key",
                request_method="POST",
                request_path="/portal/test",
                request_fingerprint="fingerprint",
                state="completed",
                claim_token=None,
                lease_expires_at=None,
                response_status=200,
                response_body_ciphertext=ciphertexts["portal_idempotency_response"],
                retention_ttl_seconds=3600,
                expires_at=now + timedelta(hours=1),
                completed_at=now,
            )
        )
        session.add(
            RunRecord(
                run_id="run_migration",
                site_id="site_migration",
                ability_name="test.ability",
                channel="test",
                execution_kind="queued",
                profile_id="test-profile",
                status="queued",
                trace_id="trace-migration",
                execution_input_ciphertext=ciphertexts["runtime_execution_input"],
            )
        )
        session.add(
            ProviderConnection(
                connection_id="provider_sentinel",
                provider_type="test",
                display_name="Provider sentinel",
                secret_ciphertext="provider-secret-ciphertext-must-not-change",
            )
        )
        session.add(
            ServiceSetting(
                setting_id="service_sentinel",
                setting_kind="test",
                secret_ciphertext_json={"secret": "service-setting-ciphertext-must-not-change"},
            )
        )
        session.commit()
    return ciphertexts


def _read_all_five_ciphertexts(database_url: str) -> dict[str, str]:
    with get_session(database_url) as session:
        site = session.get(Site, "site_migration")
        key = session.get(SiteApiKey, "key_migration")
        oauth = session.get(PortalOAuthState, "oauth_migration")
        receipt = session.get(PortalMutationIdempotencyReceipt, "receipt_migration")
        run = session.get(RunRecord, "run_migration")
        assert site is not None
        assert key is not None
        assert oauth is not None
        assert receipt is not None
        assert run is not None
        site_metadata = site.metadata_json or {}
        oauth_metadata = oauth.metadata_json or {}
        return {
            "site_api_key": str(key.signing_secret_ciphertext),
            "site_runtime_callback": str(
                site_metadata["runtime_callbacks"]["terminal"]["secret_ciphertext"]
            ),
            "addon_connection_payload": str(oauth_metadata["payload_ciphertext"]),
            "portal_idempotency_response": str(receipt.response_body_ciphertext),
            "runtime_execution_input": str(run.execution_input_ciphertext),
        }


def test_inventory_dry_run_apply_verify_and_repeat_apply(
    migration_database: str,
) -> None:
    original = _seed_all_five_legacy_ciphertexts(migration_database)
    settings = _settings(migration_database)

    inventory = inventory_runtime_data_ciphertexts(migration_database, settings=settings)
    assert (inventory.total, inventory.legacy, inventory.current) == (5, 5, 0)
    assert set(inventory.counts_by_kind) == set(original) | {
        "portal_totp_active_seed",
        "portal_totp_pending_seed",
    }
    assert all(inventory.counts_by_kind[kind]["total"] == 1 for kind in original)
    assert inventory.counts_by_kind["portal_totp_active_seed"]["total"] == 0
    assert inventory.counts_by_kind["portal_totp_pending_seed"]["total"] == 0

    dry_run = dry_run_runtime_data_reencryption(
        migration_database,
        settings=settings,
        legacy_root_secrets=(LEGACY_ROOT,),
    )
    assert dry_run.would_migrate == 5
    assert dry_run.migrated == 0
    assert _read_all_five_ciphertexts(migration_database) == original

    applied = apply_runtime_data_reencryption(
        migration_database,
        settings=settings,
        legacy_root_secrets=(LEGACY_ROOT,),
        maintenance_confirmed=True,
    )
    assert (applied.legacy, applied.current, applied.migrated) == (0, 5, 5)
    assert all(applied.counts_by_kind[kind]["migrated"] == 1 for kind in original)
    migrated = _read_all_five_ciphertexts(migration_database)
    assert all(
        ciphertext.startswith("rde.v1.runtime-key-2026-07.") for ciphertext in migrated.values()
    )

    verified = verify_runtime_data_ciphertexts(migration_database, settings=settings)
    assert (verified.total, verified.legacy, verified.current) == (5, 0, 5)

    repeated = apply_runtime_data_reencryption(
        migration_database,
        settings=settings,
        legacy_root_secrets=(LEGACY_ROOT,),
        maintenance_confirmed=True,
    )
    assert repeated.migrated == 0
    assert _read_all_five_ciphertexts(migration_database) == migrated

    with get_session(migration_database) as session:
        site = session.get(Site, "site_migration")
        oauth = session.get(PortalOAuthState, "oauth_migration")
        assert site is not None and site.metadata_json is not None
        assert oauth is not None and oauth.metadata_json is not None
        assert site.metadata_json["preserve"] == {"site": True}
        assert site.metadata_json["runtime_callbacks"]["preserve"] is True
        assert oauth.metadata_json["preserve"] == {"oauth": True}


def test_explicit_old_rde_envelope_migrates_to_the_active_rde_key(
    migration_database: str,
) -> None:
    original = _seed_all_five_legacy_ciphertexts(
        migration_database,
        envelope_key_id=OLD_RDE_KEY_ID,
    )
    settings = _settings(migration_database)
    legacy_envelope_keys = (LegacyRuntimeDataKey(key_id=OLD_RDE_KEY_ID, root_secret=LEGACY_ROOT),)

    with pytest.raises(RuntimeDataReencryptionError, match="unsupported runtime data envelope"):
        inventory_runtime_data_ciphertexts(migration_database, settings=settings)
    inventory = inventory_runtime_data_ciphertexts(
        migration_database,
        settings=settings,
        allowed_legacy_envelope_key_ids=frozenset({OLD_RDE_KEY_ID}),
    )
    assert (inventory.total, inventory.legacy, inventory.current) == (5, 5, 0)

    dry_run = dry_run_runtime_data_reencryption(
        migration_database,
        settings=settings,
        legacy_root_secrets=(LEGACY_ROOT,),
        legacy_envelope_keys=legacy_envelope_keys,
    )
    assert (dry_run.legacy, dry_run.would_migrate, dry_run.migrated) == (5, 5, 0)
    assert _read_all_five_ciphertexts(migration_database) == original

    applied = apply_runtime_data_reencryption(
        migration_database,
        settings=settings,
        legacy_root_secrets=(LEGACY_ROOT,),
        legacy_envelope_keys=legacy_envelope_keys,
        maintenance_confirmed=True,
    )
    assert (applied.legacy, applied.current, applied.migrated) == (0, 5, 5)
    assert all(
        ciphertext.startswith("rde.v1.runtime-key-2026-07.")
        for ciphertext in _read_all_five_ciphertexts(migration_database).values()
    )
    assert verify_runtime_data_ciphertexts(migration_database, settings=settings).current == 5


def test_unknown_old_rde_key_id_fails_closed_without_writes(migration_database: str) -> None:
    _seed_all_five_legacy_ciphertexts(
        migration_database,
        envelope_key_id="unknown-old-key",
    )
    before_apply = _read_all_five_ciphertexts(migration_database)

    with pytest.raises(RuntimeDataReencryptionError, match="unsupported runtime data envelope"):
        apply_runtime_data_reencryption(
            migration_database,
            settings=_settings(migration_database),
            legacy_root_secrets=(LEGACY_ROOT,),
            legacy_envelope_keys=(
                LegacyRuntimeDataKey(key_id=OLD_RDE_KEY_ID, root_secret=LEGACY_ROOT),
            ),
            maintenance_confirmed=True,
        )

    assert _read_all_five_ciphertexts(migration_database) == before_apply


def test_apply_does_not_touch_provider_or_service_setting_ciphertexts(
    migration_database: str,
) -> None:
    _seed_all_five_legacy_ciphertexts(migration_database)
    apply_runtime_data_reencryption(
        migration_database,
        settings=_settings(migration_database),
        legacy_root_secrets=(LEGACY_ROOT,),
        maintenance_confirmed=True,
    )

    with get_session(migration_database) as session:
        provider = session.get(ProviderConnection, "provider_sentinel")
        service_setting = session.get(ServiceSetting, "service_sentinel")
        assert provider is not None
        assert service_setting is not None
        assert provider.secret_ciphertext == "provider-secret-ciphertext-must-not-change"
        assert service_setting.secret_ciphertext_json == {
            "secret": "service-setting-ciphertext-must-not-change"
        }


def test_apply_requires_maintenance_confirmation(migration_database: str) -> None:
    _seed_all_five_legacy_ciphertexts(migration_database)
    with pytest.raises(RuntimeDataReencryptionError, match="maintenance window"):
        apply_runtime_data_reencryption(
            migration_database,
            settings=_settings(migration_database),
            legacy_root_secrets=(LEGACY_ROOT,),
            maintenance_confirmed=False,
        )


def test_dry_run_verifies_the_new_envelope_round_trip(
    migration_database: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = _seed_all_five_legacy_ciphertexts(migration_database)
    monkeypatch.setattr(
        reencryption_module,
        "encrypt_runtime_data_plaintext",
        lambda *_args, **_kwargs: "rde.v1.runtime-key-2026-07.invalid",
    )

    with pytest.raises(RuntimeDataReencryptionError, match="re-encryption failed"):
        dry_run_runtime_data_reencryption(
            migration_database,
            settings=_settings(migration_database),
            legacy_root_secrets=(LEGACY_ROOT,),
        )

    assert _read_all_five_ciphertexts(migration_database) == original


def test_corrupt_row_rolls_back_the_entire_apply(migration_database: str) -> None:
    original = _seed_all_five_legacy_ciphertexts(migration_database)
    with get_session(migration_database) as session:
        run = session.get(RunRecord, "run_migration")
        assert run is not None
        run.execution_input_ciphertext = "corrupt-legacy-token"
        session.commit()
    before_apply = _read_all_five_ciphertexts(migration_database)

    with pytest.raises(RuntimeDataReencryptionError, match="run_migration"):
        apply_runtime_data_reencryption(
            migration_database,
            settings=_settings(migration_database),
            legacy_root_secrets=(LEGACY_ROOT,),
            maintenance_confirmed=True,
        )

    assert _read_all_five_ciphertexts(migration_database) == before_apply
    assert before_apply["site_api_key"] == original["site_api_key"]


def test_verify_rejects_wrong_key_id_and_legacy_ciphertext(migration_database: str) -> None:
    _seed_all_five_legacy_ciphertexts(migration_database)
    with pytest.raises(RuntimeDataReencryptionError, match="legacy runtime data ciphertext"):
        verify_runtime_data_ciphertexts(migration_database, settings=_settings(migration_database))

    apply_runtime_data_reencryption(
        migration_database,
        settings=_settings(migration_database),
        legacy_root_secrets=(LEGACY_ROOT,),
        maintenance_confirmed=True,
    )
    wrong_key_id = Settings(
        _env_file=None,
        environment="test",
        database_url=migration_database,
        runtime_data_encryption_secret=CURRENT_ROOT,
        runtime_data_encryption_key_id="wrong-key-id",
    )
    with pytest.raises(RuntimeDataReencryptionError, match="unsupported runtime data envelope"):
        verify_runtime_data_ciphertexts(migration_database, settings=wrong_key_id)


def test_report_contains_only_counts_and_row_identifiers(migration_database: str) -> None:
    original = _seed_all_five_legacy_ciphertexts(migration_database)
    report = dry_run_runtime_data_reencryption(
        migration_database,
        settings=_settings(migration_database),
        legacy_root_secrets=(LEGACY_ROOT,),
    ).as_dict()
    serialized = repr(report)

    assert "site_api_key:key_migration" in serialized
    assert "site-signing-secret" not in serialized
    assert LEGACY_ROOT not in serialized
    assert all(ciphertext not in serialized for ciphertext in original.values())


def test_cli_redacts_settings_validation_details_and_secret_marker(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    secret_marker = "TOP_SECRET_MARKER"
    monkeypatch.setenv("NPCINK_CLOUD_RUNTIME_DATA_ENCRYPTION_SECRET", secret_marker)

    with pytest.raises(SystemExit) as exit_info:
        reencryption_cli_main(["inventory"])

    captured = capsys.readouterr()
    assert exit_info.value.code == 1
    assert captured.out == ""
    assert captured.err == "runtime data re-encryption configuration is invalid\n"
    assert secret_marker not in captured.out
    assert secret_marker not in captured.err


def test_cli_pairs_old_key_id_with_explicit_old_root_environment(
    migration_database: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    original = _seed_all_five_legacy_ciphertexts(
        migration_database,
        envelope_key_id=OLD_RDE_KEY_ID,
    )
    monkeypatch.setenv("NPCINK_CLOUD_DATABASE_URL", migration_database)
    monkeypatch.setenv(
        "NPCINK_CLOUD_RUNTIME_DATA_ENCRYPTION_SECRET",
        CURRENT_ROOT,
    )
    monkeypatch.setenv(
        "NPCINK_CLOUD_RUNTIME_DATA_ENCRYPTION_KEY_ID",
        "runtime-key-2026-07",
    )
    monkeypatch.setenv("OLD_RUNTIME_DATA_ROOT_FOR_TEST", LEGACY_ROOT)

    assert (
        reencryption_cli_main(
            [
                "inventory",
                "--old-key-id",
                OLD_RDE_KEY_ID,
            ]
        )
        == 0
    )
    inventory_output = capsys.readouterr()
    assert '"legacy": 5' in inventory_output.out
    assert inventory_output.err == ""

    assert (
        reencryption_cli_main(
            [
                "dry-run",
                "--old-root-env",
                "OLD_RUNTIME_DATA_ROOT_FOR_TEST",
                "--old-key-id",
                OLD_RDE_KEY_ID,
            ]
        )
        == 0
    )

    captured = capsys.readouterr()
    assert '"would_migrate": 5' in captured.out
    assert LEGACY_ROOT not in captured.out
    assert captured.err == ""
    assert _read_all_five_ciphertexts(migration_database) == original


def test_migrated_ciphertexts_remain_purpose_bound(migration_database: str) -> None:
    _seed_all_five_legacy_ciphertexts(migration_database)
    settings = _settings(migration_database)
    apply_runtime_data_reencryption(
        migration_database,
        settings=settings,
        legacy_root_secrets=(LEGACY_ROOT,),
        maintenance_confirmed=True,
    )
    migrated = _read_all_five_ciphertexts(migration_database)

    assert (
        decrypt_runtime_data_plaintext(
            migrated["runtime_execution_input"],
            purpose=RUN_INPUT_PURPOSE,
            settings=settings,
        )
        == b'{"prompt":"hello"}'
    )
    with pytest.raises(RuntimeError, match="could not be decrypted"):
        decrypt_runtime_data_plaintext(
            migrated["runtime_execution_input"],
            purpose=SITE_API_KEY_PURPOSE,
            settings=settings,
        )


def _seed_totp_slots(url):
    from app.core.models import PortalTotpFactor
    from app.core.secrets import encrypt_portal_totp_seed

    settings = _settings(url)
    old = settings.model_copy(
        update={
            "runtime_data_encryption_key_id": "old-totp",
            "runtime_data_encryption_secret": base64.urlsafe_b64encode(b"o" * 32).decode(),
        }
    )
    now = datetime.now(UTC)
    with get_session(url) as session:
        session.add(Principal(principal_id="totp", email="totp@example.test"))
        session.flush()
        session.add(
            PortalTotpFactor(
                principal_id="totp",
                factor_version=4,
                state="enabled",
                active_seed_ciphertext=encrypt_portal_totp_seed(b"synthetic-active", settings=old),
                enabled_at=now - timedelta(days=2),
                last_accepted_counter=42,
                recovery_generation=3,
                pending_setup_id="setup",
                pending_seed_ciphertext=encrypt_portal_totp_seed(
                    b"synthetic-pending", settings=settings
                ),
                pending_created_at=now - timedelta(hours=2),
                pending_expires_at=now - timedelta(hours=1),
                created_at=now - timedelta(days=2),
                updated_at=now,
            )
        )
        session.commit()
    return old


def _totp_snapshot(url):
    from sqlalchemy import select

    from app.core.models import PortalTotpFactor

    with get_session(url) as session:
        return tuple(session.execute(select(PortalTotpFactor.__table__)).one())


def test_totp_active_and_expired_pending_inventory_rotation_and_rollback(
    migration_database, monkeypatch
):
    from app.core.models import PortalTotpFactor
    from app.core.secrets import decrypt_portal_totp_seed

    url = migration_database
    old = _seed_totp_slots(url)
    settings = _settings(url)
    before = _totp_snapshot(url)
    mapping = (LegacyRuntimeDataKey("old-totp", old.runtime_data_encryption_secret),)
    inventory = inventory_runtime_data_ciphertexts(
        url, settings=settings, allowed_legacy_envelope_key_ids=frozenset({"old-totp"})
    )
    assert (inventory.total, inventory.current, inventory.legacy) == (2, 1, 1)
    assert inventory.counts_by_kind["portal_totp_pending_seed"]["total"] == 1
    assert inventory.counts_by_kind["portal_totp_active_seed"]["legacy"] == 1
    dry = dry_run_runtime_data_reencryption(
        url, settings=settings, legacy_root_secrets=(), legacy_envelope_keys=mapping
    )
    assert dry.would_migrate == 1 and _totp_snapshot(url) == before
    real_set = reencryption_module._set_ciphertext
    with monkeypatch.context() as injected:

        def fail_after_write(record, ciphertext):
            real_set(record, ciphertext)
            from sqlalchemy.orm import object_session

            object_session(record.owner).flush()
            raise RuntimeError("synthetic write failure")

        injected.setattr(reencryption_module, "_set_ciphertext", fail_after_write)
        with pytest.raises(RuntimeDataReencryptionError, match="re-encryption failed"):
            apply_runtime_data_reencryption(
                url,
                settings=settings,
                legacy_root_secrets=(),
                legacy_envelope_keys=mapping,
                maintenance_confirmed=True,
            )
    assert _totp_snapshot(url) == before
    applied = apply_runtime_data_reencryption(
        url,
        settings=settings,
        legacy_root_secrets=(),
        legacy_envelope_keys=mapping,
        maintenance_confirmed=True,
    )
    assert (applied.total, applied.current, applied.migrated) == (2, 2, 1)
    assert verify_runtime_data_ciphertexts(url, settings=settings).current == 2
    with get_session(url) as session:
        row = session.get(PortalTotpFactor, "totp")
        assert (
            decrypt_portal_totp_seed(row.active_seed_ciphertext, settings=settings)
            == b"synthetic-active"
        )
        assert (
            decrypt_portal_totp_seed(row.pending_seed_ciphertext, settings=settings)
            == b"synthetic-pending"
        )
        assert (row.factor_version, row.last_accepted_counter, row.recovery_generation) == (
            4,
            42,
            3,
        )
    after = _totp_snapshot(url)
    assert [value for index, value in enumerate(before) if index != 3] == [
        value for index, value in enumerate(after) if index != 3
    ]


@pytest.mark.parametrize(
    "damage",
    [
        "new_missing_table",
        "partial_old",
        "missing_column",
        "unknown_revision",
        "multiple_revisions",
        "unversioned_missing",
    ],
)
def test_totp_inventory_rejects_damaged_or_ambiguous_schema(migration_database, damage):
    from sqlalchemy import text

    url = migration_database
    with get_session(url) as session:
        if damage != "unversioned_missing":
            session.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(64))"))
            revision = (
                "20261024_0090"
                if damage == "partial_old"
                else ("unknown" if damage == "unknown_revision" else "20261024_0091")
            )
            session.execute(
                text("INSERT INTO alembic_version VALUES (:revision)"), {"revision": revision}
            )
            if damage == "multiple_revisions":
                session.execute(text("INSERT INTO alembic_version VALUES ('20261024_0090')"))
        if damage == "missing_column":
            # Dropping an unconstrained contract column avoids SQLite DDL/check coupling.
            session.execute(
                text("ALTER TABLE portal_auth_challenges DROP COLUMN primary_authenticated_at")
            )
        elif damage not in ("unknown_revision", "multiple_revisions"):
            session.execute(text("DROP TABLE portal_recovery_codes"))
        session.commit()
    with pytest.raises(RuntimeDataReencryptionError):
        inventory_runtime_data_ciphertexts(url, settings=_settings(url))


def test_totp_inventory_known_0068_missing_tables_is_legal(migration_database):
    from sqlalchemy import text

    url = migration_database
    with get_session(url) as session:
        # Emulate only the additive T1/0090 absence; real0068 proof is the independent PG suite.
        for table in (
            "portal_auth_challenges",
            "portal_recovery_codes",
            "portal_totp_factors",
            "portal_sessions",
        ):
            session.execute(text(f"DROP TABLE {table}"))
        session.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(64))"))
        session.execute(text("INSERT INTO alembic_version VALUES ('20260717_0068')"))
        session.commit()
    report = inventory_runtime_data_ciphertexts(url, settings=_settings(url))
    assert report.total == 0
    assert report.counts_by_kind["portal_totp_active_seed"]["total"] == 0
    assert report.counts_by_kind["portal_totp_pending_seed"]["total"] == 0


@pytest.mark.parametrize(
    "invalid", ["wrong_purpose", "empty_plaintext", "unknown_key", "unversioned"]
)
def test_totp_seed_maintenance_rejects_invalid_ciphertext(migration_database, invalid):
    from app.core.models import PortalTotpFactor
    from app.core.secrets import encrypt_runtime_data_plaintext

    url = migration_database
    _seed_totp_slots(url)
    settings = _settings(url)
    if invalid == "wrong_purpose":
        ciphertext = encrypt_runtime_data_plaintext(
            b"synthetic", purpose="portal_idempotency_response", settings=settings
        )
    elif invalid == "empty_plaintext":
        ciphertext = encrypt_runtime_data_plaintext(
            b"", purpose="portal_totp_seed", settings=settings
        )
    elif invalid == "unknown_key":
        ciphertext = encrypt_runtime_data_plaintext(
            b"synthetic",
            purpose="portal_totp_seed",
            settings=settings.model_copy(update={"runtime_data_encryption_key_id": "unknown"}),
        )
    else:
        ciphertext = "synthetic-unversioned-fernet"
    with get_session(url) as session:
        row = session.get(PortalTotpFactor, "totp")
        row.active_seed_ciphertext = ciphertext
        session.commit()
    with pytest.raises(RuntimeDataReencryptionError):
        verify_runtime_data_ciphertexts(url, settings=settings)


def test_totp_schema_gate_rejects_all_missing_at_new_revision(migration_database):
    from sqlalchemy import text

    url = migration_database
    with get_session(url) as session:
        for table in (
            "portal_auth_challenges",
            "portal_recovery_codes",
            "portal_totp_factors",
            "portal_sessions",
        ):
            session.execute(text(f"DROP TABLE {table}"))
        session.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(64))"))
        session.execute(text("INSERT INTO alembic_version VALUES ('20261024_0091')"))
        session.commit()
    with pytest.raises(RuntimeDataReencryptionError, match="missing"):
        inventory_runtime_data_ciphertexts(url, settings=_settings(url))


def test_totp_inventory_rejects_empty_existing_revision_marker(migration_database):
    from sqlalchemy import text

    with get_session(migration_database) as session:
        session.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(64))"))
        session.commit()
    with pytest.raises(RuntimeDataReencryptionError, match="schema revision"):
        inventory_runtime_data_ciphertexts(
            migration_database, settings=_settings(migration_database)
        )


def test_totp_both_seed_slots_rotate_and_keep_pending_metadata(migration_database):
    from app.core.models import PortalTotpFactor
    from app.core.secrets import decrypt_portal_totp_seed, encrypt_portal_totp_seed

    url = migration_database
    old = _seed_totp_slots(url)
    settings = _settings(url)
    with get_session(url) as session:
        row = session.get(PortalTotpFactor, "totp")
        row.pending_seed_ciphertext = encrypt_portal_totp_seed(b"synthetic-pending", settings=old)
        metadata = row.pending_setup_id, row.pending_created_at, row.pending_expires_at
        session.commit()
    mapping = (LegacyRuntimeDataKey("old-totp", old.runtime_data_encryption_secret),)
    report = apply_runtime_data_reencryption(
        url,
        settings=settings,
        legacy_root_secrets=(),
        legacy_envelope_keys=mapping,
        maintenance_confirmed=True,
    )
    assert report.migrated == 2 and report.current == 2
    assert report.counts_by_kind["portal_totp_pending_seed"]["migrated"] == 1
    with get_session(url) as session:
        row = session.get(PortalTotpFactor, "totp")
        assert (
            decrypt_portal_totp_seed(row.active_seed_ciphertext, settings=settings)
            == b"synthetic-active"
        )
        assert (
            decrypt_portal_totp_seed(row.pending_seed_ciphertext, settings=settings)
            == b"synthetic-pending"
        )
        assert row.pending_setup_id == metadata[0]
        # SQLite timezone representation differs after readback; compare canonical instants.
        assert row.pending_created_at.replace(tzinfo=UTC) == metadata[1].replace(tzinfo=UTC)
        assert row.pending_expires_at.replace(tzinfo=UTC) == metadata[2].replace(tzinfo=UTC)
