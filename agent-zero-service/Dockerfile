FROM agent0ai/agent-zero:latest

# --- 1. NETWORK & SECURITY ---
ENV PORT=80
EXPOSE 80
ENV ALLOWED_ORIGINS="*"
ENV AUTH_ENABLED="false"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PATH="/opt/venv-a0/bin:$PATH"
ENV PYTHONPATH="/opt/venv-a0/lib/python3.12/site-packages"

# --- 2. ENVIRONMENT HIJACK ---
# Force system python to look at our VENV
RUN rm -f /usr/bin/python3 && ln -s /opt/venv-a0/bin/python /usr/bin/python3

# --- 3. BINARY HIJACK ---
# Install supervisor in VENV and overwrite system binaries
RUN /opt/venv-a0/bin/pip install "supervisor==4.2.5"
RUN cp /opt/venv-a0/bin/supervisord /usr/bin/supervisord &&     cp /opt/venv-a0/bin/supervisorctl /usr/bin/supervisorctl

# --- 4. BUILD-TIME LOBOTOMY (The Fix) ---
# We delete the Watchdog config so it can NEVER start.
RUN rm -f /etc/supervisor/conf.d/event_listener.conf

# We Force-Edit the Search Tool config to just 'sleep' instead of crashing.
# This prevents the 'FATAL' state that triggers restarts.
RUN find /etc/supervisor/conf.d/ -type f -print0 | xargs -0 sed -i '/\[program:run_searxng\]/,/command=/s|command=.*|command=/bin/sleep infinity|'

# --- 5. CLEANUP & INSTALL ---
RUN rm -rf /opt/venv-a0/lib/python3.12/site-packages/numpy*     /opt/venv-a0/lib/python3.12/site-packages/scipy*     /opt/venv-a0/lib/python3.12/site-packages/sklearn*     /opt/venv-a0/lib/python3.12/site-packages/sentence_transformers*     /opt/venv-a0/lib/python3.12/site-packages/lxml*     /opt/venv-a0/lib/python3.12/__pycache__

RUN /opt/venv-a0/bin/pip install     "numpy==1.26.3"     "scipy==1.12.0"     "scikit-learn==1.4.2"     "sentence-transformers==2.7.0"     "transformers==4.40.1"     "accelerate==0.30.0"     "lxml==5.2.1"

# --- 6. SETUP ---
RUN mkdir -p /storage && chmod 777 /storage
COPY railway_init.sh /railway_init.sh
RUN chmod +x /railway_init.sh

# --- 7. OVERRIDE ENTRYPOINT ---
# We clear the Entrypoint to ensure our CMD is respected
ENTRYPOINT []
CMD ["/bin/sh", "/railway_init.sh"]
