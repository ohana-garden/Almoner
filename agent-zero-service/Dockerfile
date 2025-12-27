FROM agent0ai/agent-zero:latest

# 1. Environment Setup
ENV PATH="/opt/venv-a0/bin:$PATH"

# 2. 🛑 NUCLEAR FIX: Uninstall broken dependencies first
# We remove the conflicting versions entirely to prevent ABI mismatches.
RUN /opt/venv-a0/bin/pip uninstall -y numpy scipy scikit-learn

# 3. 🛡️ GOLDEN SET: Install pinned, compatible versions
# These specific versions are known to work together on Python 3.12.
RUN /opt/venv-a0/bin/pip install "numpy==1.26.4" "scipy==1.13.0" "scikit-learn==1.4.2"

# 4. Persistence Setup (Just in case you added volumes)
# This ensures the volume mount points exist with correct permissions
RUN mkdir -p /a0/work_dir /a0/memory /a0/logs &&     chmod -R 777 /a0/work_dir /a0/memory /a0/logs

# 5. Hijack Setup
COPY main.py /main.py
WORKDIR /
ENV PORT=80
EXPOSE 80
