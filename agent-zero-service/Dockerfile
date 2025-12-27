FROM agent0ai/agent-zero:latest

ENV PORT=80
EXPOSE 80
ENV ALLOWED_ORIGINS="*"
ENV AUTH_ENABLED="false"
ENV PATH="/opt/venv-a0/bin:$PATH"
ENV PYTHONPATH="/opt/venv-a0/lib/python3.12/site-packages"

# Path & Binary Hijack
RUN rm -f /usr/bin/python3 && ln -s /opt/venv-a0/bin/python /usr/bin/python3
RUN /opt/venv-a0/bin/pip install "supervisor==4.2.5"

# Clean & Install Stable Stack
RUN rm -rf /opt/venv-a0/lib/python3.12/site-packages/numpy*     /opt/venv-a0/lib/python3.12/site-packages/scipy*     /opt/venv-a0/lib/python3.12/site-packages/sklearn*     /opt/venv-a0/lib/python3.12/site-packages/sentence_transformers*     /opt/venv-a0/lib/python3.12/site-packages/lxml*     /opt/venv-a0/lib/python3.12/__pycache__

RUN /opt/venv-a0/bin/pip install     "numpy==1.26.3"     "scipy==1.12.0"     "scikit-learn==1.4.2"     "sentence-transformers==2.7.0"     "transformers==4.40.1"     "accelerate==0.30.0"     "lxml==5.2.1"

# Prep Storage & Script
RUN mkdir -p /storage && chmod 777 /storage
COPY railway_init.sh /railway_init.sh
RUN chmod +x /railway_init.sh

# 🛑 THE FORCE OVERRIDE
# This tells Docker: "I don't care what the base image wants. Run this script."
CMD ["/bin/sh", "/railway_init.sh"]
