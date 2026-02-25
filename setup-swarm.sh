#!/bin/bash
# Docker Swarm Setup for GitHub Agent Cluster
# Run this to set up Swarm across your laptop + Raspberry Pis

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🐳 Docker Swarm Setup for GitHub Agent"
echo "======================================"
echo ""

# Function to setup manager node
setup_manager() {
    echo -e "${YELLOW}📦 Setting up Swarm Manager...${NC}"
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found. Please install Docker first.${NC}"
        exit 1
    fi
    
    # Initialize Swarm if not already done
    if docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
        echo -e "${GREEN}✅ Swarm already initialized${NC}"
    else
        echo "Initializing Docker Swarm..."
        docker swarm init --advertise-addr $(hostname -I | awk '{print $1}')
        echo -e "${GREEN}✅ Swarm initialized!${NC}"
    fi
    
    # Get join token for workers
    echo ""
    echo -e "${YELLOW}📝 Worker Join Command:${NC}"
    echo ""
    docker swarm join-token worker | grep -A 2 "docker swarm join"
    echo ""
    echo -e "${YELLOW}💾 Save this command! You'll need it for your Raspberry Pis${NC}"
    echo ""
    
    # Label this node as manager and ollama host
    NODE_ID=$(docker info -f '{{.Swarm.NodeID}}')
    docker node update --label-add role=manager $NODE_ID
    docker node update --label-add ollama=true $NODE_ID
    
    echo -e "${GREEN}✅ Manager node labeled${NC}"
}

# Function to setup worker node
setup_worker() {
    echo -e "${YELLOW}📦 Setting up Swarm Worker...${NC}"
    
    if [ -z "$1" ]; then
        echo -e "${RED}❌ Please provide the join token from the manager${NC}"
        echo "Usage: $0 worker <JOIN_COMMAND>"
        exit 1
    fi
    
    JOIN_CMD="$1"
    
    echo "Joining Swarm as worker..."
    eval $JOIN_CMD
    
    echo -e "${GREEN}✅ Joined Swarm as worker!${NC}"
}

# Function to deploy the stack
deploy_stack() {
    echo -e "${YELLOW}🚀 Deploying GitHub Agent Stack...${NC}"
    
    cd ~/github-agent
    
    # Check if .env exists
    if [ ! -f .env ]; then
        echo -e "${RED}❌ .env file not found!${NC}"
        echo "Please create .env with your API keys"
        exit 1
    fi
    
    # Deploy the stack
    echo "Deploying stack..."
    docker stack deploy -c docker-stack.yml github-agent
    
    echo ""
    echo -e "${GREEN}✅ Stack deployed!${NC}"
    echo ""
    echo "View services:"
    echo "  docker stack ps github-agent"
    echo "  docker service ls"
    echo ""
    echo "View visualizer: http://$(hostname -I | awk '{print $1}'):8080"
}

# Function to show status
show_status() {
    echo -e "${YELLOW}📊 Swarm Status:${NC}"
    echo ""
    echo "Nodes:"
    docker node ls
    echo ""
    echo "Services:"
    docker stack ps github-agent 2>/dev/null || docker service ls
}

# Function to scale services
scale_service() {
    SERVICE=$1
    REPLICAS=$2
    
    if [ -z "$SERVICE" ] || [ -z "$REPLICAS" ]; then
        echo "Usage: $0 scale <service> <replicas>"
        echo "Example: $0 scale github-agent 2"
        exit 1
    fi
    
    docker service scale github-agent_$SERVICE=$REPLICAS
}

# Main menu
case "$1" in
    manager|init)
        setup_manager
        ;;
    worker|join)
        setup_worker "$2"
        ;;
    deploy)
        deploy_stack
        ;;
    status)
        show_status
        ;;
    scale)
        scale_service "$2" "$3"
        ;;
    remove|down)
        echo "Removing stack..."
        docker stack rm github-agent
        echo -e "${GREEN}✅ Stack removed${NC}"
        ;;
    *)
        echo "Docker Swarm Setup for GitHub Agent"
        echo ""
        echo "Usage:"
        echo "  $0 manager          - Initialize manager node (run on laptop)"
        echo "  $0 worker <TOKEN>   - Join as worker (run on each Pi)"
        echo "  $0 deploy           - Deploy the stack (run on manager)"
        echo "  $0 status           - Show swarm status"
        echo "  $0 scale <svc> <n> - Scale a service"
        echo "  $0 remove           - Remove the stack"
        echo ""
        echo "Quick Start:"
        echo "  1. On laptop:     $0 manager"
        echo "  2. On each Pi:    $0 worker '<JOIN_COMMAND>'"
        echo "  3. On laptop:     $0 deploy"
        exit 1
        ;;
esac
