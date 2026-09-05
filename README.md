# devcontainer-builder

Builds a container image from a git repository's `.devcontainer.json` using a
remote [BuildKit](https://github.com/moby/buildkit) builder, and pushes it to
a registry - so a [Coder](https://github.com/coder/coder) Workspace Template
running on Kubernetes can boot a workspace straight from a repo URL, without
a dedicated CI pipeline to pre-build the image.

## Why

Coder Workspace Templates on Kubernetes need a container image at
pod-scheduling time. Templates are applied by coderd's own isolated Terraform
provisioner, which can't install tools once and reuse that across workspace
provisions - so building the devcontainer image has to happen in a separate,
long-running service, called from the template the same way it already calls
out to Kubernetes to provision a PersistentVolumeClaim before the pod.

## Layout

- [`service/`](service) - the HTTP service: clones the repo, configures
  `docker buildx` against a remote BuildKit endpoint, runs `devcontainer
  build --push`, and returns the resulting image reference.
- [`charts/devcontainer-builder/`](charts/devcontainer-builder) - a Helm
  chart that deploys the service into a Kubernetes cluster.
- [`terraform/devcontainer-build/`](terraform/devcontainer-build) - a
  Terraform module that calls an already-running instance of the service and
  exposes the built image as an output, for use from a Workspace Template.

## Documentation

- [`docs/claude/plans/`](docs/claude/plans) - implementation plans written
  before a change lands, numbered in the order they were authored.
  - [001-devcontainer](docs/claude/plans/001-devcontainer.md) - adds
    `.devcontainer.json` and manual-mode bootstrap scripts so this repo can be
    developed from a Dev Container (or a plain pod, until Dev Containers are
    wired up in this Coder/K8s setup).

## Status

Early scaffold. Not yet wired into any real infrastructure or published as a
Coder Registry module - see the sequencing notes in each subdirectory's
README/comments for what's still open (git-credential handling on private
repos, request/response contract stability, end-to-end tests against a live
BuildKit endpoint).

## License

MIT (see [LICENSE](LICENSE)) - placeholder, change if you want something else.
