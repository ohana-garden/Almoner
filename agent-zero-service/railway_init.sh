#!/bin/sh
echo "📢 STARTUP SCRIPT IS RUNNING!"

echo "💉 PERFORMING LOBOTOMY..."
# 1. Disable the Watchdog (The Event Listener)
# We find the event listener config and delete it. 
# This stops the server from restarting just because a sub-process died.
rm -f /etc/supervisor/conf.d/event_listener.conf

# 2. Neutering SearXNG
# We force the search tool to do nothing but sleep.
find /etc/supervisor/conf.d/ -type f -print0 | xargs -0 sed -i '/\[program:run_searxng\]/,/command=/s|command=.*|command=/bin/sleep infinity|'

# 3. Setup Storage
echo "🛠️ Configuring Storage..."
mkdir -p /storage/work_dir /storage/memory /storage/logs
rm -rf /a0/work_dir && ln -s /storage/work_dir /a0/work_dir
rm -rf /a0/memory && ln -s /storage/memory /a0/memory
rm -rf /a0/logs && ln -s /storage/logs /a0/logs

echo "✅ Storage linked. Watchdog disabled. Starting Supervisor..."
# 4. Start Supervisor using the VENV binary
exec /opt/venv-a0/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
