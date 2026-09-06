@smoke
Feature: End-to-end build scenarios
  As a maintainer of devcontainer-builder
  I want a small set of full request/response round trips covering several axes at once
  So that a regression touching more than one area is caught by a single scenario

  These complement the narrowly-scoped scenarios in the other feature files;
  they intentionally combine several resolution axes in one request rather
  than isolating a single one.

  Background:
    Given the following fixture releases are registered:
      | fixture              | release              |
      | test-registry        | test-registry        |
      | test-registry-authed | test-registry-authed |
      | test-buildkit        | test-buildkit         |
      | test-git-server      | test-git-server       |
    And the test-registry fixture is deployed
    And the test-registry-authed fixture is deployed with username "svc-bot" and password "hunter2"
    And the test-buildkit fixture is deployed, trusting test-registry and test-registry-authed as insecure registries
    And the test-git-server fixture is deployed, serving:
      | protocol | port |
      | git      | 9418 |
      | http     | 8080 |
      | https    | 443  |
      | ssh      | 22   |
    And the test-registry fixture's URL is known as "<registry-url>"
    And the test-registry-authed fixture's URL is known as "<authed-registry-url>"
    And the test-buildkit fixture's endpoint is known as "<buildkit-endpoint>"
    And the test-git-server fixture's bare host is known as "<git-host>"
    And the test-git-server fixture's git protocol URL is known as "<git-url>"
    And the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | <buildkit-endpoint> |
    And the server has no git credentials configured

  Scenario: A fully server-resolved bare request derives everything
    Given the server's registry mapping rules are:
      | pathPrefix | registry        |
      | example/   | <registry-url> |
    And the current HEAD short sha of "example/example-devcontainer.git" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/example-devcontainer:sha-<expected-sha>"

  Scenario: A fully caller-specified request wins over a server default it could have used
    Given the server's registry mapping rules are:
      | pathPrefix | registry        |
      | example/   | <registry-url> |
    And the ambient registry auth is not configured
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "branch": "release",
        "image": { "registry": "<authed-registry-url>", "name": "custom-name", "tag": "v9.9.9" },
        "registryCredentials": { "registry": "<authed-registry-url>", "username": "svc-bot", "password": "hunter2" }
      }
      """
    Then the response status should be 200
    And the resolved image should be "<authed-registry-url>/custom-name:v9.9.9"

  Scenario: Server-resolved registry composes with request-supplied credentials for it
    Given the server's registry mapping rules are:
      | pathPrefix | registry           |
      | example/   | <authed-registry-url>  |
    And the ambient registry auth is not configured
    And the current HEAD short sha of "example/example-devcontainer.git" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "registryCredentials": { "registry": "<authed-registry-url>", "username": "svc-bot", "password": "hunter2" }
      }
      """
    Then the response status should be 200
    And the resolved image should be "<authed-registry-url>/example-devcontainer:sha-<expected-sha>"

  Scenario: A server-configured SSH default combines with a registry mapping rule
    Given the test-git-server fixture's real authorized SSH private key named "<authorized-key>"
    And the server's git credentials are:
      | host          | kind | privateKey     | pinnedHostKey |
      | <git-host> | ssh  | <authorized-key> | (unset)       |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | tofu |
    And the server's registry mapping rules are:
      | pathPrefix | registry        |
      | example/   | <registry-url> |
    And the current HEAD short sha of "example/example-devcontainer.git" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "https://<git-host>/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/example-devcontainer:sha-<expected-sha>"

  Scenario: A non-default branch is actually checked out, not silently ignored
    # Asserting against "release"'s own real HEAD sha (a genuinely different
    # commit from "main"'s, see charts/test-git-server/values.yaml's
    # extraBranches) - not just that the request succeeds - is what proves
    # `branch` actually took effect. If it were silently ignored (always
    # building "main" regardless), this would fail on a sha mismatch rather
    # than pass for the wrong reason.
    Given the server's registry mapping rules are:
      | pathPrefix | registry        |
      | example/   | <registry-url> |
    And the current HEAD short sha of "example/example-devcontainer.git" on branch "release" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/example/example-devcontainer.git", "branch": "release" }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/example-devcontainer:sha-<expected-sha>"

  @negative
  Scenario: A failing clone surfaces its real underlying error end to end
    Given the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "branch": "does-not-exist",
        "image": { "registry": "<registry-url>", "name": "custom-name", "tag": "v1.0.0" }
      }
      """
    Then the response status should be 500
    And the response body should contain "git clone --branch does-not-exist --single-branch --depth 1"
