"""Apply a per-file write ceiling before executing the trusted downloader, without a shell."""
import os
import resource
import sys

limit = int(sys.argv[1])
if limit <= 0:
    raise SystemExit(2)
resource.setrlimit(resource.RLIMIT_FSIZE, (limit, limit))
os.execvp(sys.argv[2], sys.argv[2:])
