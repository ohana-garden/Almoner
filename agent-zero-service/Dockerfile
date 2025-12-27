FROM agent0ai/agent-zero:latest

# --- 1. NETWORK & SECURITY ---
ENV PORT=80
EXPOSE 80
# CRITICAL FIX: Allow access from your public Railway URL
ENV ALLOWED_ORIGINS="*"
# (Optional) You can set a password later by changing this to "true" 
# and setting an AUTH_PASSWORD env var.
ENV AUTH_ENABLED="false"

# --- 2. ENVIRONMENT VARIABLES ---
# Force Python to see our VENV packages, no matter how it's called
ENV PATH="/opt/venv-a0/bin:$PATH"
ENV PYTHONPATH="/opt/venv-a0/lib/python3.12/site-packages"
ENV PYTHONDONTWRITEBYTECODE=1

# --- 3. PATH HIJACK ---
# Force system python to look at our VENV.
RUN rm -f /usr/bin/python3 && ln -s /opt/venv-a0/bin/python /usr/bin/python3

# --- 4. BINARY HIJACK ---
# Overwrite system binaries to ensure they use our VENV (Fixes ModuleNotFoundError)
RUN /opt/venv-a0/bin/pip install "supervisor==4.2.5"
RUN cp /opt/venv-a0/bin/supervisord /usr/bin/supervisord &&     cp /opt/venv-a0/bin/supervisorctl /usr/bin/supervisorctl

# --- 5. CLEANUP & PREP ---
RUN rm -rf /opt/venv-a0/lib/python3.12/site-packages/numpy*     /opt/venv-a0/lib/python3.12/site-packages/scipy*     /opt/venv-a0/lib/python3.12/site-packages/sklearn*     /opt/venv-a0/lib/python3.12/site-packages/sentence_transformers*     /opt/venv-a0/lib/python3.12/site-packages/accelerate*     /opt/venv-a0/lib/python3.12/site-packages/transformers*     /opt/venv-a0/lib/python3.12/__pycache__

# --- 6. INSTALL DEPENDENCIES ---
# The stable stack that fixed the RecursionError and ImportErrors
RUN /opt/venv-a0/bin/pip install     "numpy==1.26.3"     "scipy==1.12.0"     "scikit-learn==1.4.2"     "sentence-transformers==2.7.0"     "transformers==4.40.1"     "accelerate==0.30.0"     "lxml"

# --- 7. STORAGE ---
RUN mkdir -p /storage && chmod 777 /storage

# --- 8. STARTUP SCRIPT ---
COPY railway_init.sh /railway_init.sh
RUN chmod +x /railway_init.sh
