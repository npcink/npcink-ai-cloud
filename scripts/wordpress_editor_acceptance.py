#!/usr/bin/env python3
# ruff: noqa: E501
"""Run a bounded, read-only WordPress editor recommendation acceptance check."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


def build_php(post_ids: list[int], limit: int) -> str:
    ids = json.dumps(post_ids, ensure_ascii=False)
    return f'''$requested_ids = {ids};
$limit = {limit};
$admin_ids = get_users(array('role' => 'administrator', 'number' => 1, 'fields' => 'ID'));
if (empty($admin_ids)) {{ fwrite(STDERR, "No administrator is available.\\n"); exit(2); }}
wp_set_current_user((int) $admin_ids[0]);
$posts = array();
if (!empty($requested_ids)) {{
    foreach ($requested_ids as $id) {{ if (get_post((int) $id)) $posts[] = (int) $id; }}
}} else {{
    $posts = array_map('absint', get_posts(array(
        'post_type' => 'post',
        'post_status' => array('draft', 'publish', 'pending', 'future', 'private'),
        'posts_per_page' => $limit,
        'orderby' => 'modified',
        'order' => 'DESC',
        'fields' => 'ids',
    )));
}}
$posts = array_values(array_unique(array_filter($posts)));
if (count($posts) < $limit && empty($requested_ids)) {{
    $extra = get_posts(array('post_type' => 'page', 'post_status' => 'publish', 'posts_per_page' => $limit - count($posts), 'fields' => 'ids'));
    $posts = array_values(array_unique(array_merge($posts, array_map('absint', $extra))));
}}
$snapshot = function(array $ids): array {{
    $out = array();
    foreach ($ids as $id) {{
        $post = get_post($id);
        $out[(string) $id] = $post ? array('modified_gmt' => (string) $post->post_modified_gmt, 'content_hash' => sha1((string) $post->post_content)) : null;
    }}
    return $out;
}};
$before = $snapshot($posts);
$request = function(int $post_id, string $intent) use ($posts): array {{
    $post = get_post($post_id);
    $params = array(
        'intent' => $intent,
        'post_id' => $post_id,
        'post_type' => get_post_type($post),
        'post_status' => get_post_status($post),
        'title' => get_the_title($post),
        'excerpt' => wp_strip_all_tags(get_the_excerpt($post)),
        'content' => wp_strip_all_tags((string) $post->post_content),
        'category_ids' => implode(',', array_map('absint', (array) wp_get_post_categories($post_id))),
        'tag_ids' => implode(',', array_map('absint', (array) wp_get_post_tags($post_id, array('fields' => 'ids')))),
        'featured_media' => absint(get_post_thumbnail_id($post_id)),
        'context_scope' => 'full_article',
    );
    if ('internal_links' === $intent) {{
        $params['selected_text'] = 'Editor acceptance anchor';
        $params['content_blocks'] = array(array('client_id' => 'acceptance-block', 'block_name' => 'core/paragraph', 'text' => 'Editor acceptance anchor.'));
    }}
    $route = 'related_articles' === $intent
        ? '/npcink-toolbox/v1/site-knowledge/search'
        : '/npcink-toolbox/v1/editor/content-support';
    if ('related_articles' === $intent) {{
        $params = array(
            'query'           => trim(get_the_title($post) . ' ' . wp_strip_all_tags((string) $post->post_content)),
            'intent'          => 'related_content',
            'current_post_id' => $post_id,
            'max_results'     => 5,
        );
    }}
    $rest = new WP_REST_Request('POST', $route);
    foreach ($params as $key => $value) $rest->set_param($key, $value);
    $started = microtime(true);
    $response = rest_do_request($rest);
    $elapsed = round((microtime(true) - $started) * 1000, 1);
    $data = $response instanceof WP_Error ? array('error' => $response->get_error_message()) : (array) $response->get_data();
    $section = is_array($data['sections'][$intent] ?? null) ? $data['sections'][$intent] : array();
    $items = is_array($section['items'] ?? null)
        ? $section['items']
        : (is_array($section['recommendation_candidates'] ?? null) ? $section['recommendation_candidates'] : (is_array($data['results'] ?? null) ? $data['results'] : array()));
    $source_knowledge = is_array($section['source_knowledge'] ?? null) ? $section['source_knowledge'] : array();
    $error_code = (string) ($data['code'] ?? '');
    return array(
        'post_id' => $post_id,
        'intent' => $intent,
        'route' => $route,
        'http_status' => (int) $response->get_status(),
        'duration_ms' => $elapsed,
        'provider' => (string) ($data['provider'] ?? ''),
        'status' => (string) ($data['status'] ?? ''),
        'retrieval_status' => (string) ($section['retrieval_status'] ?? ''),
        'source_knowledge_status' => (string) ($source_knowledge['status'] ?? ''),
        'source_status' => (string) ($section['source_status'] ?? ''),
        'candidate_source' => (string) ($section['candidate_source'] ?? ''),
        'candidate_count' => count($items),
        'cloud_result_count' => (int) ($section['cloud_result_count'] ?? 0),
        'fallback_used' => (bool) ($section['fallback_used'] ?? false),
        'direct_wordpress_write' => array_key_exists('direct_wordpress_write', $data) ? (bool) $data['direct_wordpress_write'] : null,
        'error_code' => $error_code,
        'error_message' => (string) ($data['message'] ?? $data['error'] ?? ''),
    );
}};
$results = array();
foreach ($posts as $post_id) {{ foreach (array('related_articles', 'internal_links') as $intent) $results[] = $request($post_id, $intent); }}
$after = $snapshot($posts);
$unchanged = $before === $after;
$report = array('schema_version' => 1, 'status' => $unchanged ? 'passed' : 'failed', 'post_ids' => $posts, 'post_count' => count($posts), 'post_snapshots_unchanged' => $unchanged, 'write_operations' => false, 'results' => $results);
echo "NPCINK_EDITOR_ACCEPTANCE_JSON=" . wp_json_encode($report, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\\n";'''


def main() -> int:
    # pnpm forwards its argument separator; accept it before script options.
    if len(sys.argv) > 1 and sys.argv[1] == "--":
        del sys.argv[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wp-root", default=os.environ.get("NPCINK_WP_ROOT"), required=not os.environ.get("NPCINK_WP_ROOT"))
    parser.add_argument("--wp-cli", default=os.environ.get("NPCINK_WP_CLI_BIN", "/opt/homebrew/bin/wp"))
    parser.add_argument("--php", default=os.environ.get("NPCINK_WP_PHP_BIN", "/opt/homebrew/bin/php"))
    parser.add_argument("--mysql-socket", default=os.environ.get("NPCINK_WP_MYSQL_SOCKET"))
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--post-id", type=int, action="append", default=[])
    parser.add_argument(
        "--allow-explicit-fallback",
        action="store_true",
        help="Accept a clearly labelled local fallback when Cloud returned ready evidence but no usable candidate.",
    )
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 10:
        parser.error("--limit must be between 1 and 10")
    if not Path(args.wp_root).is_dir():
        parser.error(f"WordPress root does not exist: {args.wp_root}")
    command = [args.php, "-d", "display_errors=0"]
    if args.mysql_socket:
        command.extend(["-d", f"mysqli.default_socket={args.mysql_socket}", "-d", f"pdo_mysql.default_socket={args.mysql_socket}"])
    command.extend([args.wp_cli, f"--path={args.wp_root}", "--no-color", "eval", build_php(args.post_id, args.limit)])
    started = time.monotonic()
    completed = subprocess.run(command, check=False, text=True, capture_output=True)
    duration = round(time.monotonic() - started, 3)
    marker = "NPCINK_EDITOR_ACCEPTANCE_JSON="
    payload = next((line[len(marker):] for line in completed.stdout.splitlines() if line.startswith(marker)), None)
    if payload is None:
        print(completed.stderr.strip() or completed.stdout.strip(), file=sys.stderr)
        return completed.returncode or 1
    report: dict[str, Any] = json.loads(payload)
    results = report.get("results", [])
    for result in results:
        result["acceptance_status"], result["acceptance_reason"] = classify_result(
            result,
            allow_explicit_fallback=args.allow_explicit_fallback,
        )
    report["duration_seconds"] = duration
    report["cloud_evidence_count"] = sum(result["acceptance_status"] == "passed_cloud" for result in results)
    report["explicit_fallback_count"] = sum(result["acceptance_status"] == "passed_explicit_fallback" for result in results)
    report["failed_result_count"] = sum(result["acceptance_status"] == "failed" for result in results)
    report["status"] = "passed" if report["failed_result_count"] == 0 and report.get("post_snapshots_unchanged") else "failed"
    report["exit_code"] = completed.returncode
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return completed.returncode if completed.returncode else (0 if report.get("status") == "passed" else 1)


def classify_result(result: dict[str, Any], *, allow_explicit_fallback: bool) -> tuple[str, str]:
    """Classify one result without treating a malformed response as success."""
    status = int(result.get("http_status") or 0)
    if status < 200 or status >= 300:
        return "failed", f"HTTP {status} {result.get('error_code') or 'request_failed'}"
    if result.get("direct_wordpress_write") is not False:
        return "failed", "response did not explicitly declare direct_wordpress_write=false"
    intent = result.get("intent")
    if intent == "related_articles":
        if result.get("provider") != "npcink_cloud" or result.get("status") != "ready":
            return "failed", "related content response lacks ready Cloud provider evidence"
        return "passed_cloud", "site knowledge search returned a ready Cloud result (zero results is valid)"
    if intent == "internal_links":
        if result.get("candidate_source") == "cloud_vector" and result.get("retrieval_status") == "cloud_vector_evidence":
            return "passed_cloud", "editor response returned Cloud vector evidence"
        if (
            allow_explicit_fallback
            and result.get("candidate_source") == "local_fallback"
            and result.get("source_knowledge_status") == "ready"
            and result.get("source_status") == "no_cloud_evidence"
        ):
            return "passed_explicit_fallback", "Cloud knowledge was ready but returned no usable candidate; local fallback is explicit"
        return "failed", "internal-link response lacks Cloud vector evidence or an explicitly allowed ready fallback"
    return "failed", f"unsupported acceptance intent: {intent}"


if __name__ == "__main__":
    raise SystemExit(main())
