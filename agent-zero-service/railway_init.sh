#!/bin/sh
echo "🛠️  Configuring Storage..."

# 1. Setup Storage
mkdir -p /storage/work_dir
mkdir -p /storage/memory
mkdir -p /storage/logs

rm -rf /a0/work_dir && ln -s /storage/work_dir /a0/work_dir
rm -rf /a0/memory && ln -s /storage/memory /a0/memory
rm -rf /a0/logs && ln -s /storage/logs /a0/logs

echo "💉 Performing Lobotomy on SearXNG..."
# 2. DISABLE SEARXNG (The Fix)
# We search all supervisor configs for the searxng program definition.
# We replace its command with 'sleep infinity'.
# This makes the process stay "alive" without crashing, satisfying the watchdog.
find /etc/supervisor/conf.d/ -type f -print0 | xargs -0 sed -i '/\[program:run_searxng\]/,/command=/s|command=.*|command=/bin/sleep infinity|'

echo "✅ Storage linked & Search disabled. Starting Supervisor..."
# 3. Start the process manager using our VENV binary
exec /opt/venv-a0/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
