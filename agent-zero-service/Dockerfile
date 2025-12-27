FROM python:3.11-slim

WORKDIR /app

# 1. Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# 2. Copy requirements first (for caching)
COPY requirements.txt .

# 3. Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 4. Install Playwright browsers (Crucial for Agent Zero web browsing)
RUN playwright install --with-deps chromium

# 5. Copy the actual application code
COPY . .

# 6. Set Environment Variables
ENV PORT=5000
ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0

# 7. Expose the port
EXPOSE 5000

# 8. Start the UI
CMD ["python", "run_ui.py"]
