# ArgoCD File Structure Guide (test-app)

## 1. Файловая структура

```text
k8s/
├─ argocd/
│  └─ test-app-prod.yaml
├─ overlays/
│  └─ prod/
│     ├─ kustomization.yaml
│     └─ resources/
│        ├─ namespace.yaml
│        ├─ backend.yaml
│        ├─ ui.yaml
│        └─ ingress.yaml
├─ namespace.yaml
├─ backend.yaml
├─ ui.yaml
└─ ingress.yaml
```

## 2. Назначение каждого файла

`k8s/argocd/test-app-prod.yaml`
- Манифест ArgoCD `Application`.
- Говорит ArgoCD, какой репозиторий, ветку и путь читать (`k8s/overlays/prod`).
- Включает авто-синхронизацию (`automated`, `prune`, `selfHeal`).

`k8s/overlays/prod/kustomization.yaml`
- Центральный GitOps-файл для production overlay.
- Содержит список ресурсов, которые надо применить.
- Содержит блок `images`, который изменяет CI (newName/newTag).
- Этот файл редактируется job-ом `deploy_gitops` в `.gitlab-ci.yml`.

`k8s/overlays/prod/resources/namespace.yaml`
- Namespace `test-app`.
- Нужен, чтобы приложение могло развернуться в нужном namespace.

`k8s/overlays/prod/resources/backend.yaml`
- Deployment + Service backend.
- Базовый image указан как логическое имя `backend-image:0.0.0`.
- Реальный image/tag подставляет kustomize через `images` в overlay.

`k8s/overlays/prod/resources/ui.yaml`
- Deployment + Service ui.
- Базовый image указан как `ui-image:0.0.0`.
- Реальный image/tag также подставляется из overlay.

`k8s/overlays/prod/resources/ingress.yaml`
- Ingress-правила маршрутизации (`/api` в backend, остальное в ui).

`k8s/namespace.yaml`, `k8s/backend.yaml`, `k8s/ui.yaml`, `k8s/ingress.yaml`
- Базовые манифесты на уровне корня.
- Используются как исходник и reference.
- Для ArgoCD используется self-contained overlay в `k8s/overlays/prod/resources/`.

## 3. Как это работает end-to-end

1. CI собирает образы backend/ui и пушит их в registry с версией.
2. Job `deploy_gitops` в GitLab CI обновляет `k8s/overlays/prod/kustomization.yaml`:
- `images[].newName`
- `images[].newTag`
3. CI коммитит эти изменения обратно в `main` с `[skip ci]`.
4. ArgoCD замечает новый commit в `main` по пути `k8s/overlays/prod`.
5. ArgoCD делает `kustomize build` и применяет манифесты в кластер.
6. Kubernetes выполняет rolling update Deployments.

Ключевой принцип: CI не делает `kubectl apply` в прод-кластер. Источник истины — Git.

## 4. Что должно быть настроено в ArgoCD Application

`Source`
- Repo URL: `https://gitlab.com/zakhardenwp/test-app.git`
- Target revision: `main`
- Path: `k8s/overlays/prod`

`Destination`
- Cluster: `https://kubernetes.default.svc`
- Namespace: `test-app`

`Sync policy`
- Automated: `ON`
- Prune: `ON`
- Self Heal: `ON`
- Sync option: `CreateNamespace=true`

## 5. Почему overlay хранит локальные resources

ArgoCD/kustomize в безопасном режиме не позволяет ссылаться на файлы выше директории overlay (`../../...`).
Поэтому `k8s/overlays/prod` сделан self-contained: все ресурсы лежат внутри него в `resources/`.
Это устраняет ошибку вида:
- `file is not in or below .../k8s/overlays/prod`

## 6. Как менять инфраструктуру правильно

Изменение Deployment/Service/Ingress:
- Править файлы в `k8s/overlays/prod/resources/`.

Изменение образов/тегов:
- Ручной способ: править `k8s/overlays/prod/kustomization.yaml`.
- Авто-способ: дать CI сделать это через `deploy_gitops`.

Изменение ArgoCD behavior:
- Править `k8s/argocd/test-app-prod.yaml`.

## 7. Частые проблемы

`Application invalid: kustomize build ... security ... not in or below`
- Причина: ссылки на `../../` в overlay.
- Исправление: использовать только локальные пути внутри `k8s/overlays/prod`.

`Synced, но pod не стартует (ImagePullBackOff)`
- Причина: приватный registry без `imagePullSecret`.
- Исправление: создать secret в `test-app` и подключить к ServiceAccount/Deployment.

`ArgoCD не реагирует на новые теги`
- Проверить, что CI действительно закоммитил изменения в `kustomization.yaml`.
- Проверить `targetRevision` и `path` в Application.
