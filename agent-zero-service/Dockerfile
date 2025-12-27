FROM agent0ai/agent-zero:latest

# 1. FIX PATH: Make sure 'python' executes from the virtual environment
ENV PATH="/opt/venv-a0/bin:$PATH"

# 2. FIX DEPENDENCIES: Resolve the Numpy ABI mismatch crash
# We verify this works by pinning compatible versions
RUN /opt/venv-a0/bin/pip install "numpy<2"

# 3. PREPARE STORAGE: Create mount points with open permissions
# This prevents permission errors when you attach Volumes later
RUN mkdir -p /a0/work_dir /a0/memory /a0/logs &&     chmod -R 777 /a0/work_dir /a0/memory /a0/logs

# 4. NETWORK: Inform Railway which port to proxy
ENV PORT=80
EXPOSE 80
