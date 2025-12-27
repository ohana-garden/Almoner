FROM agent0ai/agent-zero:latest

# 1. Environment & Path Setup
ENV PATH="/opt/venv-a0/bin:$PATH"
ENV PORT=80
EXPOSE 80

# 2. 🔗 PATH HIJACK
# Force system python to look at our VENV (required for internal scripts)
RUN rm -f /usr/bin/python3 && ln -s /opt/venv-a0/bin/python /usr/bin/python3

# 3. 🔪 SURGICAL REMOVAL
# Clean out conflicting libraries from the base image
RUN rm -rf /opt/venv-a0/lib/python3.12/site-packages/numpy*     /opt/venv-a0/lib/python3.12/site-packages/scipy*     /opt/venv-a0/lib/python3.12/site-packages/sklearn*     /opt/venv-a0/lib/python3.12/site-packages/sentence_transformers*     /opt/venv-a0/lib/python3.12/site-packages/accelerate*     /opt/venv-a0/lib/python3.12/site-packages/transformers*     /opt/venv-a0/lib/python3.12/__pycache__

# 4. 🧠 DEPENDENCY TRANSPLANT
# Updated versions to fix the 'accelerate' circular import crash
RUN /opt/venv-a0/bin/pip install     "supervisor==4.2.5"     "numpy<2.0.0"     "scipy==1.13.0"     "scikit-learn==1.4.2"     "sentence-transformers==2.7.0"     "transformers==4.40.1"     "accelerate==0.30.0"

# 5. Storage & Permissions
RUN mkdir -p /storage && chmod 777 /storage

# 6. Startup Script
COPY railway_init.sh /railway_init.sh
RUN chmod +x /railway_init.sh
