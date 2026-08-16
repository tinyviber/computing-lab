#!/usr/bin/env python3
import fcntl
import sys

if len(sys.argv) != 3 or sys.argv[1] not in {"-n", "-u"}:
    raise SystemExit("usage: flock-helper.py -n FD|-u FD")

fd = int(sys.argv[2])
if sys.argv[1] == "-n":
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit(1)
else:
    fcntl.flock(fd, fcntl.LOCK_UN)
