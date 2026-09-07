# sandbox2

`sandbox2` is a real-command BDD harness for Kubernetes-native applications.
It uses Cucumber and TypeScript to exercise Helm, `kubectl`, and HTTP APIs
without mocks.

The harness is designed around readable scenarios and observable behavior:
construct an object, perform an explicit action, then assert on the real
command or response.

## What it covers

- Helm charts, repositories, releases, and dependencies
- Kubernetes Deployments, Services, and Pods
- Polling for eventually consistent cluster state
- Real HTTP requests, authentication, uploads, downloads, and JSON APIs
- Reusable aliases and typed Cucumber data tables

Start with [Getting started](getting-started.md), then read the
[architecture](architecture.md) and [BDD conventions](bdd-conventions.md)
guides.
