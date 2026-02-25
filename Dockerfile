# Multi-stage build for Ollama + GitHub Agent

# Stage 1: Ollama base
FROM ollama/ollama:latest as ollama-base

# Install Node.js and npm
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Stage 2: Application
FROM ollama-base

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY agent/package.json ./agent/
COPY event-handler/package.json ./event-handler/

# Install dependencies
RUN npm install
RUN cd agent && npm install
RUN cd event-handler && npm install

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p jobs/pending jobs/processing jobs/completed jobs/failed memory config

# Expose ports
EXPOSE 3000 11434

# Environment variables
ENV OLLAMA_HOST=http://localhost:11434
ENV NODE_ENV=production

# Start script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
