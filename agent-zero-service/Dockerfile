FROM agent0ai/agent-zero:latest

# --- 1. NETWORK ---
ENV PORT=80
EXPOSE 80

# --- 2. ENVIRONMENT VARIABLES ---
# Force Python to see our VENV packages, no matter how it's called
ENV PATH="/opt/venv-a0/bin:$PATH"
ENV PYTHONPATH="/opt/venv-a0/lib/python3.12/site-packages"

# --- 3. CLEANUP & PREP ---
# Remove conflicting libraries and the SYSTEM supervisor that is crashing
RUN rm -rf /opt/venv-a0/lib/python3.12/site-packages/numpy*     /opt/venv-a0/lib/python3.12/site-packages/scipy*     /opt/venv-a0/lib/python3.12/site-packages/sklearn*     /opt/venv-a0/lib/python3.12/site-packages/sentence_transformers*     /opt/venv-a0/lib/python3.12/site-packages/accelerate*     /opt/venv-a0/lib/python3.12/site-packages/transformers*     /usr/bin/supervisord     /usr/bin/supervisorctl

# --- 4. INSTALL DEPENDENCIES ---
# Install Supervisor and the ML Stack into the VENV
RUN /opt/venv-a0/bin/pip install     "supervisor==4.2.5"     "numpy<2.0.0"     "scipy==1.13.0"     "scikit-learn==1.4.2"     "sentence-transformers==2.7.0"     "transformers==4.40.1"     "accelerate==0.30.0"

# --- 5. THE BODY SNATCHER FIX ---
# We replaced the deleted system binaries with links to our VENV binaries.
# If Railway calls /usr/bin/supervisord, it actually runs OURS.
RUN ln -s /opt/venv-a0/bin/supervisord /usr/bin/supervisord &&     ln -s /opt/venv-a0/bin/supervisorctl /usr/bin/supervisorctl

# --- 6. STORAGE ---
RUN mkdir -p /storage && chmod 777 /storage

# --- 7. STARTUP SCRIPT ---
COPY railway_init.sh /railway_init.sh
RUN chmod +x /railway_init.sh
