# EKS Deployment Guide

This guide turns the Helm chart into a production-style Amazon EKS deployment.

## Recommended AWS architecture

- `EKS` for Kubernetes
- `ECR` for application images
- `RDS PostgreSQL` instead of in-cluster PostgreSQL
- `ElastiCache Redis` instead of in-cluster Redis
- `S3` for uploaded media
- `SQS` for notification jobs
- `AWS Load Balancer Controller` for ingress
- `IRSA` for pod-to-AWS access
- `ACM` for public TLS certificates

## Service account strategy

This chart is ready for separate service accounts in EKS:

- `serviceAccount` → web / celery / celery-beat
- `notificationWorker.serviceAccount` → notification worker
- `fastapiAiServiceAccount` → FastAPI AI

That lets you keep:

- app role = S3 media access
- notification role = SQS access
- AI role = no AWS permissions by default

## Prerequisites

1. Create your EKS cluster and enable the cluster OIDC provider.
2. Install the AWS Load Balancer Controller in the cluster.
3. Push backend and AI images to ECR or another registry.
4. Create:
   - an app secret for Django and external credentials
   - a Firebase admin secret for the notification worker
5. Provision:
   - RDS PostgreSQL
   - ElastiCache Redis
   - S3 bucket
   - SQS queue
   - ACM certificate

## Kubernetes secrets

### App secret

Create a secret that matches `secrets.existingSecret`:

```bash
kubectl create secret generic locomotion-app-secrets \
  -n locomotion \
  --from-literal=DJANGO_SECRET_KEY='replace-me' \
  --from-literal=POSTGRES_PASSWORD='replace-me' \
  --from-literal=EMAIL_HOST_USER='replace-me' \
  --from-literal=EMAIL_HOST_PASSWORD='replace-me' \
  --from-literal=AWS_ACCESS_KEY_ID='replace-me' \
  --from-literal=AWS_SECRET_ACCESS_KEY='replace-me' \
  --from-literal=GEMINI_API_KEY='replace-me' \
  --from-literal=GROQ_API_KEY='' \
  --from-literal=RAZORPAY_KEY_SECRET='replace-me'
```

If you fully move to IRSA for AWS access, you can leave the AWS key entries empty and stop using static IAM keys in the app.

### Firebase secret

```bash
kubectl create secret generic locomotion-firebase-admin \
  -n locomotion \
  --from-file=firebase-service-account.json=./firebase-service-account.json
```

## Deploy

Copy and edit:

- `values-eks.example.yaml`

Then deploy:

```bash
helm upgrade --install locomotion ./helm/locomotion \
  --namespace locomotion \
  --create-namespace \
  -f ./helm/locomotion/values-eks.example.yaml
```

## Post-deploy checks

```bash
kubectl get pods -n locomotion
kubectl get ingress -n locomotion
kubectl get jobs -n locomotion
kubectl describe ingress -n locomotion
```

## Scaling notes

- Scale web and AI with HPA
- Run more than one celery worker for background throughput
- Run more than one notification worker only if message processing semantics are okay for your workload
- Keep PostgreSQL and Redis outside the cluster in production

## Hardening notes

- Prefer immutable image tags
- Prefer IRSA over static AWS keys
- Rotate Firebase and application secrets regularly
- Add network policies if your cluster supports them
- Add external monitoring and log shipping
