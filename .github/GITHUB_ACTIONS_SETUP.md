# GitHub Actions Setup

This repo uses two GitHub Actions workflows:

- `CI`
  - backend Django tests
  - frontend lint + build
  - mobile lint
- `Deploy Backend`
  - deploys the Django backend to the EC2 / k3s server on pushes to `main`

## Required GitHub Secrets

Add these in:

`GitHub -> Repo -> Settings -> Secrets and variables -> Actions`

### For backend deployment

- `EC2_HOST`
  - Example: `3.109.231.187`
- `EC2_PORT`
  - Usually: `22`
- `EC2_USER`
  - Usually: `ubuntu`
- `EC2_SSH_PRIVATE_KEY`
  - Your full PEM private key contents

## Notes

- Frontend production deployment can continue through Vercel's GitHub integration.
- Mobile CI currently runs lint only. Expo build automation can be added later with `EXPO_TOKEN` and EAS credentials.
- Backend CD assumes the server repo checkout lives at:
  - `/opt/locomotion`
- Backend CD assumes k3s uses:
  - `/etc/rancher/k3s/k3s.yaml`

## Workflow Behavior

### CI

Runs on:

- pushes to `main`, `develop`, or `dev`
- all pull requests

### Deploy Backend

Runs on:

- successful `CI` completion on `main`
- manual trigger via `workflow_dispatch`

## First-Time Validation

After adding the secrets:

1. Push this branch to GitHub.
2. Confirm `CI` passes.
3. Merge or push to `main`.
4. Confirm `Deploy Backend` starts after CI finishes successfully.
5. Verify the live backend:
   - login
   - bookings
   - driver accept
   - live tracking
