import os
import sys

print("🚀 Hijacking Railway startup command to fix Agent Zero...")
# Replace the python process with the correct Supervisor process
# This starts Nginx and the Agent simultaneously
os.execv("/usr/bin/supervisord", ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"])
