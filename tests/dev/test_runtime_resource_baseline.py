from __future__ import annotations

import argparse
import io
import json

import pytest

from scripts import runtime_resource_baseline as baseline


@pytest.mark.parametrize("cache_key", ["total_inactive_file", "inactive_file", "cache"])
def test_memory_accounts_for_cache_without_losing_raw_usage(cache_key: str) -> None:
    result = baseline.resource_stats(
        {"memory_stats": {"usage": 1000, "stats": {cache_key: 200, "anon": 700}}}, None
    )
    assert result["working_memory_bytes"] == 800
    assert result["raw_memory_bytes"] == 1000
    assert result["anon_or_rss_bytes"] == 700
    assert result["cpu_percent"] is None
    assert result["kernel_lifetime_peak_bytes"] is None


def test_cpu_uses_sample_deltas_and_online_cpu_count() -> None:
    previous = {"cpu_stats": {"system_cpu_usage": 1000, "cpu_usage": {"total_usage": 100}}}
    raw = {
        "cpu_stats": {"system_cpu_usage": 2000, "cpu_usage": {"total_usage": 350}, "online_cpus": 4}
    }
    assert baseline.resource_stats(raw, previous)["cpu_percent"] == 100


def test_cache_counter_exceeding_usage_does_not_hide_memory() -> None:
    raw = {"memory_stats": {"usage": 100, "stats": {"inactive_file": 200}}}
    assert baseline.resource_stats(raw, None)["working_memory_bytes"] == 100


def sample(first: int, second: int, elapsed: float) -> dict:
    containers = []
    for service, memory in (("api", first), ("postgres", second)):
        containers.append(
            {
                "service": service,
                "id": service,
                "working_memory_bytes": memory,
                "raw_memory_bytes": memory + 10,
                "cpu_percent": None,
                "restart_count": 0,
                "oom_killed": False,
                "health": "healthy",
            }
        )
    return {
        "type": "sample",
        "elapsed_seconds": elapsed,
        "containers": containers,
        "host": {"available_bytes": None},
        "collection_seconds": 0.1,
        "stack_working_bytes": first + second,
    }


def test_stack_peak_uses_coincident_samples_and_separates_database() -> None:
    report = baseline.summarize(
        [
            {"type": "metadata", "project": "test", "deployment": {}, "duration_seconds": 5},
            sample(100, 10, 0),
            sample(10, 100, 5),
            {"type": "end", "complete": True, "samples": 2},
        ]
    )
    assert report["stack_working_bytes"]["observed_max"] == 110
    assert sum(row["working_bytes"]["observed_max"] for row in report["containers"]) == 200
    assert report["application_working_bytes_excluding_postgres"]["observed_max"] == 100
    assert report["minimum_operator_host_available_bytes"] is None
    assert report["complete"] is True


def test_partial_capture_preserves_samples_and_marks_incomplete() -> None:
    report = baseline.summarize(
        [
            sample(100, 10, 0),
            {"type": "error", "code": "runtime_identity_changed"},
            {"type": "end", "complete": False},
        ]
    )
    assert report["samples"] == 1
    assert report["complete"] is False
    assert report["errors"] == ["runtime_identity_changed"]


def test_deployment_state_only_emits_allowlisted_fields(tmp_path) -> None:
    path = tmp_path / "state"
    path.write_text("source_revision=abc\nsource_dirty=true\nAPI_KEY=do-not-emit\n")
    assert baseline.deployment_state(str(path)) == {
        "source_revision": "abc",
        "source_dirty": "true",
    }


def test_inventory_projection_does_not_emit_config_or_health_logs() -> None:
    class Client:
        def api(self, path):
            if path.startswith("/containers/json?"):
                return [
                    {"Id": service, "Labels": {"com.docker.compose.service": service}}
                    for service in baseline.REQUIRED
                ]
            return {
                "Image": "sha256:image",
                "State": {
                    "Status": "running",
                    "StartedAt": "now",
                    "Health": {"Status": "healthy", "Log": ["secret-result"]},
                },
                "Config": {"Cmd": ["uvicorn", "--reload"], "Env": ["API_KEY=secret"]},
            }

    rows = baseline.inventory(Client(), "test")
    rendered = json.dumps(rows)
    assert "secret" not in rendered
    assert all(row["reload_enabled"] for row in rows)


def test_agent_stops_when_runtime_identity_changes(monkeypatch, capsys) -> None:
    initial = [{"id": "api", "image_id": "old", "started_at": "now", "restart_count": 0}]
    changed = [{**initial[0], "image_id": "new"}]
    inventories = iter([initial, changed])

    class Client:
        def api(self, path):
            return {}

    monkeypatch.setattr(baseline, "DockerReadClient", Client)
    monkeypatch.setattr(baseline, "inventory", lambda *_: next(inventories))
    args = argparse.Namespace(
        project="test", scenario="passive", state_file=None, duration_seconds=1, interval_seconds=1
    )
    assert baseline.agent(args) == 1
    records = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert records[-2]["code"] == "runtime_identity_changed"
    assert records[-1]["complete"] is False
    assert records[-1]["samples"] == 0


def test_ongoing_summary_ignores_only_unfinished_last_record(tmp_path) -> None:
    path = tmp_path / "samples.jsonl"
    path.write_text(json.dumps(sample(100, 10, 0)) + '\n{"type": "sample"')
    report = baseline.save_summary(path)
    assert report["samples"] == 1
    assert report["complete"] is False
    path.write_text('{"broken":}\n')
    with pytest.raises(json.JSONDecodeError):
        baseline.save_summary(path)


@pytest.mark.parametrize("agent_exit", [0, 1])
def test_local_collection_honors_explicit_docker_context_directory(
    monkeypatch, tmp_path, agent_exit
) -> None:
    seen = {}

    class Process:
        def __init__(self, command, **options):
            seen.update(options)
            self.stdin = io.StringIO()
            self.stdout = io.StringIO(
                json.dumps({"type": "metadata", "duration_seconds": 1})
                + "\n"
                + json.dumps(sample(100, 10, 1))
                + '\n{"type":"end","complete":true,"samples":1}\n'
            )

        def wait(self, **_options):
            return agent_exit

        def poll(self):
            return 0

    monkeypatch.setattr(baseline.subprocess, "Popen", Process)
    monkeypatch.setenv("DOCKER_HOST", "unix:///existing-context.sock")
    args = argparse.Namespace(
        output_dir=str(tmp_path / "observation"),
        project="test",
        scenario="passive",
        duration_seconds=1,
        interval_seconds=1,
        state_file=None,
        ssh_host=None,
        docker_config="/explicit/context",
    )
    assert baseline.collect(args) == agent_exit
    report = json.loads((tmp_path / "observation" / "summary.json").read_text())
    assert report["complete"] is (agent_exit == 0)
    assert report["samples"] == 1
    assert seen["env"]["DOCKER_CONFIG"] == "/explicit/context"
    assert seen["env"]["DOCKER_HOST"] == "unix:///existing-context.sock"


@pytest.mark.parametrize("project", ["--all", "example;touch-bad", "example/other"])
def test_cli_rejects_project_injection(monkeypatch, project: str) -> None:
    monkeypatch.setattr(
        baseline.sys,
        "argv",
        ["script", "collect", "--project=" + project, "--output-dir", "unused"],
    )
    with pytest.raises(SystemExit) as error:
        baseline.parse_args()
    assert error.value.code == 2


def test_summary_rejects_success_footer_after_error() -> None:
    report = baseline.summarize(
        [
            {"type": "metadata", "duration_seconds": 1},
            sample(100, 10, 1),
            {"type": "error", "code": "transport_failed"},
            {"type": "end", "complete": True, "samples": 1},
        ]
    )
    assert report["complete"] is False


@pytest.mark.parametrize("missing", ["metadata", "sample", "count", "duration"])
def test_summary_requires_a_complete_capture(missing: str) -> None:
    records = [
        {"type": "metadata", "duration_seconds": 5},
        sample(100, 10, 5),
        {"type": "end", "complete": True, "samples": 1},
    ]
    if missing == "metadata":
        records.pop(0)
    elif missing == "sample":
        records.pop(1)
    elif missing == "count":
        records[-1]["samples"] = 2
    else:
        records[0]["duration_seconds"] = 10
    assert baseline.summarize(records)["complete"] is False


def test_missing_cpu_and_network_counters_are_unmeasured() -> None:
    previous = {"cpu_stats": {"system_cpu_usage": 100, "cpu_usage": {"total_usage": 50}}}
    raw = {"cpu_stats": {"system_cpu_usage": 200, "online_cpus": 2}}
    stats = baseline.resource_stats(raw, previous)
    assert stats["cpu_percent"] is None
    assert stats["network_rx_bytes"] is None
    assert stats["network_tx_bytes"] is None


def test_truncated_record_after_end_does_not_report_success(tmp_path) -> None:
    records = [
        {"type": "metadata", "duration_seconds": 1},
        sample(100, 10, 1),
        {"type": "end", "complete": True, "samples": 1},
    ]
    path = tmp_path / "samples.jsonl"
    path.write_text("".join(json.dumps(row) + "\n" for row in records) + '{"type":')
    assert baseline.save_summary(path)["complete"] is False


def test_agent_waits_between_samples_and_covers_deadline(monkeypatch, capsys) -> None:
    class Clock:
        now = 0.0
        waits = []

        def monotonic(self):
            return self.now

        def sleep(self, seconds):
            assert seconds > 0
            self.waits.append(seconds)
            self.now += seconds

    class Client:
        def api(self, path):
            return {"memory_stats": {"usage": 100}}

    clock = Clock()
    rows = [{"id": "api", "image_id": "old", "started_at": "now", "restart_count": 0}]
    monkeypatch.setattr(baseline.time, "monotonic", clock.monotonic)
    monkeypatch.setattr(baseline.time, "sleep", clock.sleep)
    monkeypatch.setattr(baseline, "DockerReadClient", Client)
    monkeypatch.setattr(baseline, "inventory", lambda *_: rows)
    monkeypatch.setattr(baseline, "host_memory", lambda: {})
    args = argparse.Namespace(
        project="test",
        scenario="passive",
        state_file=None,
        duration_seconds=900,
        interval_seconds=5,
    )
    assert baseline.agent(args) == 0
    records = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    samples = [row for row in records if row["type"] == "sample"]
    assert len(samples) == 181
    assert [row["elapsed_seconds"] for row in samples] == list(range(0, 901, 5))
    assert clock.waits == [5] * 180


@pytest.mark.parametrize("status", [200, 503])
def test_docker_reader_uses_only_get_and_closes_connection(monkeypatch, status) -> None:
    seen = []

    class Connection:
        def __init__(self, path):
            assert path == "/fake/docker.sock"

        def request(self, method, path):
            seen.append((method, path))

        def getresponse(self):
            return self

        @property
        def status(self):
            return status

        def read(self, maximum):
            assert maximum == 8 * 1024 * 1024 + 1
            return b'{"ApiVersion":"1.45"}'

        def close(self):
            seen.append("closed")

    monkeypatch.setattr(baseline, "UnixConnection", Connection)
    client = baseline.DockerReadClient.__new__(baseline.DockerReadClient)
    client.path = "/fake/docker.sock"
    if status == 200:
        assert client.get("/version") == {"ApiVersion": "1.45"}
    else:
        with pytest.raises(baseline.CollectionError, match="^docker_read_failed$"):
            client.get("/version")
    assert seen == [("GET", "/version"), "closed"]


def test_agent_redacts_raw_transport_failure(monkeypatch, capsys) -> None:
    def fail():
        raise OSError("credential=must-not-appear")

    monkeypatch.setattr(baseline, "DockerReadClient", fail)
    assert baseline.agent(argparse.Namespace()) == 1
    output = capsys.readouterr().out
    assert "credential" not in output
    records = [json.loads(line) for line in output.splitlines()]
    assert records[0]["code"] == "resource_collection_failed"
    assert records[-1]["complete"] is False


@pytest.mark.parametrize("interval", ["0", "nan", "inf", "61"])
def test_cli_rejects_unbounded_or_zero_intervals(monkeypatch, interval) -> None:
    monkeypatch.setattr(
        baseline.sys,
        "argv",
        [
            "script",
            "collect",
            "--project=test",
            "--output-dir=unused",
            "--interval-seconds=" + interval,
        ],
    )
    with pytest.raises(SystemExit) as error:
        baseline.parse_args()
    assert error.value.code == 2


def test_cli_defaults_to_fifteen_minute_validation(monkeypatch) -> None:
    monkeypatch.setattr(
        baseline.sys,
        "argv",
        [
            "script",
            "collect",
            "--project=test",
            "--output-dir=unused",
        ],
    )
    args = baseline.parse_args()
    assert args.duration_seconds == 900
    assert args.interval_seconds == 5
