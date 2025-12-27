# 1. Base Image
FROM agent0ai/agent-zero:latest

# 2. RUNTIME ENV: Add the virtual environment to PATH.
# This ensures that when Supervisord spawns processes, they find Python.
ENV PATH="/opt/venv-a0/bin:$PATH"

# 3. COMPATIBILITY FIX: Downgrade Numpy.
# The official image has a library mismatch (Numpy 2.0 vs Scikit-learn).
# We fix this layer explicitly using the absolute path to pip.
RUN /opt/venv-a0/bin/pip install "numpy<2"

# 4. NETWORKING: Expose Port 80.
# As noted in Section 6.1 of your guide, the Edge Proxy routes traffic here.
ENV PORT=80
EXPOSE 80

# ⚠️ Note: No CMD/ENTRYPOINT here. We rely entirely on railway.toml.
