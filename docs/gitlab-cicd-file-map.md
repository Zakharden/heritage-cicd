# GitLab CI/CD: разбор `.gitlab-ci.yml` и список добавленных файлов

## 1. Что делает текущий `.gitlab-ci.yml`
Файл построен как многоэтапный pipeline для монорепозитория (`backend` + `ui`) с quality/security gates, semantic versioning, контейнерной сборкой и GitOps-деплоем.

### 1.1 Подключаемые шаблоны
- `Jobs/SAST.gitlab-ci.yml`
- `Jobs/Secret-Detection.gitlab-ci.yml`

Это добавляет статический security-анализ и поиск секретов.

### 1.2 Стадии
- `quality`
- `test`
- `security`
- `version`
- `package`
- `build`
- `scan`
- `publish`
- `deploy`

### 1.3 Глобальная логика запуска
`workflow: rules` разрешает запуск pipeline для:
- тегов,
- Merge Request,
- branch push.

### 1.4 Ключевые переменные
- Maven/Node/Docker параметры сборки.
- Registry-переменные (`CONTAINER_*`).
- Trivy cache (`TRIVY_CACHE_DIR`).
- Путь к GitOps overlay (`KUSTOMIZE_OVERLAY_PATH`).

### 1.5 Монорепо-правила (`rules:changes`)
- Backend job'ы: только при изменениях в `backend/**`.
- UI job'ы: только при изменениях в `ui/**`.
- Общие job'ы: при изменениях в обеих папках.

### 1.6 Этап `quality`
- `commitlint`: валидирует сообщение коммита по Conventional Commits.
- `backend_checkstyle`: Java style/static checks.
- `ui_lint`: ESLint для фронтенда.

### 1.7 Этап `test`
- `backend_unit_tests`: Maven tests + JaCoCo coverage report.
- `ui_unit_tests`: Vitest + Cobertura coverage report.

### 1.8 Этап `security`
- `sast`: статический security-анализ.
- `secret_detection`: поиск секретов в коммитах.

### 1.9 Этап `version`
- `semantic_version`: semantic-release рассчитывает версию и теги (`vX.Y.Z`), формирует `version.env`.

### 1.10 Этап `package`
- `backend_package`: собирает `backend/target/backend.jar`.
- `ui_build_assets`: собирает `ui/dist`.

### 1.11 Этап `build`
- `build_backend_image`: Docker buildx с кэшем слоев.
- `build_ui_image`: Docker buildx с кэшем слоев.

### 1.12 Этап `scan`
- `scan_backend_image`: Trivy; блок при `CRITICAL`.
- `scan_ui_image`: Trivy; блок при `CRITICAL`.

### 1.13 Этап `publish`
- `push_backend_image`: push `:<APP_VERSION>` и `:latest`.
- `push_ui_image`: push `:<APP_VERSION>` и `:latest`.

### 1.14 Этап `deploy` (GitOps)
- `deploy_gitops`: не делает `kubectl apply`, а обновляет `k8s/overlays/prod/kustomization.yaml`, коммитит и пушит изменения. Дальше синхронизирует ArgoCD.

## 2. Какие файлы были добавлены в рамках CI/CD-рефакторинга
Ниже именно ключевые файлы, добавленные для новой архитектуры pipeline.

### 2.1 Корневой уровень
- `.gitignore`
- `.releaserc.cjs`

### 2.2 Backend
- `backend/checkstyle.xml`
- `backend/src/test/java/com/example/backend/HelloControllerTest.java`

### 2.3 UI
- `ui/.eslintrc.cjs`
- `ui/index.html`
- `ui/nginx.conf`
- `ui/package.json`
- `ui/package-lock.json`
- `ui/src/api.js`
- `ui/src/main.js`
- `ui/src/styles.css`
- `ui/tests/api.test.js`
- `ui/vitest.config.mjs`

### 2.4 Kubernetes / GitOps
- `k8s/overlays/prod/kustomization.yaml`
- `k8s/argocd/test-app-prod.yaml`

### 2.5 Документация
- `docs/ci-cd-senior-guide.md`
- `docs/gitlab-cicd-file-map.md` (этот файл)

## 3. Важно про commitlint
`commitlint` валидирует сообщение коммита в формате Conventional Commits.

Корректные примеры:
- `fix(ci): install commitlint globally`
- `feat(ui): add hello request button`
- `chore(gitops): update kustomize image tag`

Некорректный пример:
- `fix` (без `: subject`)

Если commit уже сделан и не запушен:
```bash
git commit --amend -m "fix(ci): adjust commit message format"
```

Если commit уже запушен и нужно исправить именно его message:
```bash
git commit --amend -m "fix(ci): adjust commit message format"
git push --force-with-lease origin main
```

Если не хотите переписывать историю — сделайте новый корректный коммит, и новый pipeline пройдет commitlint по новому message.
