# 1. Use the image that we know contains the venv at /opt/venv-a0
FROM agent0ai/agent-zero:latest

# 2. Add the virtual environment to the System PATH
# This fixes the "executable python not found" error at startup
ENV PATH="/opt/venv-a0/bin:$PATH"

# 3. Fix the Numpy crash using the absolute path
# We know this path works on this specific image
RUN /opt/venv-a0/bin/pip install "numpy<2"

# 4. Configure Port
ENV PORT=80
EXPOSE 80

# 5. Start the official startup script (Nginx + App)
CMD ["/usr/bin/supervisord"]
