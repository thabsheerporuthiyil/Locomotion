# Locomotion Project Report

Version: 1.0  
Date: 2026-04-13  
Status: Current

## 1. Executive Summary

Locomotion is a full-stack ride booking and real-time mobility platform with rider, driver, and admin workflows. The system combines a React web frontend, a Django + DRF backend with real-time Channels, a FastAPI AI service, and an Expo React Native mobile app. The production backend runs on a single-node k3s cluster on AWS EC2 using Helm, with Docker images built in GitHub Actions and stored in AWS ECR.

## 2. Architecture Overview

Core runtime components:
- Web frontend: React 19 with Vite
- Backend API: Django + Django REST Framework
- Real-time: Django Channels + Redis
- Background jobs: Celery + Celery Beat
- AI service: FastAPI + Qdrant + SentenceTransformers + Gemini/Groq
- Mobile: Expo React Native (driver app)

Core infrastructure services:
- PostgreSQL: transactional data
- Redis: cache, channel layer, Celery broker
- DynamoDB: ride location history
- S3: media storage
- SQS: notification queue
- Firebase Cloud Messaging: push delivery
- ECR: backend image registry
- EC2 + k3s: runtime cluster

## 3. Data and Storage

- PostgreSQL stores users, drivers, vehicles, bookings, payments, and notifications.
- Redis supports real-time Channels and Celery background processing.
- DynamoDB stores sampled ride location history for admin playback and analytics.
- S3 stores user-uploaded media.
- SQS decouples notification delivery from request flow.

## 4. Notification Flow

Current production notification path:
1. Django publishes notification payloads to SQS.
2. AWS Lambda consumes SQS and sends FCM pushes.

The legacy Kubernetes notification worker remains available for local or fallback use, but the production Helm values disable it.

## 5. CI/CD and Deployment

CI (GitHub Actions):
- Backend tests
- Frontend lint and build
- Mobile lint
- Backend Docker image build and push to ECR

CD (GitHub Actions):
- Deploy backend via AWS SSM to EC2
- Pull image from ECR into k3s containerd
- Helm upgrade for the `locomotion` release

## 6. Deployment Models

Local development:
- Docker Compose runs web, celery, celery-beat, notification-worker, db, redis, qdrant, fastapi-ai, and nginx.

Production backend:
- Helm on k3s (single node EC2)
- Traefik ingress with TLS
- External PostgreSQL and Redis
- External S3, SQS, DynamoDB

## 7. Key Project Capabilities

- Rider and driver workflows with real-time updates
- Location tracking and playback
- Secure payments and wallet flows
- Admin monitoring and history playback
- AI-assisted driver matching and coaching

---

# Tools Documentation

This section documents the primary tools and technologies used across the stack, along with where they live in the codebase and how they are used.

## A. Web Frontend (React)

Location: `Locomotion React/Locomotion React`

Key tools:
- React 19 + Vite for the SPA and build pipeline.
- Tailwind CSS for styling.
- Zustand for state management.
- Axios for API requests.
- Firebase Web Messaging for FCM token registration and foreground notifications.
- Leaflet + Routing Machine for maps and trip routes.

Commands:
- `npm run dev`
- `npm run build`
- `npm run lint`

## B. Backend API (Django + DRF + Channels)

Location: `Locomotion/Locomotion`

Key tools:
- Django 6 + Django REST Framework for API endpoints.
- Django Channels for WebSocket and live location.
- Celery + Celery Beat for background jobs.
- Redis for cache, Channels layer, and Celery broker.
- SimpleJWT for authentication.
- Swagger/OpenAPI for API docs; Postman collections for validation.

Commands:
- `python manage.py runserver`
- `python manage.py migrate`
- `python manage.py test`

## C. Notification Delivery

Key tools:
- AWS SQS for queueing notification payloads.
- AWS Lambda (Console-managed) to consume the queue.
- Firebase Admin SDK (and FCM) to deliver pushes.

Queue:
- `locomotion-notifications` (eu-north-1)

Local fallback:
- `notification_worker.py` can be run under Docker Compose for local testing.

## D. AI Service (FastAPI)

Location: `Locomotion/ai_service`

Key tools:
- FastAPI for the AI service API.
- Qdrant for vector search.
- SentenceTransformers (`all-MiniLM-L6-v2`) for embeddings.
- LangChain + Gemini/Groq LLMs for coaching and summaries.

Key env vars:
- `QDRANT_HOST`
- `QDRANT_PORT`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `LLM_PROVIDER`

## E. Data Stores & AWS Services

Key tools:
- PostgreSQL (primary data)
- Redis (cache + realtime + broker)
- DynamoDB (ride history)
- S3 (media storage)
- SQS (notifications)
- Firebase Cloud Messaging (push delivery)

## F. Docker / Local Dev

Location: `Locomotion/Locomotion/docker-compose.yml`

Services:
- web, celery, celery-beat, notification-worker, db, redis, qdrant, fastapi-ai, nginx

## G. Kubernetes / Helm

Location: `Locomotion/Locomotion/helm/locomotion`

Key tools:
- k3s (single-node cluster on EC2)
- Helm for releases
- Traefik ingress with TLS

Main values file:
- `values-k3s-backend.yaml`

## H. CI/CD

Workflows:
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-backend.yml`

Key tools:
- GitHub Actions for CI/CD
- AWS ECR for backend images
- AWS SSM to run deploy commands on EC2

Required GitHub secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `EC2_INSTANCE_ID`
- `ECR_BACKEND_REPOSITORY`

---

## System Diagram

See `docs/locomotion-system-diagram.svg`.
