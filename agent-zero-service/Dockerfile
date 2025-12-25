FROM agent0ai/agent-zero:latest

# Copy our Almoner tool configuration into the agent's tools directory
# The base image uses /app as the working directory
COPY tools/almoner.json /app/tools/almoner.json

# Expose the web UI port
EXPOSE 80

# Start the agent (inherited from base image)
CMD ["python", "main.py"]
