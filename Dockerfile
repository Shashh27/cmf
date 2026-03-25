# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install only essential system dependencies
# WARNING: Do not change this block — any change busts the Docker cache
# and forces a full re-download of freecad (~20 min)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    freecad \
    libgl1 \
    libgl1-mesa-dri \
    libglu1-mesa \
    libx11-6 \
    libxrender1 \
    libxext6 \
    libsm6 \
    libice6 \
    xvfb \
    xauth \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libfreetype6 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Run the application
CMD ["python", "main.py"]