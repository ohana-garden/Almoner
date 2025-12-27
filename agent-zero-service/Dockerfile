# 1. Base image
FROM frdel/agent-zero:latest

# 2. Add the virtual environment to the System PATH (fixes runtime)
ENV PATH="/opt/venv-a0/bin:$PATH"

# 3. Apply the Numpy Hotfix using the FULL PATH (fixes build)
RUN /opt/venv-a0/bin/pip install "numpy<2"

# 4. Railway Configuration
ENV PORT=80
EXPOSE 80

# 5. Explicitly start the UI
CMD ["python", "run_ui.py"]
