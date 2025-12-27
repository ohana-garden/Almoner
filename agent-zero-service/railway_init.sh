#!/bin/sh
echo "🛠️  Configuring Storage..."

# Create folders
mkdir -p /storage/work_dir
mkdir -p /storage/memory
mkdir -p /storage/logs

# Link internal paths
rm -rf /a0/work_dir && ln -s /storage/work_dir /a0/work_dir
rm -rf /a0/memory && ln -s /storage/memory /a0/memory
rm -rf /a0/logs && ln -s /storage/logs /a0/logs

echo "✅ Storage linked. Starting Supervisor..."
# We run the symlinked binary, which now points to our working VENV version
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
