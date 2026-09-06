@smoke
Feature: End-to-end build scenarios
  As a maintainer of devcontainer-builder
  I want a small set of full request/response round trips covering several axes at once
  So that a regression touching more than one area is caught by a single scenario

  These complement the narrowly-scoped scenarios in the other feature files;
  they intentionally combine several resolution axes in one request rather
  than isolating a single one.

  Background:
    Given the service is running
    And the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | (test buildkit) |
    And the server has no git credentials configured

  Scenario: A fully server-resolved bare request derives everything
    Given the server's registry mapping rules are:
      | pathPrefix | registry        |
      | example/   | (test registry) |
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/example-devcontainer:sha-(head:example/example-devcontainer.git)"

  Scenario: A fully caller-specified request wins over a server default it could have used
    Given the server's registry mapping rules are:
      | pathPrefix | registry        |
      | example/   | (test registry) |
    And the ambient registry auth is not configured
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "(git fixture git)/example/example-devcontainer.git",
        "branch": "release",
        "image": { "registry": "(authed registry)", "name": "custom-name", "tag": "v9.9.9" },
        "registryCredentials": { "registry": "(authed registry)", "username": "svc-bot", "password": "hunter2" }
      }
      """
    Then the response status should be 200
    And the resolved image should be "(authed registry)/custom-name:v9.9.9"

  Scenario: Server-resolved registry composes with request-supplied credentials for it
    Given the server's registry mapping rules are:
      | pathPrefix | registry           |
      | example/   | (authed registry)  |
    And the ambient registry auth is not configured
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "(git fixture git)/example/example-devcontainer.git",
        "registryCredentials": { "registry": "(authed registry)", "username": "svc-bot", "password": "hunter2" }
      }
      """
    Then the response status should be 200
    And the resolved image should be "(authed registry)/example-devcontainer:sha-(head:example/example-devcontainer.git)"

  Scenario: A server-configured SSH default combines with a registry mapping rule
    Given the server's git credentials are:
      | host          | kind | privateKey                  | pinnedHostKey |
      | (ssh fixture) | ssh  | (an authorized private key) | (unset)       |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | tofu |
    And the server's registry mapping rules are:
      | pathPrefix | registry        |
      | example/   | (test registry) |
    When I send a POST request to "/build" with body:
      """
      { "repository": "https://(ssh fixture)/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/example-devcontainer:sha-(head:example/example-devcontainer.git)"

  Scenario: A non-default branch is actually checked out, not silently ignored
    # Asserting against "release"'s own real HEAD sha (a genuinely different
    # commit from "main"'s, see charts/test-git-server/values.yaml's
    # extraBranches) - not just that the request succeeds - is what proves
    # `branch` actually took effect. If it were silently ignored (always
    # building "main" regardless), this would fail on a sha mismatch rather
    # than pass for the wrong reason.
    Given the server's registry mapping rules are:
      | pathPrefix | registry        |
      | example/   | (test registry) |
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git", "branch": "release" }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/example-devcontainer:sha-(head:example/example-devcontainer.git@release)"

  @negative
  Scenario: A failing clone surfaces its real underlying error end to end
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "(git fixture git)/example/example-devcontainer.git",
        "branch": "does-not-exist",
        "image": { "registry": "(test registry)", "name": "custom-name", "tag": "v1.0.0" }
      }
      """
    Then the response status should be 500
    And the response body should contain "git clone --branch does-not-exist --single-branch --depth 1"
