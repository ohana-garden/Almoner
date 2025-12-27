#!/bin/sh
echo "📢 STARTUP SCRIPT RUNNING!"

# Setup Storage Links
echo "🛠️ Configuring Storage..."
mkdir -p /storage/work_dir /storage/memory /storage/logs
rm -rf /a0/work_dir && ln -s /storage/work_dir /a0/work_dir
rm -rf /a0/memory && ln -s /storage/memory /a0/memory
rm -rf /a0/logs && ln -s /storage/logs /a0/logs

echo "✅ Storage linked. Starting Supervisor..."
exec /opt/venv-a0/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
