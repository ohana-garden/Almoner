#!/bin/sh
echo "🛠️ Configuring Single-Volume Storage..."

# 1. Create subfolders on your persistent volume
mkdir -p /storage/work_dir
mkdir -p /storage/memory
mkdir -p /storage/logs

# 2. Link Agent Zero's internal paths to the persistent volume
# We remove the container's default folders and replace them with links to your volume.
rm -rf /a0/work_dir && ln -s /storage/work_dir /a0/work_dir
rm -rf /a0/memory && ln -s /storage/memory /a0/memory
rm -rf /a0/logs && ln -s /storage/logs /a0/logs

echo "✅ Storage linked. Starting Supervisor..."

# 3. Start the application
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
