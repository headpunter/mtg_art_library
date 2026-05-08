"""
jobs.py — simple in-memory background job runner.

Each job has a unique id and a state machine:
    pending → running → done | failed

The web UI polls /api/job/<id> to follow progress. Jobs run in daemon
threads so the Flask process doesn't block.
"""
from __future__ import annotations

import threading
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable

_JOBS: dict[str, "Job"] = {}
_LOCK = threading.Lock()


@dataclass
class Job:
    id: str
    label: str
    state: str = "pending"           # pending | running | done | failed
    progress: str = ""               # human-readable status line
    result: Any = None
    error: str | None = None
    started: datetime | None = None
    finished: datetime | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "state": self.state,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
        }

    def update(self, progress: str):
        self.progress = progress


def submit(label: str, fn: Callable[["Job"], Any]) -> Job:
    """Run fn(job) in a daemon thread. fn can call job.update('...') for progress."""
    job = Job(id=uuid.uuid4().hex[:12], label=label)
    with _LOCK:
        _JOBS[job.id] = job

    def runner():
        job.state = "running"
        job.started = datetime.now()
        try:
            job.result = fn(job)
            job.state = "done"
        except Exception as e:
            job.state = "failed"
            job.error = f"{type(e).__name__}: {e}"
            try:
                traceback.print_exc()
            except Exception:
                pass
        finally:
            job.finished = datetime.now()

    t = threading.Thread(target=runner, daemon=True)
    t.start()
    return job


def get(job_id: str) -> Job | None:
    with _LOCK:
        return _JOBS.get(job_id)


def list_recent(n: int = 20) -> list[Job]:
    with _LOCK:
        return sorted(_JOBS.values(),
                      key=lambda j: j.started or datetime.min,
                      reverse=True)[:n]
