FROM python:3.11-slim

WORKDIR /app

# Install dependencies (paths relative to repo root)
COPY graphiti-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY graphiti-service/main.py .

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "main.py"]
