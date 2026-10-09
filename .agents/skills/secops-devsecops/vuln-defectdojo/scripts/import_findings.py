#!/usr/bin/env python3
"""Import security scanner findings into DefectDojo via the v2 API.

Supports both initial import and re-import (which auto-closes findings
absent from the latest scan, tracking remediation progress over time).
"""

import argparse
import json
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: 'requests' package required. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Import security scanner output into DefectDojo",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # First import of a Semgrep scan
  %(prog)s --host http://localhost:8080 --api-key TOKEN --engagement-id 1 \\
           --scan-type "Semgrep JSON Report" semgrep.json

  # Re-import after fixes (auto-closes resolved findings)
  %(prog)s --reimport --host $DD_HOST --api-key $DD_API_KEY \\
           --engagement-id 1 --scan-type "Trivy Scan" trivy-new.json

  # Import with verified flag and high minimum severity
  %(prog)s --host $DD_HOST --api-key $DD_API_KEY --engagement-id 1 \\
           --scan-type "ZAP Scan" --verified --minimum-severity High zap.xml

See references/tool-parser-map.md for the complete list of --scan-type values.
        """,
    )
    parser.add_argument("scan_file", type=Path, help="Path to scanner output file")
    parser.add_argument(
        "--host", required=True,
        help="DefectDojo base URL, e.g. http://localhost:8080"
    )
    parser.add_argument(
        "--api-key", required=True,
        help="DefectDojo API v2 token (User → API v2 Key in the UI)"
    )
    parser.add_argument(
        "--engagement-id", type=int, required=True,
        help="ID of the target engagement"
    )
    parser.add_argument(
        "--scan-type", required=True,
        help="DefectDojo parser name (case-sensitive). See references/tool-parser-map.md"
    )
    parser.add_argument(
        "--reimport", action="store_true",
        help="Re-import scan: update existing findings and auto-close resolved ones"
    )
    parser.add_argument(
        "--verified", action="store_true", default=False,
        help="Mark imported findings as verified (default: false)"
    )
    parser.add_argument(
        "--minimum-severity",
        default="Info",
        choices=["Info", "Low", "Medium", "High", "Critical"],
        help="Minimum severity to import (default: Info)"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Print full API response JSON"
    )
    return parser.parse_args()


def import_scan(args):
    host = args.host.rstrip("/")
    endpoint = "reimport-scan" if args.reimport else "import-scan"
    url = f"{host}/api/v2/{endpoint}/"
    headers = {"Authorization": f"Token {args.api_key}"}

    if not args.scan_file.exists():
        print(f"Error: scan file not found: {args.scan_file}", file=sys.stderr)
        return 1

    data = {
        "engagement": args.engagement_id,
        "scan_type": args.scan_type,
        "active": "true",
        "verified": str(args.verified).lower(),
        "minimum_severity": args.minimum_severity,
    }

    if args.reimport:
        data["close_old_findings"] = "true"

    with open(args.scan_file, "rb") as f:
        files = {"file": (args.scan_file.name, f, "application/octet-stream")}
        response = requests.post(url, headers=headers, data=data, files=files, timeout=120)

    if args.verbose:
        print(json.dumps(response.json(), indent=2))

    if response.status_code not in (200, 201):
        print(f"Error: DefectDojo returned HTTP {response.status_code}", file=sys.stderr)
        try:
            print(json.dumps(response.json(), indent=2), file=sys.stderr)
        except Exception:
            print(response.text[:500], file=sys.stderr)
        return 1

    result = response.json()
    action = "Re-imported" if args.reimport else "Imported"

    # Extract test ID — format differs between import and reimport responses
    test = result.get("test", {})
    test_id = test.get("id") if isinstance(test, dict) else test

    findings_created = result.get("findings_created", result.get("new_findings", "n/a"))
    findings_closed = result.get("findings_closed", result.get("closed_findings", "n/a"))
    findings_reactivated = result.get("findings_reactivated", "n/a")

    print(f"{action} '{args.scan_type}' from {args.scan_file.name}")
    print(f"  Test ID         : {test_id}")
    print(f"  Findings new    : {findings_created}")
    if args.reimport:
        print(f"  Findings closed : {findings_closed}")
        print(f"  Reactivated     : {findings_reactivated}")
    print(f"  Engagement      : {host}/engagement/{args.engagement_id}")
    return 0


def main():
    args = parse_args()
    try:
        return import_scan(args)
    except requests.exceptions.ConnectionError:
        print(f"Error: Cannot connect to DefectDojo at {args.host}", file=sys.stderr)
        print("Verify the host URL and that DefectDojo is running.", file=sys.stderr)
        return 1
    except requests.exceptions.Timeout:
        print("Error: Request timed out. DefectDojo may be processing a large file.", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
