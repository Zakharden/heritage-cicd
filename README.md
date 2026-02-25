# test-app

Монорепозиторий с двумя сервисами:
- `backend` — Spring Boot API (`/api/hello`, порт `8080`).
- `ui` — фронтенд на Vite (статическая сборка, runtime в Nginx на порту `8081`).

## Структура
- `backend/` — Java-код, тесты, Checkstyle/JaCoCo, Dockerfile.
- `ui/` — npm-проект (ESLint + Vitest + Vite), Dockerfile.
- `k8s/` — базовые манифесты.
- `k8s/overlays/prod/kustomization.yaml` — GitOps-оверлей для ArgoCD.
- `k8s/argocd/test-app-prod.yaml` — пример ArgoCD Application.
- `.gitlab-ci.yml` — Senior CI/CD pipeline.
- `.releaserc.cjs` — конфигурация semantic-release.
- `docs/ci-cd-senior-guide.md` — подробная техническая заметка.
- `docs/argocd-structure.md` — структура файлов ArgoCD/GitOps и принцип работы.

## Локальный запуск
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

## CI/CD Pipeline (GitLab)
Пайплайн включает этапы:
1. `quality`:
   - `commitlint` (Conventional Commits)
   - `backend_checkstyle`
   - `ui_lint`
2. `test`:
   - `backend_unit_tests` + JaCoCo coverage report
   - `ui_unit_tests` + Cobertura coverage report
3. `security`:
   - `sast` (GitLab SAST)
   - `secret_detection` (проверка утечек токенов/паролей)
4. `version`:
   - `semantic_version` (semantic-release, git tag `vX.Y.Z`)
5. `package`:
   - `backend_package` (JAR-артефакт)
   - `ui_build_assets` (`dist`-артефакт)
6. `build`:
   - multistage Docker build для backend/ui с `--cache-from/--cache-to`
7. `scan`:
   - Trivy scan; при `CRITICAL` уязвимости job падает
8. `publish`:
   - push образов `:<version>` и `:latest`
9. `deploy`:
   - GitOps commit: обновление `k8s/overlays/prod/kustomization.yaml`

## Монорепозиторий и правила запуска
- Backend job'ы запускаются только при изменениях в `backend/**`.
- UI job'ы запускаются только при изменениях в `ui/**`.
- Общие job'ы (version/security/deploy) учитывают изменения в обоих сервисах.

## Кэширование
- Maven: `.m2/repository`.
- UI: `ui/node_modules` + `ui/.npm`.
- Docker layers: registry cache (`:buildcache`).

## Необходимые CI/CD переменные
Минимум для публикации и GitOps:
- `CONTAINER_REGISTRY` (по умолчанию `CI_REGISTRY`)
- `CONTAINER_REGISTRY_USER`
- `CONTAINER_REGISTRY_PASSWORD`
- `CONTAINER_IMAGE_PREFIX` (например `docker.io/<org>/test-app`)
- `GIT_PUSH_TOKEN` (Masked + Protected, c правом `write_repository`)
- `GIT_PUSH_USER` (обычно `oauth2` для PAT)

Дополнительно:
- `GITOPS_BOT_NAME`
- `GITOPS_BOT_EMAIL`

## Semantic release
Версия рассчитывается из Conventional Commits:
- `feat:` -> minor
- `fix:` -> patch
- `BREAKING CHANGE:` -> major

Примеры:
- `feat: add oauth login`
- `fix: handle null response`
- `feat!: change hello contract` + `BREAKING CHANGE:`

## GitOps и ArgoCD
CI не применяет манифесты в кластер напрямую.
Pipeline делает commit с новыми image tags в `k8s/overlays/prod/kustomization.yaml`.
ArgoCD, установленный в кластере, синхронизирует изменения и выполняет Rolling Update.

Подробности и rationale: `docs/ci-cd-senior-guide.md`.
Структура ArgoCD и роли файлов: `docs/argocd-structure.md`.
