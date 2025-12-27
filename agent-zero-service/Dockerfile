# 1. Use the verified image
FROM agent0ai/agent-zero:latest

# 2. Fix the "executable python not found" error
ENV PATH="/opt/venv-a0/bin:$PATH"

# 3. Aggressively fix the Numpy crash
# We force reinstall to ensure clean compatible versions
RUN /opt/venv-a0/bin/pip install --force-reinstall "numpy<2" scipy scikit-learn

# 4. Setup the Hijack
# We copy our script to the root so 'python main.py' finds it
COPY main.py /main.py
WORKDIR /

# 5. Network Config
ENV PORT=80
EXPOSE 80

# 6. No CMD needed. We let Railway run 'python main.py', 
# which triggers our hijack script.
