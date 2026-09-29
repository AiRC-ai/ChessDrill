"""Publish one signed Chess Studio App Bundle to Google Play internal testing.

Credentials come from a GitHub environment secret and are never written to disk.
The only release track this script can change is internal testing.
"""

import argparse
import json
import os
from pathlib import Path
from urllib.parse import quote


PACKAGE = "com.leglerisaac.chessstudio"
API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}"
UPLOAD_API = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PACKAGE}"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"


def publish_bundle(session, bundle: Path, name: str, notes: str) -> int:
    """Create an edit, upload the bundle, assign it to internal, then commit."""
    response = session.post(f"{API}/edits", json={}, timeout=30)
    response.raise_for_status()
    edit_id = quote(str(response.json()["id"]), safe="")

    with bundle.open("rb") as artifact:
        response = session.post(
            f"{UPLOAD_API}/edits/{edit_id}/bundles",
            params={"uploadType": "media"},
            headers={"Content-Type": "application/octet-stream"},
            data=artifact,
            timeout=300,
        )
    response.raise_for_status()
    version_code = int(response.json()["versionCode"])
    if not 1 <= version_code < 2_100_000_000:
        raise ValueError("Play returned an invalid bundle version code")

    release = {
        "name": name,
        "versionCodes": [str(version_code)],
        "status": "completed",
        "releaseNotes": [{"language": "en-US", "text": notes[:500]}],
    }
    response = session.put(
        f"{API}/edits/{edit_id}/tracks/internal",
        json={"track": "internal", "releases": [release]},
        timeout=30,
    )
    response.raise_for_status()

    # A pending Play review must not be silently cancelled by a later CI build.
    response = session.post(
        f"{API}/edits/{edit_id}:commit",
        params={"changesInReviewBehavior": "ERROR_IF_IN_REVIEW"},
        timeout=30,
    )
    response.raise_for_status()
    return version_code


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--notes", default="Chess Studio improvements and fixes.")
    args = parser.parse_args()

    if not args.bundle.is_file() or args.bundle.stat().st_size == 0:
        parser.error("--bundle must point to a nonempty signed App Bundle")
    credentials_json = os.environ.get("PLAY_SERVICE_ACCOUNT_JSON")
    if not credentials_json:
        parser.error("PLAY_SERVICE_ACCOUNT_JSON is missing")

    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account

    credentials = service_account.Credentials.from_service_account_info(
        json.loads(credentials_json), scopes=[SCOPE]
    )
    version_code = publish_bundle(
        AuthorizedSession(credentials), args.bundle, args.name, args.notes
    )
    print(f"Published Chess Studio version code {version_code} to Play internal testing.")


if __name__ == "__main__":
    main()
