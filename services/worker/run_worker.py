"""Start the ML worker. Run from the repo root:

    .venv\\Scripts\\python.exe -m services.worker.run_worker

Windows note: RQ's default Worker forks per job (os.fork), which doesn't exist
on Windows. SimpleWorker executes jobs in-process instead, and TimerDeathPenalty
replaces the SIGALRM-based job timeout. On a Linux deploy, plain `rq worker
climbs` is the production equivalent.
"""
from __future__ import annotations

import os

from redis import Redis
from rq import Queue, SimpleWorker
from rq.timeouts import TimerDeathPenalty

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6380/0")  # matches infra/docker-compose.yml
QUEUE_NAME = "climbs"


class WindowsWorker(SimpleWorker):
    death_penalty_class = TimerDeathPenalty


def main() -> None:
    connection = Redis.from_url(REDIS_URL)
    connection.ping()  # fail fast with a clear error if redis isn't up
    queue = Queue(QUEUE_NAME, connection=connection)
    print(f"worker listening on queue '{QUEUE_NAME}' ({REDIS_URL})")
    WindowsWorker([queue], connection=connection).work()


if __name__ == "__main__":
    main()
