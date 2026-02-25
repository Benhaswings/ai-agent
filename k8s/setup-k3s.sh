#!/bin/bash
# Setup script for k3s on Raspberry Pi 4 cluster
# Run this on each Pi node

echo "🥝 Setting up k3s on Raspberry Pi"
echo "================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root (use sudo)"
  exit 1
fi

# Update system
echo "📦 Updating system..."
apt update && apt upgrade -y

# Install required packages
echo "🔧 Installing dependencies..."
apt install -y \
  curl \
  git \
  docker.io \
  containerd \
  software-properties-common \
  apt-transport-https \
  ca-certificates \
  gnupg \
  lsb-release

# Enable Docker
echo "🐳 Enabling Docker..."
systemctl enable docker
systemctl start docker
usermod -aG docker pi 2>/dev/null || usermod -aG docker $SUDO_USER

# Install k3s
echo "☸️  Installing k3s..."
if [ "$1" = "master" ] || [ "$1" = "server" ]; then
    # Install as master node
    echo "Installing k3s master..."
    curl -sfL https://get.k3s.io | sh -
    
    # Get token for workers
    echo ""
    echo "✅ Master node installed!"
    echo ""
    echo "📝 Node Token (save this for workers):"
    cat /var/lib/rancher/k3s/server/node-token
    echo ""
    echo "🌐 Master IP: $(hostname -I | awk '{print $1}')"
    
elif [ "$1" = "worker" ] || [ "$1" = "agent" ]; then
    # Install as worker node
    if [ -z "$2" ] || [ -z "$3" ]; then
        echo "❌ Usage: $0 worker <MASTER_IP> <TOKEN>"
        exit 1
    fi
    
    MASTER_IP=$2
    TOKEN=$3
    
    echo "Installing k3s worker, connecting to $MASTER_IP..."
    curl -sfL https://get.k3s.io | K3S_URL=https://$MASTER_IP:6443 K3S_TOKEN=$TOKEN sh -
    
    echo ""
    echo "✅ Worker node installed!"
else
    echo "❌ Usage:"
    echo "  Master: $0 master"
    echo "  Worker: $0 worker <MASTER_IP> <TOKEN>"
    exit 1
fi

# Configure k3s for ARM64
echo "⚙️  Configuring k3s for ARM64..."
mkdir -p /etc/rancher/k3s
cat > /etc/rancher/k3s/registries.yaml << 'EOF'
mirrors:
  docker.io:
    endpoint:
      - "https://registry-1.docker.io"
  "*":
    endpoint:
      - "https://registry-1.docker.io"
EOF

# Enable and start k3s
systemctl enable k3s || systemctl enable k3s-agent
systemctl start k3s || systemctl start k3s-agent

# Install kubectl
echo "🔧 Installing kubectl..."
curl -LO "https://dl.k8s/release/$(curl -L -s https://dl.k8s/release/stable.txt)/bin/linux/arm64/kubectl"
chmod +x kubectl
mv kubectl /usr/local/bin/

# Setup kubeconfig for pi user
if [ "$1" = "master" ] || [ "$1" = "server" ]; then
    mkdir -p /home/pi/.kube || mkdir -p /home/$SUDO_USER/.kube
    cp /etc/rancher/k3s/k3s.yaml /home/pi/.kube/config 2>/dev/null || cp /etc/rancher/k3s/k3s.yaml /home/$SUDO_USER/.kube/config
    chown pi:pi /home/pi/.kube/config 2>/dev/null || chown $SUDO_USER:$SUDO_USER /home/$SUDO_USER/.kube/config
    chmod 600 /home/pi/.kube/config 2>/dev/null || chmod 600 /home/$SUDO_USER/.kube/config
fi

echo ""
echo "✅ k3s setup complete!"
echo ""

if [ "$1" = "master" ] || [ "$1" = "server" ]; then
    echo "Verify with: kubectl get nodes"
    echo ""
    echo "📋 To add worker nodes, run on each worker:"
    echo "  curl -sfL https://get.k3s.io | K3S_URL=https://$(hostname -I | awk '{print $1}'):6443 K3S_TOKEN=$(cat /var/lib/rancher/k3s/server/node-token) sh -"
fi
