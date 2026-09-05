variable "service_url" {
  description = "Base URL of a running devcontainer-builder service, e.g. http://devcontainer-builder.devcontainer-builder.svc.cluster.local:8080 (no trailing slash)."
  type        = string
  validation {
    condition     = length(var.service_url) > 0
    error_message = "service_url must not be empty."
  }
}

variable "repository" {
  description = "Git URL of the repository containing the .devcontainer.json to build."
  type        = string
  validation {
    condition     = length(var.repository) > 0
    error_message = "repository must not be empty."
  }
}

variable "branch" {
  description = "Git branch to build from."
  type        = string
  default     = "main"
  validation {
    condition     = length(var.branch) > 0
    error_message = "branch must not be empty."
  }
}

variable "git_username" {
  description = "Username for git HTTPS authentication. Leave empty for public repositories."
  type        = string
  default     = ""
  sensitive   = true
}

variable "git_token" {
  description = "Password or token for git HTTPS authentication. Leave empty for public repositories."
  type        = string
  default     = ""
  sensitive   = true
}

variable "image_registry" {
  description = "Destination registry/namespace to push the built image to, e.g. ghcr.io/org."
  type        = string
  validation {
    condition     = length(var.image_registry) > 0
    error_message = "image_registry must not be empty."
  }
}

variable "image_name" {
  description = "Name of the image to push, e.g. myrepo-devcontainer."
  type        = string
  validation {
    condition     = length(var.image_name) > 0
    error_message = "image_name must not be empty."
  }
}

variable "image_tag" {
  description = "Tag to apply to the built image, e.g. a short git SHA."
  type        = string
  validation {
    condition     = length(var.image_tag) > 0
    error_message = "image_tag must not be empty."
  }
}
