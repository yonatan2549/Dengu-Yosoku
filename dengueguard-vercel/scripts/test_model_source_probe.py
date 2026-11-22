from __future__ import annotations

import json
import unittest
from urllib.error import URLError
from urllib.request import Request

from scripts.check_model_source import ARTIFACTS, REPOSITORY, probe_model_source
from scripts.fetch_model_outputs import REPOSITORY as FETCH_REPOSITORY

COMMIT = "a" * 40


class FakeResponse:
    def __init__(self, status=200, body=b"", headers=None):
        self.status = status
        self._body = body
        self.headers = headers or {}
        self.read_calls = 0
        self.closed = False

    def getcode(self):
        return self.status

    def read(self):
        self.read_calls += 1
        return self._body

    def close(self):
        self.closed = True


class FakeOpener:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []
        self.response_objects = []

    def __call__(self, request: Request, timeout=0):
        self.requests.append((request, timeout))
        if not self.responses:
            raise AssertionError("unexpected HTTP request")
        next_item = self.responses.pop(0)
        if isinstance(next_item, Exception):
            raise next_item
        self.response_objects.append(next_item)
        return next_item


def commit_response(sha=COMMIT):
    return FakeResponse(200, json.dumps({"sha": sha}).encode())


class ModelSourceProbeTests(unittest.TestCase):
    def test_probe_uses_the_canonical_repository_shared_with_the_downloader(self):
        self.assertEqual(REPOSITORY, "johnlovepizza/DenguYosoku")
        self.assertEqual(REPOSITORY, FETCH_REPOSITORY)

    def test_reports_available_when_all_pinned_artifacts_exist(self):
        opener = FakeOpener([
            commit_response(),
            FakeResponse(200, headers={"Content-Length": "123"}),
            FakeResponse(200, headers={"Content-Length": "456"}),
            FakeResponse(200, headers={"Content-Length": "789"}),
        ])
        report = probe_model_source(ref="main", opener=opener)
        self.assertEqual(report["status"], "available")
        self.assertEqual(report["repository"], REPOSITORY)
        self.assertEqual(report["commit_sha"], COMMIT)
        self.assertEqual(len(report["artifacts"]), 3)
        self.assertTrue(all(item["status"] == "available" for item in report["artifacts"]))
        self.assertFalse(report["downloaded_contents"])
        self.assertFalse(report["wrote_files"])

    def test_pins_artifact_head_requests_to_resolved_commit_sha(self):
        opener = FakeOpener([
            commit_response(),
            FakeResponse(200), FakeResponse(200), FakeResponse(200),
        ])
        probe_model_source(ref="main", opener=opener)
        artifact_requests = [item[0] for item in opener.requests[1:]]
        self.assertEqual([request.get_method() for request in artifact_requests], ["HEAD"] * 3)
        for (source_path, _), request in zip(ARTIFACTS, artifact_requests):
            self.assertTrue(request.full_url.endswith(f"/{COMMIT}/{source_path}"))

    def test_url_encodes_git_refs_with_slashes(self):
        opener = FakeOpener([
            commit_response(),
            FakeResponse(200), FakeResponse(200), FakeResponse(200),
        ])
        probe_model_source(ref="feature/model-refresh", opener=opener)
        self.assertIn("/commits/feature%2Fmodel-refresh", opener.requests[0][0].full_url)

    def test_reports_missing_when_one_artifact_path_is_404(self):
        opener = FakeOpener([
            commit_response(),
            FakeResponse(200), FakeResponse(404), FakeResponse(200),
        ])
        report = probe_model_source(ref="main", opener=opener)
        self.assertEqual(report["status"], "missing")
        self.assertEqual(report["artifacts"][1]["status"], "missing")

    def test_reports_unavailable_not_missing_for_permission_or_rate_limit_errors(self):
        opener = FakeOpener([
            commit_response(),
            FakeResponse(200), FakeResponse(403), FakeResponse(200),
        ])
        report = probe_model_source(ref="main", opener=opener)
        self.assertEqual(report["status"], "unavailable")
        self.assertEqual(report["artifacts"][1]["status"], "unavailable")

    def test_reports_missing_when_repository_or_ref_is_not_found(self):
        opener = FakeOpener([FakeResponse(404)])
        report = probe_model_source(ref="not-a-branch", opener=opener)
        self.assertEqual(report["status"], "missing")
        self.assertIsNone(report["commit_sha"])
        self.assertEqual(report["http_status"], 404)
        self.assertEqual(len(opener.requests), 1)

    def test_rejects_invalid_commit_sha_without_probing_artifacts(self):
        opener = FakeOpener([commit_response("not-a-sha")])
        report = probe_model_source(ref="main", opener=opener)
        self.assertEqual(report["status"], "invalid")
        self.assertEqual(report["artifacts"], [])
        self.assertEqual(len(opener.requests), 1)

    def test_reports_unavailable_when_commit_api_cannot_be_reached(self):
        opener = FakeOpener([URLError("network offline")])
        report = probe_model_source(ref="main", opener=opener)
        self.assertEqual(report["status"], "unavailable")
        self.assertIn("network offline", report["message"])
        self.assertEqual(len(opener.requests), 1)

    def test_rejects_blank_git_ref_without_network_access(self):
        opener = FakeOpener([])
        report = probe_model_source(ref="   ", opener=opener)
        self.assertEqual(report["status"], "invalid")
        self.assertEqual(len(opener.requests), 0)

    def test_head_probe_does_not_read_artifact_response_bodies(self):
        artifact_responses = [FakeResponse(200), FakeResponse(200), FakeResponse(200)]
        opener = FakeOpener([commit_response(), *artifact_responses])
        probe_model_source(ref="main", opener=opener)
        self.assertEqual([item.read_calls for item in artifact_responses], [0, 0, 0])

    def test_artifact_network_failure_is_unavailable_and_does_not_stop_other_probes(self):
        opener = FakeOpener([
            commit_response(),
            URLError("one endpoint offline"),
            FakeResponse(200),
            FakeResponse(200),
        ])
        report = probe_model_source(ref="main", opener=opener)
        self.assertEqual(report["status"], "unavailable")
        self.assertEqual(report["artifacts"][0]["status"], "unavailable")
        self.assertEqual(report["artifacts"][1]["status"], "available")
        self.assertEqual(len(opener.requests), 4)


if __name__ == "__main__":
    unittest.main()
