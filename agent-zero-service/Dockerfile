FROM agent0ai/agent-zero:latest

# 1. Environment & Path Setup
ENV PATH="/opt/venv-a0/bin:$PATH"
ENV PORT=80
EXPOSE 80

# 2. 🔗 PATH HIJACK (Critical Fix)
# The internal listener script creates a new process that might skip our ENV PATH.
# We physically overwrite the system python symlink to point to our VENV.
# This guarantees 'python' ALWAYS loads our installed modules (like supervisor).
RUN rm -f /usr/bin/python3 && ln -s /opt/venv-a0/bin/python /usr/bin/python3

# 3. 🔪 SURGICAL REMOVAL
# Remove the incompatible libraries provided by the base image.
RUN rm -rf /opt/venv-a0/lib/python3.12/site-packages/numpy*     /opt/venv-a0/lib/python3.12/site-packages/scipy*     /opt/venv-a0/lib/python3.12/site-packages/sklearn*     /opt/venv-a0/lib/python3.12/site-packages/sentence_transformers*     /opt/venv-a0/lib/python3.12/site-packages/accelerate*     /opt/venv-a0/lib/python3.12/site-packages/transformers*     /opt/venv-a0/lib/python3.12/__pycache__

# 4. 🧪 COMPATIBILITY MATRIX INSTALL
# We install 'supervisor' so the listener script can find it.
# We pin specific older versions known to avoid the 'circular import' bug.
RUN /opt/venv-a0/bin/pip install     "supervisor==4.2.5"     "numpy==1.26.4"     "scipy==1.12.0"     "scikit-learn==1.4.2"     "sentence-transformers==2.6.1"     "transformers==4.39.3"     "accelerate==0.28.0"

# 5. Storage & Persistence
RUN mkdir -p /storage && chmod 777 /storage

# 6. Startup Script
COPY railway_init.sh /railway_init.sh
RUN chmod +x /railway_init.sh
