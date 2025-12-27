FROM agent0ai/agent-zero:latest
ENV PORT=80
EXPOSE 80
ENV ALLOWED_ORIGINS="*"
ENV AUTH_ENABLED="false"
ENV PATH="/opt/venv-a0/bin:$PATH"
ENV PYTHONPATH="/opt/venv-a0/lib/python3.12/site-packages"
ENV PYTHONDONTWRITEBYTECODE=1

# Cleanup & Symlink Hijack
RUN rm -f /usr/bin/python3 && ln -s /opt/venv-a0/bin/python /usr/bin/python3
RUN rm -rf /opt/venv-a0/lib/python3.12/site-packages/numpy*     /opt/venv-a0/lib/python3.12/site-packages/scipy*     /opt/venv-a0/lib/python3.12/site-packages/sklearn*     /opt/venv-a0/lib/python3.12/site-packages/sentence_transformers*     /opt/venv-a0/lib/python3.12/site-packages/accelerate*     /opt/venv-a0/lib/python3.12/site-packages/transformers*     /opt/venv-a0/lib/python3.12/__pycache__     /usr/bin/supervisord     /usr/bin/supervisorctl

# Install Stable Stack
RUN /opt/venv-a0/bin/pip install     "supervisor==4.2.5"     "numpy==1.26.3"     "scipy==1.12.0"     "scikit-learn==1.4.2"     "sentence-transformers==2.7.0"     "transformers==4.40.1"     "accelerate==0.30.0"     "lxml"

# Finalize Binary Hijack
RUN ln -s /opt/venv-a0/bin/supervisord /usr/bin/supervisord &&     ln -s /opt/venv-a0/bin/supervisorctl /usr/bin/supervisorctl

RUN mkdir -p /storage && chmod 777 /storage
COPY railway_init.sh /railway_init.sh
RUN chmod +x /railway_init.sh
