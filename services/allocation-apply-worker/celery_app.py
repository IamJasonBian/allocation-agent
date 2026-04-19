"""Celery app wired to Redis. Broker URL comes from REDIS_URL env var.

Tasks live in tasks.py and are imported via `include` so workers pick them up
regardless of whether the FastAPI bridge has been loaded.
"""
import os
from celery import Celery

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "allocation_apply",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=60 * 60 * 24,
    task_default_queue="apply_failures",
)
