terraform {
  required_providers {
    devcontainerbuilder = {
      source = "registry.terraform.io/alexanderilyin/devcontainerbuilder"
    }
  }
}

provider "devcontainerbuilder" {
  endpoint = "http://localhost:8080" # $APP_URL from step 1
}

resource "devcontainerbuilder_build" "example" {
  repository = "https://github.com/DeepSpaceCartel/rts-turbo.git"
  branch     = "resume-vault"

  image_spec = {
    registry = "docker.io/deepspacecartel"
  }

  git_credentials = {
    username = "alexanderilyin"
    token    = "github_pat_"
  }

  registry_credentials = {
    registry = "docker.io/deepspacecartel"   # must match image_spec.registry, or you'll get
                                              # a ValidateConfig warning (see build_resource.go)
    username = "deepspacecartel"
    password = "dckr_pat_"
  }
}

output "image" {
  value = devcontainerbuilder_build.example.image
}

output "resolved_registry" {
  value = devcontainerbuilder_build.example.resolved_registry
}

output "resolved_name" {
  value = devcontainerbuilder_build.example.resolved_name
}

output "resolved_tag" {
  value = devcontainerbuilder_build.example.resolved_tag
}
