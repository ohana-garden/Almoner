# 1. Base Image: Use the verified agent0ai image
FROM agent0ai/agent-zero:latest

# 2. Network Config: Hardcode Port 80 for the Edge Proxy
ENV PORT=80
EXPOSE 80

# 3. Runtime Fix: Add the virtual environment to PATH so 'python' is found
ENV PATH="/opt/venv-a0/bin:$PATH"

# 4. Dependency Fix: Downgrade Numpy using the ABSOLUTE pip path
RUN /opt/venv-a0/bin/pip install "numpy<2"

# Note: No CMD here. We rely strictly on railway.json to start the app.
