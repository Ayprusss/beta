"""Re-run Stage B (smooth -> features -> rules) from cached keypoints.

This is the payoff of the two-stage design: tweak a threshold in
ml/feedback/rules.py, then refresh every climb's feedback in seconds without
re-running pose.

    python -m services.worker.rerun <climb_id>
    python -m services.worker.rerun --all
"""
from __future__ import annotations

import sys

from services import storage
from services.worker.pipeline import rebuild_results


def _rerun(climb_id: str) -> None:
    if not storage.keypoints_path(climb_id).exists():
        print(f"{climb_id}: no cached keypoints (job never finished Stage A?) — skipped")
        return
    results = rebuild_results(climb_id)
    print(f"{climb_id}: {len(results['feedback'])} feedback item(s), stats {results['stats']}")


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    if sys.argv[1] == "--all":
        metas = storage.list_climbs()
        if not metas:
            print("no climbs found")
        for meta in metas:
            _rerun(meta["id"])
    else:
        _rerun(sys.argv[1])


if __name__ == "__main__":
    main()
