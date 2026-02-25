# ☸️ Kubernetes Cluster Setup for GitHub Agent

Deploy your GitHub Agent bot on a 3-node Raspberry Pi 4 Kubernetes cluster using k3s!

## 📋 Requirements

- 3x Raspberry Pi 4 (4GB RAM each)
- MicroSD cards (32GB+ recommended)
- Network connectivity between Pis
- Basic Linux knowledge

## 🥝 Why k3s?

k3s is perfect for Raspberry Pi because it's:
- **Lightweight**: Uses less memory than standard K8s
- **Easy**: Single binary installation
- **ARM64 native**: Works perfectly on Pi
- **Production-ready**: Used in real deployments

## 🚀 Quick Start

### Step 1: Prepare SD Cards

1. Flash Raspberry Pi OS Lite (64-bit) to all 3 SD cards
2. Enable SSH by creating `ssh` file in boot partition
3. Configure WiFi (optional) or use Ethernet

### Step 2: Setup Master Node

On your first Pi (master):

```bash
# SSH into the Pi
ssh pi@pi-master

# Run setup script
sudo bash setup-k3s.sh master

# Save the token and IP address shown at the end
```

### Step 3: Setup Worker Nodes

On the other 2 Pis (workers):

```bash
# SSH into each worker
ssh pi@pi-worker-1

# Run setup script with master IP and token
sudo bash setup-k3s.sh worker <MASTER_IP> <TOKEN>
```

Repeat for the second worker.

### Step 4: Verify Cluster

On the master node:

```bash
# Check nodes
kubectl get nodes

# Should show 3 nodes:
# NAME         STATUS   ROLES                  AGE   VERSION
# pi-master    Ready    control-plane,master   5m    v1.28.x
# pi-worker1   Ready    <none>                 2m    v1.28.x
# pi-worker2   Ready    <none>                 1m    v1.28.x
```

## 🐳 Building ARM64 Docker Image

Since Raspberry Pi uses ARM64, we need to build the image for that architecture:

```bash
# On your WSL machine or any x86 machine with Docker:
# Install QEMU for cross-compilation
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes

# Build for ARM64
cd ~/github-agent
docker buildx create --use
docker buildx build --platform linux/arm64 -t github-agent-app:arm64 --load .

# Save image to transfer to Pi
docker save github-agent-app:arm64 > github-agent-arm64.tar

# Transfer to master Pi
scp github-agent-arm64.tar pi@pi-master:~/
```

On the master Pi:

```bash
# Import the image
sudo k3s ctr images import ~/github-agent-arm64.tar

# Or use docker and tag for k3s
sudo docker load < ~/github-agent-arm64.tar
sudo docker tag github-agent-app:arm64 github-agent-app:latest
```

## 📦 Deploy to Kubernetes

```bash
# Copy k8s files to master Pi
scp -r ~/github-agent/k8s pi@pi-master:~/

# SSH to master
ssh pi@pi-master

# Apply configurations
cd ~/k8s
kubectl apply -f deployment.yaml

# Verify deployment
kubectl get pods -n github-agent
kubectl get svc -n github-agent
```

## 🔍 Monitoring

```bash
# Watch pods
kubectl get pods -n github-agent -w

# View logs
kubectl logs -f deployment/github-agent-app -n github-agent
kubectl logs -f deployment/ollama -n github-agent
kubectl logs -f deployment/github-agent-processor -n github-agent

# Check resources
kubectl top nodes
kubectl top pods -n github-agent
```

## 🌐 Accessing Services

### From Any Pi:

```bash
# Get service URLs
kubectl get svc -n github-agent

# Port forward for testing
kubectl port-forward svc/github-agent-app 3000:3000 -n github-agent
# Now access http://localhost:3000 on the Pi
```

### From Your Network:

```bash
# Get NodePort
kubectl get svc github-agent-app -n github-agent
# Look for the NodePort (e.g., 30001)

# Access via any Pi IP
# http://<PI_IP>:<NODE_PORT>
```

## ⚡ Scaling

### Scale Ollama (if you have GPU Pis):

```bash
kubectl scale deployment ollama --replicas=2 -n github-agent
```

### Scale App:

```bash
kubectl scale deployment github-agent-app --replicas=2 -n github-agent
```

## 🔧 Maintenance

### Update Deployment:

```bash
# Edit and reapply
kubectl apply -f deployment.yaml

# Rolling restart
kubectl rollout restart deployment/github-agent-app -n github-agent
```

### Check Storage:

```bash
# View PVCs
kubectl get pvc -n github-agent

# View PV usage
kubectl exec -it deployment/ollama -n github-agent -- df -h
```

### Backup Data:

```bash
# Create backup job
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: backup
  namespace: github-agent
spec:
  template:
    spec:
      containers:
      - name: backup
        image: alpine
        command:
        - tar
        - czvf
        - /backup/github-agent-backup.tar.gz
        - /data
        volumeMounts:
        - name: data
          mountPath: /data
        - name: backup
          mountPath: /backup
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: github-agent-data-pvc
      - name: backup
        hostPath:
          path: /home/pi/backups
          type: DirectoryOrCreate
      restartPolicy: Never
EOF
```

## 🚨 Troubleshooting

### Pod Stuck Pending:

```bash
# Check events
kubectl describe pod <pod-name> -n github-agent

# Check storage
kubectl get pv,pvc -n github-agent
```

### OOM Killed:

```bash
# Increase memory limit
kubectl edit deployment ollama -n github-agent
# Change resources.limits.memory
```

### Image Pull Errors:

```bash
# Check if image is loaded
sudo k3s ctr images ls | grep github-agent

# Manually import
sudo k3s ctr images import github-agent-arm64.tar
```

## 📊 Resource Planning

With 3x Pi 4 (4GB each):

| Component | Memory | CPU | Notes |
|-----------|--------|-----|-------|
| Ollama | 2GB | 1 core | For AI models |
| GitHub Agent | 512MB | 0.5 cores | Telegram bot |
| Processor | 512MB | 0.5 cores | Job processor |
| k3s overhead | 512MB | - | System |
| **Total per node** | ~3.5GB | ~2 cores | |

## 🔄 High Availability

For true HA, you need:
- 3 master nodes (you have 3 Pis!)
- External load balancer (or virtual IP)
- Shared storage (NFS recommended)

### Convert to HA Setup:

```bash
# On all 3 Pis, install as servers with embedded etcd
curl -sfL https://get.k3s.io | sh -s - server \
  --cluster-init \
  --tls-san <VIRTUAL_IP>

# Join additional masters
curl -sfL https://get.k3s.io | sh -s - server \
  --server https://<FIRST_MASTER_IP>:6443 \
  --token <TOKEN>
```

## 🎯 Next Steps

1. ✅ Deploy the cluster
2. ✅ Build and load ARM64 image
3. ✅ Apply Kubernetes manifests
4. ✅ Verify all pods running
5. ✅ Test Telegram bot
6. ✅ Setup monitoring (Prometheus/Grafana)

## 📚 Resources

- [k3s Documentation](https://docs.k3s.io/)
- [Kubernetes on Raspberry Pi](https://rancher.com/docs/k3s/latest/en/installation/ha/)
- [ARM64 Docker Images](https://docs.docker.com/build/building/multi-platform/)

---

**Your 3-Pi Kubernetes cluster will provide:**
- ✅ High availability
- ✅ Auto-restart on failure
- ✅ Easy scaling
- ✅ Centralized management
- ✅ Production-ready infrastructure
