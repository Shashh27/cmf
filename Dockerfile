# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install only essential system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Container local time must be IST. python:slim defaults to UTC, which made
# datetime.now() store 5:30 behind the shop floor. now_ist() is the code fix;
# TZ is belt-and-suspenders for any leftover datetime.now() calls.
ENV TZ=Asia/Kolkata

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port 
EXPOSE 8989

# Run the application
CMD ["python", "main.py"]