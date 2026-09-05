# This module's only resource is `data "http" "build"`, and an `http` data
# source always executes its request as part of building the plan - there is
# no way to "plan" it without actually calling the service. So the tests
# here are limited to variable-validation failures, which are checked before
# the data source is ever touched. Exercising the request/response contract
# for real needs either a live devcontainer-builder service or a
# `mock_provider "http"` block (Terraform test mocking) - left as follow-up
# once the service's request/response shape has settled.

variables {
  service_url    = "http://devcontainer-builder.example.svc.cluster.local:8080"
  repository     = "https://github.com/example/example-devcontainer.git"
  branch         = "main"
  image_registry = "ghcr.io/example"
  image_name     = "example-devcontainer"
  image_tag      = "sha-abc1234"
}

run "rejects_empty_repository" {
  command = plan

  variables {
    repository = ""
  }

  expect_failures = [
    var.repository,
  ]
}

run "rejects_empty_service_url" {
  command = plan

  variables {
    service_url = ""
  }

  expect_failures = [
    var.service_url,
  ]
}

run "rejects_empty_image_tag" {
  command = plan

  variables {
    image_tag = ""
  }

  expect_failures = [
    var.image_tag,
  ]
}
