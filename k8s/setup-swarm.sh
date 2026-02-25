#!/bin/bash
# Docker Swarm setup for Raspberry Pi cluster
# Easier alternative to Kubernetes

echo "🐳 Docker Swarm Setup for Raspberry Pi"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo -e "${RED}❌ Please run as root (use sudo)${NC}"
   exit 1
fi

# Function to setup master node
setup_master() {
    echo -e "${YELLOW}📦 Setting up Docker Swarm Master...${NC}"
    
    # Install Docker if not present
    if ! command -v docker &> /dev/null; then
        echo "Installing Docker..."
        curl -fsSL https://get.docker.com | sh
        usermod -aG docker pi
    fi
    
    # Enable Docker
    systemctl enable docker
    systemctl start docker
    
    # Initialize Swarm
    echo "Initializing Docker Swarm..."
    docker swarm init --advertise-addr $(hostname -I | awk '{print $1}')
    
    # Get join token
    echo ""
    echo -e "${GREEN}✅ Swarm Master Initialized!${NC}"
    echo ""
    echo -e "${YELLOW}📝 Worker Join Command:${NC}"
    docker swarm join-token worker | grep -A 2 "docker swarm join"
    echo ""
    echo -e "${YELLOW}💾 Save this token for worker nodes!${NC}"
}

# Function to setup worker node
setup_worker() {
    echo -e "${YELLOW}📦 Setting up Docker Swarm Worker...${NC}"
    
    # Install Docker if not present
    if ! command -v docker &> /dev/null; then
        echo "Installing Docker..."
        curl -fsSL https://get.docker.com | sh
        usermod -aG docker pi
    fi
    
    # Enable Docker
    systemctl enable docker
    systemctl start docker
    
    if [ -z "$1" ]; then
        echo -e "${RED}❌ Please provide the join token from master${NC}"
        echo "Usage: $0 worker <JOIN_TOKEN>"
        exit 1
    fi
    
    JOIN_TOKEN=$1
    
    echo "Joining Swarm..."
    eval $JOIN_TOKEN
    
    echo ""
    echo -e "${GREEN}✅ Worker Node Joined!${NC}"
}

# Function to deploy services
deploy_services() {
    echo -e "${YELLOW}🚀 Deploying GitHub Agent Services...${NC}"
    
    # Create secrets from environment variables
    echo "Creating Docker secrets..."
    
    # Check if .env file exists
    if [ ! -f .env ]; then
        echo -e "${RED}❌ .env file not found!${NC}"
        echo "Please create a .env file with your secrets"
        exit 1
    fi
    
    # Source environment variables
    export $(grep -v '^#' .env | xargs)
    
    # Create secrets
    echo "$GITHUB_TOKEN" | docker secret create github_token - 2>/dev/null || echo "Secret github_token already exists"
    echo "$TELEGRAM_BOT_TOKEN" | docker secret create telegram_bot_token - 2>/dev/null || echo "Secret telegram_bot_token already exists"
    echo "$BRAVE_API_KEY" | docker secret create brave_api_key - 2>/dev/null || echo "Secret brave_api_key already exists"
    echo "$ANTHROPIC_API_KEY" | docker secret create anthropic_api_key - 2>/dev/null || echo "Secret anthropic_api_key already exists"
    
    # Deploy stack
    echo "Deploying stack..."
    docker stack deploy -c docker-swarm.yml github-agent
    
    echo ""
    echo -e "${GREEN}✅ Services Deployed!${NC}"
    echo ""
    echo "Check status with: docker stack ps github-agent"
    echo "View logs with: docker service logs github-agent_github-agent"
}

# Function to show status
show_status() {
    echo -e "${YELLOW}📊 Cluster Status:${NC}"
    echo ""
    echo "Nodes:"
    docker node ls
    echo ""
    echo "Services:"
    docker service ls
    echo ""
    echo "Tasks:"
    docker stack ps github-agent 2>/dev/null || echo "Stack not deployed yet"
}

# Main menu
case "$1" in
    master)
        setup_master
        ;;
    worker)
        setup_worker "$2"
        ;;
    deploy)
        deploy_services
        ;;
    status)
        show_status
        ;;
    *)
        echo "Docker Swarm Setup for Raspberry Pi"
        echo ""
        echo "Usage:"
        echo "  $0 master          - Initialize master node"
        echo "  $0 worker <TOKEN>  - Join as worker node"
        echo "  $0 deploy          - Deploy GitHub Agent services"
        echo "  $0 status          - Show cluster status"
        echo ""
        echo "Example workflow:"
        echo "  1. On Pi 1: $0 master"
        echo "  2. On Pi 2 & 3: $0 worker <TOKEN_FROM_STEP_1>"
        echo "  3. On Pi 1: $0 deploy"
        exit 1
        ;;
esac
