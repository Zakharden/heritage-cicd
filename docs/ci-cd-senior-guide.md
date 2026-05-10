# Senior CI/CD Guide: test-app (Spring Boot + UI)

## 1. Цели этой реализации
Этот pipeline собран как production-grade baseline для монорепозитория:
- быстрый (кэш + выборочный запуск job'ов по изменениям);
- безопасный (SAST, Secret Detection, Trivy-gate по CRITICAL);
- управляемый (семантические версии без ручного редактирования);
- разворачиваемый через GitOps (без прямого доступа CI к Kubernetes API).

## 2. Общая схема потока

```text
commit -> quality -> test -> security -> version -> package -> build -> scan -> publish -> deploy(gitops)
                                                                                         |
                                                                                         v
                                                                     commit image tags to kustomization
                                                                                         |
                                                                                         v
                                                                                ArgoCD sync in cluster
```

Ключевой принцип: CI строит и проверяет артефакты, а финальное применение в кластере делает ArgoCD, находясь внутри инфраструктуры.

## 3. Почему pipeline именно такой

### 3.1 Монорепо-правила (`rules:changes`)
- Backend job'ы: только при изменениях в `backend/**`.
- UI job'ы: только при изменениях в `ui/**`.

Зачем:
- исключаем пустые прогоны;
- ускоряем feedback для команды;
- экономим runner-минуты.

### 3.2 Кэширование
- Maven cache: `.m2/repository`.
- UI cache: `ui/node_modules` и `ui/.npm`.
- Docker layer cache: `--cache-from/--cache-to` в registry (`:buildcache`).

Зачем:
- зависимые слои и пакеты не скачиваются заново;
- Docker build не пересобирает неизменные слои;
- время pipeline становится предсказуемее.

## 4. Этапы pipeline подробно

## 4.1 `quality`
### `commitlint`
Проверяет последний commit на Conventional Commits.

Зачем:
- semantic-release корректно вычисляет версию;
- стандартизированный changelog/релизный поток.

### `backend_checkstyle`
Запускает Checkstyle по `backend/checkstyle.xml`.

Зачем:
- ранняя остановка при нарушениях code style/базовых правил;
- единообразие Java-кода.

### `ui_lint`
Запускает ESLint для UI.

Зачем:
- ловим дефекты до сборки (unused imports, ошибки синтаксиса/паттернов);
- дешевле исправить на ранней стадии.

## 4.2 `test`
### `backend_unit_tests`
- `mvn clean test jacoco:report`
- публикует:
  - JUnit отчет;
  - JaCoCo XML (`coverage_report` для GitLab);
  - процент покрытия в лог.

### `ui_unit_tests`
- `vitest` + coverage (`json-summary` + `cobertura`)
- публикует Cobertura-отчет в GitLab.

Зачем:
- coverage виден прямо в Merge Request;
- тесты и качество меняются в одном feedback loop.

## 4.3 `security`
### `sast` (GitLab template)
Статический анализ кода на уязвимости.

### `secret_detection` (GitLab template)
Ищет секреты в истории/изменениях (токены, пароли, ключи).

Зачем:
- shift-left безопасность;
- не пропускаем явные security-проблемы к стадии build/publish.

## 4.4 `version`
### `semantic_version`
- На default branch запускается `semantic-release`.
- Вычисляет новую версию из Conventional Commits.
- Ставит Git tag (`vX.Y.Z`).
- Пишет `version.env` (`APP_VERSION`, `RELEASE_CREATED`, `IMAGE_TAG`).
- На non-default branch формирует preview-версию (`<last-tag>-<branch>.<iid>`) без тега.

Зачем:
- убираем ручное редактирование версий;
- версия отражает фактическую семантику изменений;
- release-поток воспроизводим и аудируем.

Важно:
- для пуша тегов нужен `GIT_PUSH_TOKEN` с `write_repository`.

## 4.5 `package`
### `backend_package`
Собирает JAR и сохраняет фиксированный артефакт `backend/target/backend.jar`.

### `ui_build_assets`
`npm run build` -> артефакт `ui/dist`.

Зачем:
- Docker job получает готовые артефакты из предыдущего шага;
- разделение responsibilities: "собрать" и "упаковать в контейнер".

## 4.6 `build`
### `build_backend_image`
- multistage Dockerfile;
- берет JAR из артефакта;
- `--cache-from/--cache-to` в registry;
- создает tar-образ для следующего этапа.

### `build_ui_image`
- multistage Dockerfile;
- берет `dist` из артефакта;
- собирает runtime image (Nginx);
- создает tar-образ.

Почему tar, а не push сразу:
- сначала безопасность (Trivy), потом публикация.

## 4.7 `scan`
### `scan_backend_image` / `scan_ui_image`
- Trivy сканирует tar-образ;
- при `CRITICAL` job завершается с ошибкой (`exit-code 1`);
- pipeline блокируется до исправления.

Зачем:
- регистр не получает заведомо опасные образы;
- policy "critical = hard fail".

## 4.8 `publish`
### `push_backend_image` / `push_ui_image`
- только для default branch;
- пушатся два тега: `:<APP_VERSION>` и `:latest`;
- данные о опубликованных образах экспортируются как `.env`.

Если semantic-release не создал релиз (`RELEASE_CREATED=false`), push пропускается.

Зачем:
- не перезаписываем релизные версии при нерелизных изменениях;
- публикация завязана на semver-логику.

## 4.9 `deploy` (GitOps)
### `deploy_gitops`
- не вызывает `kubectl apply`;
- обновляет только `k8s/overlays/prod/kustomization.yaml` (newName/newTag);
- коммитит изменение в Git с `[skip ci]`;
- ArgoCD синхронизирует это изменение в кластере.

Зачем:
- CI не хранит прямой доступ к production Kubernetes;
- единый источник истины — Git;
- откат = `git revert`.

## 5. Kubernetes/GitOps слой

## 5.1 База
- `k8s/backend.yaml`, `k8s/ui.yaml`, `k8s/namespace.yaml`, `k8s/ingress.yaml`.
- В Deployment используются логические image имена: `backend-image`, `ui-image`.

## 5.2 Overlay
- `k8s/overlays/prod/kustomization.yaml` хранит реальные registry/name/tag через `images`.
- Именно этот файл меняется deploy-job'ом.

## 5.3 ArgoCD
ArgoCD должен смотреть путь `k8s/overlays/prod`.
При изменении `newTag` выполняется rolling update стандартными механизмами Kubernetes.

## 6. Dockerfiles: почему переписаны

## 6.1 Backend Dockerfile
- переведен на artifact-driven сборку (JAR из CI);
- multistage используется для минимального runtime-слоя;
- no build tooling в финальном образе.

## 6.2 UI Dockerfile
- runtime на `nginx-unprivileged`;
- в образ копируется только `dist`;
- Java/Maven часть UI исключена из runtime-контейнера.

Результат:
- меньше размер и поверхность атаки;
- быстрее pull/start;
- проще анализировать уязвимости.

## 7. Требуемые переменные GitLab

Обязательные:
- `CONTAINER_REGISTRY`
- `CONTAINER_REGISTRY_USER`
- `CONTAINER_REGISTRY_PASSWORD`
- `CONTAINER_IMAGE_PREFIX`
- `GIT_PUSH_TOKEN`

Рекомендуемые:
- `GIT_PUSH_USER` (`oauth2` для PAT)
- `GITOPS_BOT_NAME`
- `GITOPS_BOT_EMAIL`

Требование безопасности:
- секреты должны быть `Masked` и `Protected`.

## 8. Операционная модель

## 8.1 Что делает команда разработки
- пишет Conventional Commits;
- открывает MR;
- получает feedback по lint/test/security/coverage;
- после merge в default branch релиз и деплой выполняются автоматически.

## 8.2 Что делает платформа
- хранит токены в protected variables;
- поддерживает ArgoCD application;
- управляет политикой уязвимостей (критичность/исключения).

## 9. Частые проблемы и диагностика

## 9.1 `semantic-release` не может поставить тег
Проверить:
- задан ли `GIT_PUSH_TOKEN`;
- есть ли у токена `write_repository`;
- корректен ли `GIT_PUSH_USER`.

## 9.2 Trivy падает по CRITICAL
Варианты:
- обновить базовый образ;
- обновить зависимости;
- временно изолировать уязвимый пакет с documented risk acceptance.

## 9.3 Deploy job не обновляет манифест
Проверить:
- действительно ли push-job выполнился (не был `RELEASE_CREATED=false`);
- есть ли изменения в `k8s/overlays/prod/kustomization.yaml`;
- доступен ли push в репозиторий.

## 10. Почему это «senior way»
- быстрый feedback на уровне монорепо;
- явные quality и security gates до публикации;
- версионирование и теги без ручного вмешательства;
- immutable image flow (build -> scan -> push);
- GitOps вместо прямого CI -> cluster доступа;
- полная трассируемость через Git history и теги.
