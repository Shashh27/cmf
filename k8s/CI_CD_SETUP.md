# GitLab CI/CD Pipeline - Phase 1 Setup

## Overview
This pipeline builds Docker images when you push code to GitLab. Images are stored in GitLab Container Registry for you to pull and test locally in Docker Desktop.

## Branch Structure
- **Backend branch**: `backend-oms_pdm-microservice`
- **Frontend branch**: `frontend`

Each branch has its own CI/CD pipeline that builds only the respective component.

## Pipeline Stages
1. **test**: Runs tests for the specific branch (backend or frontend)
2. **build**: Builds Docker image for the specific branch
3. **push**: Pushes image to GitLab Container Registry
4. **deploy**: Manual deployment to Docker Desktop Kubernetes

## How It Works

### 1. Push Code to GitLab (Backend)
When you push code to `backend-oms_pdm-microservice` branch:
```bash
git checkout backend-oms_pdm-microservice
git add .
git commit -m "Backend changes"
git push origin backend-oms_pdm-microservice
```

### 2. Push Code to GitLab (Frontend)
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
- Images are pushed to GitLab Container Registry

### 4. Pull Images to Local Docker Desktop
After pipeline completes, pull images to your local machine:

```bash
# Login to GitLab Container Registry
# Username: vinodoguboyina
# Password: Suhmitha@7207026931
docker login registry.gitlab.com

# Pull backend image (use latest or specific commit)
docker pull registry.gitlab.com/vinodoguboyina/cmf/backend:latest
# OR
docker pull registry.gitlab.com/vinodoguboyina/cmf/backend:<commit-sha>

# Pull frontend image
docker pull registry.gitlab.com/vinodoguboyina/cmf/frontend:latest
# OR
docker pull registry.gitlab.com/vinodoguboyina/cmf/frontend:<commit-sha>
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

## GitLab CI/CD Configuration

### Required GitLab Settings
1. Enable GitLab Container Registry in your project settings
2. No additional configuration needed - uses built-in GitLab CI/CD

### Pipeline Triggers
- Push to `backend-oms_pdm-microservice` branch → Builds backend image
- Push to `frontend` branch → Builds frontend image
- Merge requests (tests only)

### Image Tags
- `latest`: Always points to the most recent build
- `<commit-sha>`: Specific commit version for reproducibility

## Viewing Pipeline Status
1. Go to your GitLab project
2. Click "CI/CD" → "Pipelines"
3. View pipeline status, logs, and artifacts

## Troubleshooting

### Pipeline Not Triggering
- Check `.gitlab-ci.yml` is in repository root
- Verify GitLab CI/CD is enabled in project settings

### Docker Login Fails
```bash
# Use GitLab personal access token if password login fails
docker login registry.gitlab.com
# Username: <your-gitlab-username>
# Password: <your-gitlab-personal-access-token>
```

### Images Not Found
- Check pipeline completed successfully
- Verify image name matches your GitLab project path
- Check GitLab Container Registry → Packages & Registries → Container Registry

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
