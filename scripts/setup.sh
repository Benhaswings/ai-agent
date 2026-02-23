#!/bin/bash
# Quick setup script for GitHub Agent

echo "🤖 GitHub Agent Setup"
echo "===================="

# Check prerequisites
check_cmd() {
  if command -v $1 &> /dev/null; then
    echo "✓ $1 found"
  else
    echo "✗ $1 not found - please install"
    exit 1
  fi
}

check_cmd git
check_cmd node
check_cmd npm

# Check env vars
if [ -z "$GITHUB_TOKEN" ]; then
  echo "⚠️  GITHUB_TOKEN not set"
  echo "   Get one at: https://github.com/settings/tokens"
  echo "   Needs: repo, workflow scopes"
fi

if [ -z "$GITHUB_REPO" ]; then
  echo "⚠️  GITHUB_REPO not set"
  echo "   Format: username/repo-name"
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install
cd event-handler && npm install
cd ../agent && npm install
cd ..

# Create sample job
mkdir -p jobs/pending jobs/processing jobs/completed jobs/failed memory

if [ ! -f "jobs/pending/sample.json" ]; then
  cat > jobs/pending/sample.json << 'EOF'
{
  "id": "sample-job",
  "type": "chat",
  "prompt": "Say hello from GitHub Actions!",
  "model": "llama3.2",
  "createdAt": "2026-02-21T00:00:00Z",
  "status": "pending"
}
EOF
  echo "✓ Created sample job"
fi

# Git setup
if [ ! -d ".git" ]; then
  echo ""
  echo "Initializing git repo..."
  git init
  git add -A
  git commit -m "Initial commit"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Create a GitHub repo and push this code"
echo "2. Add GITHUB_TOKEN and GITHUB_REPO to your environment"
echo "3. Run: npm start"
echo "4. Open http://localhost:3000"
echo ""
