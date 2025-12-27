import os
import sys

print("🚀 Hijacking Railway startup command...")
# We use os.execv to replace this python script with the real server process.
# This prevents 'python' from sitting in memory and ensures supervisord gets PID 1 behavior.
os.execv("/usr/bin/supervisord", ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"])
