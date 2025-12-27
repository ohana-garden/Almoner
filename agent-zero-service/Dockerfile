FROM agent0ai/agent-zero:latest

# Fix Path
ENV PATH="/opt/venv-a0/bin:$PATH"

# Fix Dependencies
RUN /opt/venv-a0/bin/pip install "numpy<2"

# Prepare Storage & Permissions
# We create /storage so the volume has a place to mount
RUN mkdir -p /storage && chmod 777 /storage

# Copy our init script
COPY railway_init.sh /railway_init.sh
RUN chmod +x /railway_init.sh

# Network
ENV PORT=80
EXPOSE 80
