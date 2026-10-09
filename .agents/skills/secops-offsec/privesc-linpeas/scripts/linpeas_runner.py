#!/usr/bin/env python3
"""
linpeas_runner.py - LinPEAS execution, output parsing, and structured report generation.

Usage:
    python3 linpeas_runner.py [options]

Options:
    --mode {quick,standard,full}  Scan depth: quick=-s, standard=default, full=-a (default: standard)
    --output PATH                 Output JSON report path (default: linpeas_report.json)
    --linpeas PATH                Path to linpeas.sh (fetches latest if not provided)
    --url URL                     Custom LinPEAS download URL
    --verbose                     Show raw LinPEAS output during scan
    --help                        Show this message

Examples:
    python3 linpeas_runner.py --mode quick --output /tmp/report.json
    python3 linpeas_runner.py --linpeas /opt/linpeas.sh --verbose
    python3 linpeas_runner.py --mode full --output ./findings.json
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


LINPEAS_URL = (
    "https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh"
)

# Severity patterns extracted from LinPEAS ANSI color codes and section headers
SEVERITY_PATTERNS = {
    "critical": [
        r"\[!\]",
        r"99% PE",
        r"95% PE",
        r"NOPASSWD.*ALL",
        r"writable.*\/etc\/passwd",
        r"writable.*\/etc\/shadow",
        r"LD_PRELOAD",
    ],
    "high": [
        r"Interesting.*SUID",
        r"sudo.*-l",
        r"CVE-\d{4}-\d+",
        r"docker.*group",
        r"lxd.*group",
        r"disk.*group",
        r"shadow.*group",
    ],
    "medium": [
        r"writable.*cron",
        r"NFS.*no_root_squash",
        r"\.bash_history",
        r"password.*=",
        r"passwd.*=",
        r"secret.*=",
        r"Capabilities",
    ],
    "info": [
        r"Network interfaces",
        r"Open ports",
        r"Running processes",
        r"Installed packages",
    ],
}

SECTION_HEADERS = [
    "System Information",
    "Sudo",
    "SUID",
    "SGID",
    "Capabilities",
    "Cron",
    "Network",
    "Users & Groups",
    "Interesting Files",
    "Passwords",
    "SSH",
    "Container",
    "Services",
    "Kernel Exploits",
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="LinPEAS runner with structured JSON output",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--mode",
        choices=["quick", "standard", "full"],
        default="standard",
        help="Scan depth (default: standard)",
    )
    parser.add_argument(
        "--output",
        default="linpeas_report.json",
        help="Output JSON report path (default: linpeas_report.json)",
    )
    parser.add_argument(
        "--linpeas",
        help="Path to an existing linpeas.sh binary",
    )
    parser.add_argument(
        "--url",
        default=LINPEAS_URL,
        help="Custom LinPEAS download URL",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print raw LinPEAS output during execution",
    )
    return parser.parse_args()


def fetch_linpeas(url: str, dest: str) -> None:
    """Download linpeas.sh to dest path."""
    print(f"[*] Fetching LinPEAS from {url}", file=sys.stderr)
    try:
        urllib.request.urlretrieve(url, dest)
    except Exception as exc:
        print(f"[!] Failed to download LinPEAS: {exc}", file=sys.stderr)
        sys.exit(1)
    os.chmod(dest, 0o700)
    print(f"[+] LinPEAS saved to {dest}", file=sys.stderr)


def build_linpeas_cmd(linpeas_path: str, mode: str) -> list:
    """Build the linpeas.sh invocation arguments.

    Mode mapping to official LinPEAS flags:
      quick    -> -s  (stealth: skips time-consuming checks, faster execution)
      standard -> (no flags, default behaviour)
      full     -> -a  (all checks except regex; most thorough)
    """
    cmd = ["/bin/bash", linpeas_path]
    if mode == "quick":
        cmd.append("-s")   # stealth/fast — official flag
    elif mode == "full":
        cmd.append("-a")   # all checks
    # standard = no extra flags
    return cmd


def run_linpeas(cmd: list, verbose: bool) -> str:
    """Execute LinPEAS and capture output."""
    print(f"[*] Running: {' '.join(cmd)}", file=sys.stderr)
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env={**os.environ, "TERM": "xterm"},
        )
        lines = []
        for line in process.stdout:
            lines.append(line)
            if verbose:
                print(line, end="", file=sys.stderr)
        process.wait()
        if process.returncode not in (0, 1):
            # LinPEAS exits 1 normally on some systems; anything else is unexpected
            print(
                f"[!] LinPEAS exited with code {process.returncode}",
                file=sys.stderr,
            )
        return "".join(lines)
    except FileNotFoundError:
        print("[!] bash not found — cannot execute LinPEAS", file=sys.stderr)
        sys.exit(1)
    except PermissionError:
        print("[!] Permission denied executing LinPEAS", file=sys.stderr)
        sys.exit(1)


def strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences from output."""
    ansi_escape = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
    return ansi_escape.sub("", text)


def classify_line(line: str) -> str:
    """Return severity classification for a line of LinPEAS output."""
    clean = strip_ansi(line)
    for severity, patterns in SEVERITY_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, clean, re.IGNORECASE):
                return severity
    return "info"


def parse_output(raw: str) -> dict:
    """Parse LinPEAS raw output into structured findings.

    Only critical/high/medium findings are stored — info lines are too
    numerous to be useful in a structured report.
    """
    clean = strip_ansi(raw)
    findings = {"critical": [], "high": [], "medium": []}
    current_section = "General"

    for line in clean.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        # Detect section headers
        for header in SECTION_HEADERS:
            if header.lower() in stripped.lower() and len(stripped) < 80:
                current_section = header
                break

        # Classify and store actionable findings only
        severity = classify_line(line)
        if severity in findings:
            findings[severity].append(
                {"section": current_section, "finding": stripped}
            )

    return findings


def extract_system_info(raw: str) -> dict:
    """Extract basic system metadata from LinPEAS output."""
    clean = strip_ansi(raw)
    info = {}

    patterns = {
        "kernel": r"Linux version ([\d\.\-\w]+)",
        "hostname": r"hostname[:\s]+([\w\.\-]+)",
        "os": r"(?:PRETTY_NAME|NAME)=[\"']?([^\"'\n]+)",
        "arch": r"Architecture:\s+([\w_]+)",
        "current_user": r"Current user:\s+(\S+)",
    }

    for key, pattern in patterns.items():
        match = re.search(pattern, clean, re.IGNORECASE)
        if match:
            info[key] = match.group(1).strip()

    return info


def build_report(findings: dict, system_info: dict, mode: str) -> dict:
    """Assemble the final JSON report."""
    total = sum(len(v) for v in findings.values())
    return {
        "meta": {
            "tool": "privesc-linpeas",
            "version": "0.1.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "scan_mode": mode,
        },
        "system": system_info,
        "summary": {
            "total_findings": total,
            "critical": len(findings["critical"]),
            "high": len(findings["high"]),
            "medium": len(findings["medium"]),
        },
        "findings": findings,
    }


def main():
    args = parse_args()

    # Resolve linpeas.sh path
    cleanup_linpeas = False
    if args.linpeas and Path(args.linpeas).exists():
        linpeas_path = args.linpeas
    else:
        fd, linpeas_path = tempfile.mkstemp(suffix=".sh", prefix="linpeas_")
        os.close(fd)
        fetch_linpeas(args.url, linpeas_path)
        cleanup_linpeas = True

    try:
        cmd = build_linpeas_cmd(linpeas_path, args.mode)
        raw_output = run_linpeas(cmd, args.verbose)

        findings = parse_output(raw_output)
        system_info = extract_system_info(raw_output)
        report = build_report(findings, system_info, args.mode)

        output_path = Path(args.output)
        output_path.write_text(json.dumps(report, indent=2))
        print(f"[+] Report written to {output_path}", file=sys.stderr)

        # Print summary to stdout
        s = report["summary"]
        print(
            f"\nScan Summary ({args.mode} mode):\n"
            f"  Critical : {s['critical']}\n"
            f"  High     : {s['high']}\n"
            f"  Medium   : {s['medium']}\n"
            f"  Total    : {s['total_findings']}"
        )

        # Exit non-zero if critical findings exist
        if s["critical"] > 0:
            sys.exit(2)

    finally:
        if cleanup_linpeas and Path(linpeas_path).exists():
            os.unlink(linpeas_path)


if __name__ == "__main__":
    main()
