# 1. Base image (proven to have the correct files)
FROM agent0ai/agent-zero:latest

# 2. Fix the "python not found" error by adding venv to PATH
ENV PATH="/opt/venv-a0/bin:$PATH"

# 3. Fix the "All ufuncs" crash by downgrading Numpy
# We use the absolute path to ensure this never fails.
RUN /opt/venv-a0/bin/pip install "numpy<2"

# 4. Give Railway what it expects: A clear PORT definition
ENV PORT=80
EXPOSE 80

# 5. The "Trojan Horse": We explicitly tell Railway to run the process manager.
# This prevents Railway from guessing "python main.py" and crashing.
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
