# GitHub Actions CI/CD Pipeline Setup

## Overview
This pipeline builds Docker images when you push code to GitHub. Images are stored in GitHub Container Registry (ghcr.io) for you to pull and test locally in Docker Desktop.

## Branch Structure
- **Backend branch**: `backend-oms_pdm-microservice`
- **Frontend branch**: `frontend`

Each branch has its own CI/CD pipeline that builds only the respective component.

## Pipeline Stages
1. **test**: Runs tests for the specific branch (backend or frontend)
2. **build**: Builds Docker image for the specific branch
3. **push**: Pushes image to GitHub Container Registry
4. **deploy**: Manual deployment to Docker Desktop Kubernetes

## How It Works

### 1. Push Code to GitHub (Backend)
When you push code to `backend-oms_pdm-microservice` branch:
```bash
git checkout backend-oms_pdm-microservice
git add .
git commit -m "Backend changes"
git push origin backend-oms_pdm-microservice
```

### 2. Push Code to GitHub (Frontend)
When you push code to `frontend` branch:
```bash
git checkout frontend
git add .
git commit -m "Frontend changes"
git push origin frontend
```

### 3. Pipeline Runs Automatically
- When pushing to `backend-oms_pdm-microservice`: Backend tests → Build backend image → Push backend image
- When pushing to `frontend`: Frontend tests → Build frontend image → Push frontend image
- Images are pushed to GitHub Container Registry (ghcr.io)

### 4. Pull Images to Local Docker Desktop
After pipeline completes, pull images to your local machine:

```bash
# Login to GitHub Container Registry
# Username: Shashh27 (your GitHub username)
# Password: Your GitHub personal access token (with write:packages scope)
# Note: Docker Hub username (vinny520) is NOT used for GitHub Container Registry
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u Shashh27 --password-stdin

# Pull backend image (use latest or specific commit)
docker pull ghcr.io/Shashh27/cmf/backend:latest
# OR
docker pull ghcr.io/Shashh27/cmf/backend:<commit-sha>

# Pull frontend image
docker pull ghcr.io/Shashh27/cmf/frontend:latest
# OR
docker pull ghcr.io/Shashh27/cmf/frontend:<commit-sha>
```

### 5. Run in Docker Desktop Kubernetes
```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/backend-service.yaml
kubectl apply -f k8s/frontend-service.yaml

# Check status
kubectl get pods
kubectl get services
```

## GitHub Actions Configuration

### Required GitHub Settings
1. GitHub Actions is automatically enabled for public repositories
2. No additional configuration needed - uses built-in GitHub Actions
3. Images are stored in GitHub Container Registry (ghcr.io)

### Pipeline Triggers
- Push to `backend-oms_pdm-microservice` branch → Builds backend image
- Push to `frontend` branch → Builds frontend image
- Pull requests (tests only)

### Image Tags
- `latest`: Always points to the most recent build
- `<commit-sha>`: Specific commit version for reproducibility

## Viewing Pipeline Status
1. Go to your GitHub repository
2. Click "Actions" tab
3. View workflow runs, logs, and artifacts

## Troubleshooting

### Pipeline Not Triggering
- Check `.github/workflows/ci-cd.yml` exists in repository
- Verify GitHub Actions is enabled in repository settings

### Docker Login Fails
```bash
# Create GitHub personal access token with write:packages scope
# Settings → Developer settings → Personal access tokens → Tokens (classic)
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u Shashh27 --password-stdin
```

### Images Not Found
- Check workflow completed successfully
- Verify image name matches your GitHub repository
- Check GitHub Container Registry → Packages

## Next Steps (Phase 2)
After Phase 1 is working:
- Phase 2 will add automatic deployment to server
- Will stop old containers and start new ones on server
- Will handle database migrations
- Will include health checks

## Notes
- Tests are currently placeholders - add actual test commands
- Backend tests: Uncomment and configure `pytest` command
- Frontend tests: Uncomment and configure test command
- Images are built with multi-stage builds for optimization
- Backend includes FreeCAD dependencies (takes ~20 min first build)
- Environment variables (DB, MinIO) are already in backend image via .env file
