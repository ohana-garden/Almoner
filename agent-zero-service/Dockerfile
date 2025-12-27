FROM frdel/agent-zero:latest

# 1. RUNTIME CONFIG: Add venv to PATH so 'python' exists for the app
ENV PATH="/opt/venv-a0/bin:$PATH"

# 2. RAILWAY CONFIG: Set Port 80 so Railway detects it automatically
ENV PORT=80
EXPOSE 80

# 3. CRASH FIX: Downgrade Numpy using the ABSOLUTE path to pip
# We use the full path so the build never fails with "pip not found"
RUN /opt/venv-a0/bin/pip install "numpy<2"

# 4. We rely on the base image's supervisord to start Nginx + App.
# This ensures the web server starts correctly.
