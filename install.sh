#!/usr/bin/env bash
# Manual bootstrap for developing this repo in an environment that can't run
# Dev Containers yet (e.g. a plain Coder workspace pod on Kubernetes with a
# service account mounted, no Dev Container runtime). It installs what
# .devcontainer/devcontainer.json's typescript-node base image would
# otherwise provide - Node 20, npm, git - then hands off to
# .devcontainer/postCreateCommand.sh for Helm/Terraform/kubectl/k9s/helm tui.
#
# Once Dev Containers work in this Coder/K8s setup, devcontainer.json +
# postCreateCommand.sh alone are sufficient and this file can be deleted.
set -euo pipefail

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Node 20 + npm (NodeSource apt repo, matching service/Dockerfile's
#     pinned major version and CI's actions/setup-node node-version) -------
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -ne 20 ]; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
  $SUDO apt-get install -y --no-install-recommends nodejs
fi

# --- git ------------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  echo "Installing git..."
  $SUDO apt-get update
  $SUDO apt-get install -y --no-install-recommends git
fi

# --- Helm, Terraform, kubectl, k9s, helm tui plugin ------------------------
bash "$repo_root/.devcontainer/postCreateCommand.sh"

echo "install.sh done: node, npm, git, helm, terraform, kubectl, k9s, helm tui plugin ready."
