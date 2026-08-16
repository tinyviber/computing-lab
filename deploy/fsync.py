#!/usr/bin/env python3
"""Small, dependency-free fsync helper for host deployment state."""

from __future__ import annotations

import os
import sys


def sync_path(path: str) -> None:
    flags = os.O_RDONLY
    if os.path.isdir(path):
        flags |= getattr(os, "O_DIRECTORY", 0)
    fd = os.open(path, flags)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def replace_symlink(target: str, link: str) -> None:
    parent = os.path.dirname(link)
    temporary = os.path.join(parent, f".{os.path.basename(link)}.tmp.{os.getpid()}")
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    os.symlink(target, temporary)
    os.replace(temporary, link)
    sync_path(parent)


if len(sys.argv) == 4 and sys.argv[1] == "--replace-symlink":
    replace_symlink(sys.argv[2], sys.argv[3])
    raise SystemExit(0)

if len(sys.argv) < 2:
    raise SystemExit("usage: fsync.py PATH [PATH ...]")

for item in sys.argv[1:]:
    sync_path(item)
