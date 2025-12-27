#!/bin/sh
echo "🛠️  Configuring Storage..."

# 1. Create persistent folders on volume
mkdir -p /storage/work_dir
mkdir -p /storage/memory
mkdir -p /storage/logs

# 2. Force-Link Agent Zero internals to persistent storage
# Removing existing directories to replace with symlinks
rm -rf /a0/work_dir && ln -s /storage/work_dir /a0/work_dir
rm -rf /a0/memory && ln -s /storage/memory /a0/memory
rm -rf /a0/logs && ln -s /storage/logs /a0/logs

echo "✅ Storage linked. Starting Supervisor from VENV..."

# 3. CRITICAL FIX: Run the VENV supervisor, not the system one.
# This prevents the ModuleNotFoundError.
exec /opt/venv-a0/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
