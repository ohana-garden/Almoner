FROM agent0ai/agent-zero:latest

# 1. Environment Setup
ENV PATH="/opt/venv-a0/bin:$PATH"
ENV PORT=80
EXPOSE 80

# 2. 🔪 SURGICAL REMOVAL: The base image ships with broken/incompatible libraries.
# We CANNOT trust pip uninstall. We must delete the folders manually.
RUN rm -rf /opt/venv-a0/lib/python3.12/site-packages/numpy*     /opt/venv-a0/lib/python3.12/site-packages/scipy*     /opt/venv-a0/lib/python3.12/site-packages/sklearn*     /opt/venv-a0/lib/python3.12/site-packages/sentence_transformers*

# 3. 🧠 BRAIN TRANSPLANT: Install the "Golden Trio" of versions.
# These three SPECIFIC versions are guaranteed to work together on Python 3.12.
RUN /opt/venv-a0/bin/pip install "numpy==1.26.4"
RUN /opt/venv-a0/bin/pip install "scipy==1.12.0" "scikit-learn==1.4.2" "sentence-transformers==2.7.0"

# 4. Storage & Permissions (For your single volume)
RUN mkdir -p /storage && chmod 777 /storage

# 5. Startup Script
COPY railway_init.sh /railway_init.sh
RUN chmod +x /railway_init.sh
