# Heritage CI/CD Reference Pipeline

Reference monorepo for a backend + frontend application delivery flow with quality gates, security scanning, container builds, semantic release, and GitOps deployment.

The application itself is intentionally small. The main focus of this repository is the delivery system around it: how code is checked, tested, packaged, scanned, versioned, published, and promoted through Kubernetes manifests.

## What This Repository Demonstrates

- Monorepo CI/CD structure for backend and frontend services.
- Backend quality gates with Maven, Checkstyle, unit tests, and JaCoCo coverage.
- Frontend quality gates with npm, ESLint, Vitest, and Vite build validation.
- Container build flow for both services.
- Security checks with SAST, secret detection, and Trivy image scanning.
- Semantic release based on Conventional Commits.
- GitOps deployment flow through Kubernetes overlays and Argo CD.
- Path-based pipeline rules so backend and UI jobs run only when relevant files change.

## Application Components

- `backend/` - Spring Boot API with `/api/hello` on port `8080`, tests, Checkstyle, JaCoCo, and Dockerfile.
- `ui/` - Vite-based frontend, built as static assets and served through Nginx on port `8081`.
- `k8s/` - base Kubernetes manifests.
- `k8s/overlays/prod/kustomization.yaml` - production-style Kustomize overlay updated by the GitOps flow.
- `k8s/argocd/test-app-prod.yaml` - example Argo CD Application.
- `.gitlab-ci.yml` - CI/CD pipeline definition.
- `.releaserc.cjs` - semantic-release configuration.
- `docs/ci-cd-senior-guide.md` - detailed pipeline rationale.
- `docs/argocd-structure.md` - Argo CD and GitOps file structure.

## Local Validation

### Backend

```bash
cd backend
mvn clean test
mvn spring-boot:run
```

### UI

```bash
cd ui
npm ci
npm run lint
npm run test:ci
npm run build
npm run dev
```

## CI/CD Pipeline

The GitLab pipeline is organized as a full delivery path:

1. `quality`
   - `commitlint` for Conventional Commits.
   - `backend_checkstyle`.
   - `ui_lint`.
2. `test`
   - Backend unit tests with JaCoCo coverage report.
   - UI unit tests with Cobertura coverage report.
3. `security`
   - GitLab SAST.
   - Secret detection.
4. `version`
   - `semantic_version` with semantic-release and Git tag creation.
5. `package`
   - Backend JAR artifact.
   - UI `dist` artifact.
6. `build`
   - Multistage Docker builds for backend and UI.
   - Docker layer cache through registry cache.
7. `scan`
   - Trivy image scanning.
   - Pipeline fails on `CRITICAL` vulnerabilities.
8. `publish`
   - Pushes versioned and `latest` images.
9. `deploy`
   - Commits updated image tags to `k8s/overlays/prod/kustomization.yaml`.
   - Argo CD applies the GitOps state to the cluster.

## Monorepo Rules

- Backend jobs run only when `backend/**` changes.
- UI jobs run only when `ui/**` changes.
- Shared jobs such as versioning, security, build, publish, and deploy account for changes across both services.
- Pipeline stages are explicit so a failed quality or security gate stops promotion early.

## Caching

- Maven: `.m2/repository`.
- UI: `ui/node_modules` and `ui/.npm`.
- Docker layers: registry cache with `:buildcache`.

## Required CI/CD Variables

Minimum variables for publishing and GitOps updates:

- `CONTAINER_REGISTRY` - defaults to `CI_REGISTRY`.
- `CONTAINER_REGISTRY_USER`.
- `CONTAINER_REGISTRY_PASSWORD`.
- `CONTAINER_IMAGE_PREFIX` - for example `docker.io/<org>/test-app`.
- `GIT_PUSH_TOKEN` - masked and protected token with `write_repository`.
- `GIT_PUSH_USER` - usually `oauth2` for PAT-based GitLab pushes.

Optional:

- `GITOPS_BOT_NAME`.
- `GITOPS_BOT_EMAIL`.

## Semantic Release

Versioning is derived from Conventional Commits:

- `feat:` creates a minor release.
- `fix:` creates a patch release.
- `BREAKING CHANGE:` creates a major release.

Examples:

- `feat: add oauth login`.
- `fix: handle null response`.
- `feat!: change hello contract` with `BREAKING CHANGE:`.

## GitOps and Argo CD

The CI pipeline does not apply Kubernetes manifests directly to the cluster.

Instead, it commits updated image tags to `k8s/overlays/prod/kustomization.yaml`. Argo CD watches the repository, detects the desired-state change, and performs the rollout from Git.

This keeps deployment state auditable and reviewable:

- application image versions are visible in Git;
- rollout changes are represented as commits;
- cluster reconciliation is handled by Argo CD;
- rollback can be performed by reverting Git state.

More details:

- `docs/ci-cd-senior-guide.md`.
- `docs/argocd-structure.md`.

## Safety Notes

- This repository is a reference implementation, not a drop-in production platform.
- Secrets must be supplied through protected CI/CD variables or an external secret manager.
- The example Argo CD and Kubernetes manifests should be reviewed and adapted before use in a real environment.
- Container image names, registry credentials, and Git push credentials must never be committed to the repository.
