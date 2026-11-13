"""Serves a made-up cluster whose states change over time, on :8000/metrics.

Only for the dev stack: it gives the dashboard in provisioning/ something to draw without a cluster.
Every name is invented. The state of everything is a pure function of the wall clock, so the same
schedule can be written as history and then served live:

    python fake_metrics.py --backfill FILE --hours 6   # OpenMetrics history up to now, for promtool
    python fake_metrics.py                             # serve the current state on :8000/metrics
"""

import argparse
import hashlib
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STEP = 15  # seconds between samples, the same as the Prometheus scrape interval

NODES = ["node-a", "node-b", "node-c", "node-d"]
PHASES = ["Pending", "Running", "Succeeded", "Failed", "Unknown"]
# (namespace, deployment, replicas, generation length in seconds, generation offset)
DEPLOYMENTS = [
    ("shop", "storefront", 2, 3 * 3600, 0),
    ("shop", "checkout", 2, 2 * 3600, 1500),
    ("api", "gateway", 2, 5400, 2700),
]
TARGETS = ["api-gateway:9100", "billing:9100", "search:9100", "queue:9100", "mailer:9100"]


def roll(*key: object) -> float:
    """A stable number in [0, 1) for a key: the same key always gives the same number."""
    digest = hashlib.sha256("/".join(map(str, key)).encode()).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def bucket(t: int, size: int, *key: object) -> tuple[int, float]:
    """The bucket of `size` seconds that holds t (offset per key), and a stable roll for it."""
    offset = int(roll("offset", *key) * size)
    b = (t + offset) // size
    return b, roll(b, *key)


# Each function below returns a list of (metric, labels, value) at time t.


def pods(t: int) -> list[tuple[str, dict[str, str], float]]:
    out = []
    for ns, deploy, replicas, gen_len, gen_off in DEPLOYMENTS:
        gen = (t + gen_off) // gen_len
        into = (t + gen_off) % gen_len
        # The previous generation's pods linger 3 minutes into the next one: a rolling update.
        gens = [(gen, into)] + ([(gen - 1, into + gen_len)] if into < 180 else [])
        for g, age in gens:
            for i in range(replicas):
                pod = f"{deploy}-{hashlib.sha256(f'{deploy}{g}'.encode()).hexdigest()[:5]}-{i}"
                if age < 60 + 30 * i:
                    phase = "Pending"
                else:
                    _, r = bucket(t, 600, ns, pod)
                    phase = "Failed" if deploy == "checkout" and r < 0.12 else "Running"
                for p in PHASES:
                    out.append(("kube_pod_status_phase", {"namespace": ns, "pod": pod, "phase": p}, float(p == phase)))
    # A cron job: a new pod every 30 minutes that runs for 4 minutes, then succeeds or fails.
    run = t // 1800
    age = t % 1800
    if age < 900:
        pod = f"nightly-report-{run % 100000}"
        if age < 30:
            phase = "Pending"
        elif age < 240:
            phase = "Running"
        else:
            phase = "Failed" if roll("report", run) < 0.3 else "Succeeded"
        for p in PHASES:
            out.append(("kube_pod_status_phase", {"namespace": "batch", "pod": pod, "phase": p}, float(p == phase)))
    return out


def nodes(t: int) -> list[tuple[str, dict[str, str], float]]:
    out = []
    for node in NODES:
        _, r = bucket(t, 300 if node == "node-c" else 1800, node)
        if node == "node-c":
            status = "false" if r < 0.3 else "unknown" if r < 0.38 else "true"
        else:
            status = "unknown" if r < 0.04 else "true"
        for s in ("true", "false", "unknown"):
            out.append(
                ("kube_node_status_condition", {"node": node, "condition": "Ready", "status": s}, float(s == status))
            )
    return out


def rollouts(t: int) -> list[tuple[str, dict[str, str], float]]:
    """0 complete, 1 progressing, 2 failed: a made-up gauge for value mode."""
    out = []
    for ns, deploy, _, gen_len, gen_off in DEPLOYMENTS:
        into = (t + gen_off) % gen_len
        gen = (t + gen_off) // gen_len
        if into < 240:
            state = 1
        elif into < 1200 and roll("stuck", deploy, gen) < 0.35:
            state = 2
        else:
            state = 0
        out.append(("demo_deployment_rollout_state", {"namespace": ns, "deployment": deploy}, float(state)))
    return out


def targets(t: int) -> list[tuple[str, dict[str, str], float]]:
    """`up` per target; the queue target is sometimes not scraped at all (no data)."""
    out = []
    for target in TARGETS:
        _, r = bucket(t, 1200, target)
        if target == "queue:9100" and r < 0.25:
            continue
        value = 0.0 if r < (0.25 if target == "search:9100" else 0.04) else 1.0
        out.append(("demo_target_up", {"instance": target}, value))
    return out


SOURCES = [pods, nodes, rollouts, targets]
SCRAPE_LABELS = {"job": "fake-metrics", "instance": "fake-metrics:8000"}


def label_text(labels: dict[str, str]) -> str:
    return ",".join(f'{k}="{v}"' for k, v in labels.items())


def exposition(t: int) -> str:
    lines = []
    seen = set()
    for source in SOURCES:
        for metric, labels, value in source(t):
            if metric not in seen:
                seen.add(metric)
                lines.append(f"# TYPE {metric} gauge")
            lines.append(f"{metric}{{{label_text(labels)}}} {value}")
    return "\n".join(lines) + "\n"


def backfill(path: str, hours: float) -> None:
    """OpenMetrics history from `hours` ago up to now: each family together, each series in order."""
    end = int(time.time()) // STEP * STEP
    start = end - int(hours * 3600)
    series: dict[str, dict[str, list[tuple[int, float]]]] = {}
    for t in range(start, end, STEP):
        for source in SOURCES:
            for metric, labels, value in source(t):
                # The labels Prometheus adds to a live scrape (honor_labels keeps a series' own).
                labels = {**SCRAPE_LABELS, **labels}
                series.setdefault(metric, {}).setdefault(label_text(labels), []).append((t, value))
    with open(path, "w") as f:
        for metric, by_labels in series.items():
            f.write(f"# TYPE {metric} gauge\n")
            for labels, samples in by_labels.items():
                for t, value in samples:
                    f.write(f"{metric}{{{labels}}} {value} {t}\n")
        f.write("# EOF\n")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path != "/metrics":
            self.send_error(404)
            return
        body = exposition(int(time.time())).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--backfill", help="write OpenMetrics history to this file, then serve")
    parser.add_argument("--hours", type=float, default=6)
    args = parser.parse_args()
    if args.backfill:
        backfill(args.backfill + ".tmp", args.hours)
        os.replace(args.backfill + ".tmp", args.backfill)
    ThreadingHTTPServer(("", 8000), Handler).serve_forever()
