# Multi-stage build for Ollama + GitHub Agent

FROM ollama/ollama:latest

# Install Node.js, npm, and core utilities
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    git \
    coreutils \
    inetutils-ping \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

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

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh

# Create necessary directories
RUN mkdir -p jobs/pending jobs/processing jobs/completed jobs/failed memory config

# Expose ports
EXPOSE 3000 11434

# Environment variables
ENV OLLAMA_HOST=http://ollama:11434
ENV NODE_ENV=production
ENV PATH="/usr/local/bin:${PATH}"

# Start with entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["app"]
