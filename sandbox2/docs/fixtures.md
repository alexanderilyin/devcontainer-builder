# Fixtures and charts

The `charts/` directory contains small deployable fixtures used by the real
integration tests:

- `nginx/` exercises a Deployment, Service, and test hook Pod.
- `rest-api/` provides the FastAPI application used by HTTP scenarios.
- `test-dependency/` exists to exercise Helm dependency commands.

Files used by upload and download scenarios live under
`features/fixtures/`. Fixtures should stay small, deterministic, and useful
for proving one behavior at a time.

The harness does not mock a Kubernetes API or HTTP server. When adding a
fixture, document the observable contract it provides and verify important
values from captured command or response output.
