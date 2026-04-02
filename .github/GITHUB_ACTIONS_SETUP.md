# GitHub Actions Setup

This repo uses two GitHub Actions workflows:

- `CI`
  - backend Django tests
  - frontend lint + build
  - mobile lint
- `Deploy Backend`
  - deploys the Django backend to the EC2 / k3s server on pushes to `main`
  - uses AWS Systems Manager (SSM), not SSH

## Required GitHub Secrets

Add these in:

`GitHub -> Repo -> Settings -> Secrets and variables -> Actions`

### For backend deployment

- `AWS_ACCESS_KEY_ID`
  - IAM access key for GitHub Actions
- `AWS_SECRET_ACCESS_KEY`
  - IAM secret key for GitHub Actions
- `AWS_REGION`
  - Example: `ap-south-1`
- `EC2_INSTANCE_ID`
  - Example: `i-0a5fc452d5e5be708`

## EC2 Prerequisites For SSM

Before backend CD can work:

1. The EC2 instance must have an IAM role attached with:
   - `AmazonSSMManagedInstanceCore`
2. `amazon-ssm-agent` must be installed and running on the instance
3. The instance must appear in:
   - `AWS Systems Manager -> Explore nodes`

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
3. Confirm the EC2 instance is visible in Systems Manager.
4. Merge or push to `main`.
5. Confirm `Deploy Backend` starts after CI finishes successfully.
6. Verify the live backend:
   - login
   - bookings
   - driver accept
   - live tracking
