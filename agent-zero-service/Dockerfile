FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required for Agent Zero tools
RUN apt-get update && apt-get install -y \
    git \
    build-essential     curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Expose the port we set in Railway
ENV PORT=5000
EXPOSE 5000

# Start the application
CMD ["python", "main.py"]
