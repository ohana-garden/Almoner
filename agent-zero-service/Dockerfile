FROM agent0ai/agent-zero:latest

# 1. Environment & Path Setup
ENV PATH="/opt/venv-a0/bin:$PATH"
ENV PORT=80
EXPOSE 80
# Prevent python from writing pyc files to disk (avoids corruption issues)
ENV PYTHONDONTWRITEBYTECODE=1

# 2. 🔗 PATH HIJACK
# Force system python to look at our VENV.
RUN rm -f /usr/bin/python3 && ln -s /opt/venv-a0/bin/python /usr/bin/python3

# 3. 🛡️ BINARY HIJACK
# Overwrite system binaries to ensure they use our VENV
RUN /opt/venv-a0/bin/pip install "supervisor==4.2.5"
RUN cp /opt/venv-a0/bin/supervisord /usr/bin/supervisord &&     cp /opt/venv-a0/bin/supervisorctl /usr/bin/supervisorctl

# 4. 🔪 SURGICAL REMOVAL
# Clean out conflicting libraries from the base image
RUN rm -rf /opt/venv-a0/lib/python3.12/site-packages/numpy*     /opt/venv-a0/lib/python3.12/site-packages/scipy*     /opt/venv-a0/lib/python3.12/site-packages/sklearn*     /opt/venv-a0/lib/python3.12/site-packages/sentence_transformers*     /opt/venv-a0/lib/python3.12/site-packages/accelerate*     /opt/venv-a0/lib/python3.12/site-packages/transformers*     /opt/venv-a0/lib/python3.12/__pycache__

# 5. 🧠 DEPENDENCY TRANSPLANT (STABILITY FIX)
# Downgrading Scipy to 1.12.0 and Numpy to 1.26.3 to fix RecursionError.
# We explicitly force a cache purge to ensure no bad wheels are re-used.
RUN /opt/venv-a0/bin/pip cache purge &&     /opt/venv-a0/bin/pip install     "numpy==1.26.3"     "scipy==1.12.0"     "scikit-learn==1.4.2"     "sentence-transformers==2.7.0"     "transformers==4.40.1"     "accelerate==0.30.0"     "lxml"

# 6. Storage & Permissions
RUN mkdir -p /storage && chmod 777 /storage

# 7. Startup Script
COPY railway_init.sh /railway_init.sh
RUN chmod +x /railway_init.sh
