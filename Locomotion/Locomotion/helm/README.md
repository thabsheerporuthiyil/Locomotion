# Helm Deployments

This directory is now the single Kubernetes deployment source for Locomotion.

## Structure

- `locomotion/Chart.yaml` — Helm chart metadata
- `locomotion/values.yaml` — base values
- `locomotion/values-local.example.yaml` — local or small-cluster example
- `locomotion/values-eks.example.yaml` — Amazon EKS example
- `locomotion/values-production.example.yaml` — production-style example
- `locomotion/EKS-DEPLOYMENT.md` — EKS rollout guide
- `locomotion/templates/` — Kubernetes templates

## Recommended workflow

1. Copy one of the example values files.
2. Adjust image repositories, domains, secrets, and external service endpoints.
3. Create required Kubernetes secrets.
4. Deploy with `helm upgrade --install`.

## Example

```bash
helm upgrade --install locomotion ./helm/locomotion \
  --namespace locomotion \
  --create-namespace \
  -f ./helm/locomotion/values-production.example.yaml
```
