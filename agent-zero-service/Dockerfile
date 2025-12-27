FROM agent0ai/agent-zero:latest

# 1. FIX PATH: Ensure 'python' commands find the virtual environment
ENV PATH="/opt/venv-a0/bin:$PATH"

# 2. CONFIG: Set Port 80 so Railway creates the correct proxy
ENV PORT=80
EXPOSE 80

# 3. FIX CRASH: Downgrade Numpy using the absolute path to pip
RUN /opt/venv-a0/bin/pip install "numpy<2"

# 4. OVERRIDE: Use Shell-Form ENTRYPOINT (No brackets!)
# This ignores any arguments Railway tries to append (like "python main.py")
# and forces Supervisord to run, which manages Nginx and the App.
ENTRYPOINT /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
