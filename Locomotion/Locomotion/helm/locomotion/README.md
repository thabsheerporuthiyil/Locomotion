# Locomotion Helm Chart

This chart is now the canonical Kubernetes deployment path for Locomotion.
It gives you one reusable deployment flow across local clusters, staging, and production.

## What this chart deploys

- Django web application
- Celery worker
- Celery beat scheduler
- Notification worker
- FastAPI AI service
- Optional PostgreSQL
- Optional Redis
- Optional Qdrant
- Ingress for `/` and `/api/ai`
- Pre-install / pre-upgrade migration job

## Production guidance

- Use managed PostgreSQL and Redis for production where possible.
- Use an existing Kubernetes secret manager flow instead of committing real secrets into values files.
- Keep `notificationWorker.firebase.existingSecretName` pointed at a pre-created secret that contains `firebase-service-account.json`.
- Set `ingress.hosts` and TLS for your real domains.
- Push immutable images and pin tags or digests in production values.

## Example install

```bash
helm upgrade --install locomotion ./helm/locomotion \
  --namespace locomotion \
  --create-namespace \
  -f ./helm/locomotion/values.yaml
```

## Example upgrades

```bash
helm upgrade locomotion ./helm/locomotion \
  --namespace locomotion \
  -f ./helm/locomotion/values.yaml
```

## Recommended setup flow

1. Build and push immutable images for:
   - Django backend
   - FastAPI AI
2. Pick a values file:
   - `values-local.example.yaml` for local / small cluster testing
   - `values-production.example.yaml` for production-style deployment
3. Create Kubernetes secrets for:
   - application secrets
   - Firebase service account for the notification worker
4. Start with bundled PostgreSQL / Redis / Qdrant only for non-production clusters.
5. For production, disable bundled stateful services and point the chart to managed services.
6. Cut traffic over via ingress after `helm upgrade --install` succeeds and the migration job completes.

## Notification worker

The chart now includes a dedicated notification worker deployment that matches your Docker setup.
It mounts the Firebase service account file and consumes SQS-based notification jobs without sharing
the web pod lifecycle.
