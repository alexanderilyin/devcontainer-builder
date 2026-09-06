#!/usr/bin/env bash
# Installs the CLI tools the base devcontainer image doesn't already provide:
# Helm, Terraform, kubectl, k9s, Docker CLI + buildx plugin + devcontainers
# CLI, and the `helm tui` plugin. No Dev Container
# Features are used here (they aren't usable yet in this repo's Coder/K8s
# setup) - everything goes through plain shell so this script also works
# when invoked manually via install.sh at the repo root.
#
# Versions are intentionally not pinned: nothing else in this repo pins
# Helm/Terraform/kubectl either (CI's setup-helm/setup-terraform actions run
# unpinned, see .github/workflows/ci.yaml), so these installers just fetch
# whatever's currently latest/stable, matching that convention.
set -euo pipefail

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

arch="$(dpkg --print-architecture)"

if ! command -v curl >/dev/null 2>&1 || ! command -v gpg >/dev/null 2>&1; then
  $SUDO apt-get update
  $SUDO apt-get install -y --no-install-recommends ca-certificates curl gnupg
fi

# --- Helm ---------------------------------------------------------------
if ! command -v helm >/dev/null 2>&1; then
  echo "Installing Helm..."
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | $SUDO bash
fi

# --- Terraform (HashiCorp apt repo, same pattern as the Docker apt repo in
#     service/Dockerfile: import key -> add source -> apt-get install) ----
if ! command -v terraform >/dev/null 2>&1; then
  echo "Installing Terraform..."
  $SUDO install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://apt.releases.hashicorp.com/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/hashicorp.gpg
  $SUDO chmod a+r /etc/apt/keyrings/hashicorp.gpg
  echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/hashicorp.gpg] https://apt.releases.hashicorp.com $(. /etc/os-release && echo "$VERSION_CODENAME") main" \
    | $SUDO tee /etc/apt/sources.list.d/hashicorp.list > /dev/null
  $SUDO apt-get update
  $SUDO apt-get install -y --no-install-recommends terraform
fi

# --- Docker CLI + buildx plugin + devcontainers CLI (same apt repo and
#     `npm install -g @devcontainers/cli` as service/Dockerfile - this is
#     for developing/testing builds against the remote BuildKit endpoint
#     from the workspace, not for running containers locally: no dockerd
#     here either) --------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing docker-ce-cli + docker-buildx-plugin..."
  $SUDO install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null
  $SUDO apt-get update
  $SUDO apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin
fi

if ! command -v devcontainer >/dev/null 2>&1; then
  echo "Installing @devcontainers/cli..."
  npm install -g @devcontainers/cli
fi

# --- kubectl --------------------------------------------------------------
if ! command -v kubectl >/dev/null 2>&1; then
  echo "Installing kubectl..."
  kubectl_version="$(curl -fsSL https://dl.k8s.io/release/stable.txt)"
  tmp_kubectl="$(mktemp)"
  curl -fsSL -o "$tmp_kubectl" "https://dl.k8s.io/release/${kubectl_version}/bin/linux/${arch}/kubectl"
  $SUDO install -m 0755 "$tmp_kubectl" /usr/local/bin/kubectl
  rm -f "$tmp_kubectl"
fi

# --- k9s --------------------------------------------------------------
if ! command -v k9s >/dev/null 2>&1; then
  echo "Installing k9s..."
  tmp_dir="$(mktemp -d)"
  asset_url="$(curl -fsSL https://api.github.com/repos/derailed/k9s/releases/latest \
    | grep -oE '"browser_download_url":[[:space:]]*"[^"]*[Ll]inux_'"${arch}"'\.tar\.gz"' \
    | head -n1 | cut -d'"' -f4)"
  curl -fsSL -o "$tmp_dir/k9s.tar.gz" "$asset_url"
  tar -xzf "$tmp_dir/k9s.tar.gz" -C "$tmp_dir" k9s
  $SUDO install -m 0755 "$tmp_dir/k9s" /usr/local/bin/k9s
  rm -rf "$tmp_dir"
fi

# --- helm tui plugin (https://github.com/pidanou/helm-tui) ---------------
# Ships a prebuilt binary via its own install-binary.sh hook - no Go
# toolchain needed. Run as `helm tui` once installed.
if command -v helm >/dev/null 2>&1 && ! helm plugin list 2>/dev/null | grep -qw tui; then
  echo "Installing helm tui plugin..."
  helm plugin install https://github.com/pidanou/helm-tui
fi

echo "postCreateCommand.sh done: helm, terraform, kubectl, k9s, docker cli, devcontainers cli, helm tui plugin ready."
