# Docker Desktop Kubernetes Auto-Deployment Setup

## Problem
GitLab CI/CD runners (cloud-based) cannot access your local Docker Desktop Kubernetes cluster because it's running on your local machine.

## Solution: Self-Hosted GitLab Runner
You need to install a GitLab runner on your local machine that can access your Docker Desktop Kubernetes cluster.

## Setup Steps

### 1. Install GitLab Runner on Your Local Machine

#### Windows:
```powershell
# Download GitLab Runner
Invoke-WebRequest -Uri "https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-windows-amd64.exe" -OutFile "gitlab-runner.exe"

# Install as service
.\gitlab-runner.exe install
.\gitlab-runner.exe start
```

#### Linux/Mac:
```bash
# Download and install
curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash
sudo apt-get install gitlab-runner

# OR for Mac
brew install gitlab-runner
```

### 2. Register the Runner with Your GitLab Project

```bash
# Get registration token from GitLab
# Go to: https://gitlab.com/vinodoguboyina/cmf/-/settings/ci_cd
# Expand "Runners" section and copy "Registration token"

# Register the runner
gitlab-runner register \
  --url https://gitlab.com \
  --registration-token <YOUR_REGISTRATION_TOKEN> \
  --executor shell \
  --description "docker-desktop-k8s-runner" \
  --tag-list "docker-desktop,kubernetes" \
  --run-untagged=true \
  --locked=false
```

### 3. Configure Runner to Access Docker Desktop Kubernetes

The runner needs access to your local Kubernetes config:

```bash
# On Windows, the kubeconfig is at: %USERPROFILE%\.kube\config
# On Linux/Mac, it's at: ~/.kube/config

# The runner should automatically have access to Docker Desktop Kubernetes
# since it's running on the same machine
```

### 4. Update .gitlab-ci.yml to Use the Self-Hosted Runner

Add tags to the deploy job:

```yaml
deploy_kubernetes:
  stage: deploy
  image: bitnami/kubectl:latest
  tags:
    - docker-desktop
    - kubernetes
  before_script:
    - kubectl config use-context docker-desktop
  script:
    - echo "Deploying to Docker Desktop Kubernetes..."
    - kubectl apply -f k8s/backend-deployment.yaml
    - kubectl apply -f k8s/frontend-deployment.yaml
    - kubectl apply -f k8s/backend-service.yaml
    - kubectl apply -f k8s/frontend-service.yaml
    - kubectl rollout restart deployment cmf-backend
    - kubectl rollout restart deployment cmf-frontend
    - echo "Deployment completed successfully"
  only:
    - main
  needs:
    - push_backend
    - push_frontend
```

### 5. Enable Docker Desktop Kubernetes

1. Open Docker Desktop
2. Go to Settings → Kubernetes
3. Enable Kubernetes
4. Apply & Restart

### 6. Verify Kubernetes Connection

```bash
# Check if kubectl can connect to Docker Desktop Kubernetes
kubectl config use-context docker-desktop
kubectl get nodes
kubectl get pods -A
```

### 7. Test the Pipeline

1. Push code to GitLab
2. The pipeline will run on the cloud runners for test/build/push
3. The deploy stage will run on your local self-hosted runner
4. Deployment will automatically happen in your Docker Desktop Kubernetes

## Alternative: Manual Deployment (Simpler)

If the self-hosted runner setup is too complex, use this simpler approach:

### Update .gitlab-ci.yml to Skip Auto-Deploy

Comment out or remove the deploy_kubernetes job.

### Manual Deployment After Pipeline

After the pipeline completes and images are pushed:

```bash
# Pull images locally
docker pull registry.gitlab.com/vinodoguboyina/cmf/backend:latest
docker pull registry.gitlab.com/vinodoguboyina/cmf/frontend:latest

# Deploy to Docker Desktop Kubernetes
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/backend-service.yaml
kubectl apply -f k8s/frontend-service.yaml

# Restart deployments to use new images
kubectl rollout restart deployment cmf-backend
kubectl rollout restart deployment cmf-frontend

# Check status
kubectl get pods
kubectl get services
```

## Access Your Application

After deployment:

```bash
# Get service URLs
kubectl get services

# Access frontend (usually at localhost:port)
# Docker Desktop Kubernetes exposes LoadBalancer services on localhost
```

## Troubleshooting

### Runner Not Connecting
- Check GitLab → Settings → CI/CD → Runners
- Verify runner status is "green" (active)
- Check runner logs: `gitlab-runner verify`

### Kubernetes Connection Issues
```bash
# Check kubectl context
kubectl config current-context
kubectl config get-contexts

# Switch to Docker Desktop context
kubectl config use-context docker-desktop
```

### Images Not Pulling
- Check if images are in GitLab Container Registry
- Verify image pull secrets if needed
- Check pod events: `kubectl describe pod <pod-name>`
```
