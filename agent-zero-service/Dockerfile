# 1. Base image
FROM frdel/agent-zero:latest

# 2. Add the virtual environment to the System PATH
# This fixes "executable python not found"
ENV PATH="/opt/venv-a0/bin:$PATH"

# 3. Apply the Numpy Hotfix (Downgrade to 1.x)
RUN pip install "numpy<2"

# 4. Railway Configuration
ENV PORT=80
EXPOSE 80

# 5. Explicitly start the UI
CMD ["python", "run_ui.py"]
