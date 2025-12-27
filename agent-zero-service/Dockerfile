# 1. Use the official image as the starting point
FROM agent0ai/agent-zero:latest

# 2. ⚡ HOTFIX: Downgrade Numpy to version 1.x
# The official image has Numpy 2.0 which causes the "All ufuncs" crash.
# We explicitly target the internal virtual environment pip.
RUN /opt/venv-a0/bin/pip install "numpy<2"

# 3. Railway Configuration
# The official image listens on port 80. We expose it for Railway.
ENV PORT=80
EXPOSE 80

# 4. We inherit the default start command from the base image, 
# so no need to specify CMD here.
