terraform {
  required_version = ">= 1.0"

  required_providers {
    http = {
      source  = "hashicorp/http"
      version = ">= 3.4"
    }
  }
}

locals {
  git_credentials = var.git_username != "" && var.git_token != "" ? {
    username = var.git_username
    token    = var.git_token
  } : null
}

# Calls a running devcontainer-builder service, which clones `repository`,
# builds its devcontainer.json against a remote BuildKit builder, pushes the
# result, and returns the pushed image reference. Conceptually the same role
# as a PersistentVolumeClaim provisioned ahead of a workspace pod: a resource
# the Workspace Template depends on before the pod's image is known.
data "http" "build" {
  url    = "${var.service_url}/build"
  method = "POST"

  request_headers = {
    Content-Type = "application/json"
  }

  request_body = jsonencode({
    repository     = var.repository
    branch         = var.branch
    gitCredentials = local.git_credentials
    image = {
      registry = var.image_registry
      name     = var.image_name
      tag      = var.image_tag
    }
  })
}

locals {
  build_response = jsondecode(data.http.build.response_body)
}
