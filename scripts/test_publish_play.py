"""Protect the order and scope of the Play release transaction."""

import tempfile
import unittest
from pathlib import Path

from publish_play import PACKAGE, publish_bundle


class Response:
    def __init__(self, value=None, error=None):
        self.value = value or {}
        self.error = error

    def json(self):
        return self.value

    def raise_for_status(self):
        if self.error:
            raise self.error


class Session:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append(("post", url, kwargs))
        return next(self.responses)

    def put(self, url, **kwargs):
        self.calls.append(("put", url, kwargs))
        return next(self.responses)


class PublishPlayTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.bundle = Path(self.directory.name) / "signed.aab"
        self.bundle.write_bytes(b"sample bundle")

    def test_internal_release_is_committed_only_after_upload_and_track_update(self):
        session = Session(
            [Response({"id": "17"}), Response({"versionCode": 100011}), Response(), Response()]
        )
        code = publish_bundle(session, self.bundle, "Chess Studio 1.1", "Better lessons")
        self.assertEqual(code, 100011)
        self.assertEqual([call[0] for call in session.calls], ["post", "post", "put", "post"])
        self.assertEqual(session.calls[1][2]["data"].name, str(self.bundle))
        self.assertEqual(session.calls[1][2]["params"], {"uploadType": "media"})
        self.assertTrue(session.calls[2][1].endswith("/tracks/internal"))
        release = session.calls[2][2]["json"]["releases"][0]
        self.assertEqual(release["versionCodes"], ["100011"])
        self.assertEqual(release["status"], "completed")
        self.assertEqual(session.calls[3][2]["params"], {"changesInReviewBehavior": "ERROR_IF_IN_REVIEW"})

    def test_publishing_target_matches_android_application_id(self):
        gradle = (Path(__file__).resolve().parent.parent / "android/app/build.gradle").read_text()
        self.assertIn(f"applicationId '{PACKAGE}'", gradle)

    def test_failed_upload_does_not_change_track_or_commit(self):
        session = Session([Response({"id": "17"}), Response(error=RuntimeError("upload failed"))])
        with self.assertRaisesRegex(RuntimeError, "upload failed"):
            publish_bundle(session, self.bundle, "Chess Studio 1.1", "Updates")
        self.assertEqual(len(session.calls), 2)

    def test_invalid_version_code_does_not_change_track_or_commit(self):
        session = Session([Response({"id": "17"}), Response({"versionCode": 0})])
        with self.assertRaisesRegex(ValueError, "version code"):
            publish_bundle(session, self.bundle, "Chess Studio 1.1", "Updates")
        self.assertEqual(len(session.calls), 2)


if __name__ == "__main__":
    unittest.main()
