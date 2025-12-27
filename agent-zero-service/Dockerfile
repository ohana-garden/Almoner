# 1. Base image (The one we know has the files)
FROM frdel/agent-zero:latest

# 2. Fix the "python not found" error by adding venv to PATH
ENV PATH="/opt/venv-a0/bin:$PATH"

# 3. Fix the "All ufuncs" crash by downgrading Numpy
RUN /opt/venv-a0/bin/pip install "numpy<2"

# 4. Set the working directory to where the code ACTUALLY lives
WORKDIR /a0

# 5. Railway Config
ENV PORT=80
EXPOSE 80

# 6. Explicitly start the UI script. 
# We do not leave this blank. We force it.
CMD ["python", "run_ui.py"]
