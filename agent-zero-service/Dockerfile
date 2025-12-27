# 1. Base Image: Use the verified agent0ai image
FROM agent0ai/agent-zero:latest

# 2. Network Config: Hardcode Port 80 for the Edge Proxy (Section 6.1)
ENV PORT=80
EXPOSE 80

# 3. Runtime Fix: Add the virtual environment to PATH so 'python' is found
ENV PATH="/opt/venv-a0/bin:$PATH"

# 4. Dependency Fix: Downgrade Numpy using the ABSOLUTE pip path to prevent build failures
RUN /opt/venv-a0/bin/pip install "numpy<2"

# Note: We do not set CMD here. We rely on railway.json (Section 4.1).
