Feature: Registry push authentication
  As a caller of devcontainer-builder
  I want to optionally supply my own registry push credentials
  So that I'm not limited to whatever the service's ambient registry auth covers

  Runs against two real registry fixtures (see charts/test-registry and
  features/support/build_fixtures.js): an anonymous one that accepts any
  push, and one that enforces HTTP basic auth (htpasswd) - only the latter
  can actually distinguish "right credentials" from "wrong/no credentials",
  which is what most of these scenarios are really testing. A real,
  disposable BuildKit instance does the actual push in every scenario.

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
    And the test-git-server fixture's git protocol URL is known as "<git-url>"
    And the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | <buildkit-endpoint> |
    And the server has no git credentials configured
    And the server's registry mapping rules are empty

  @client-request
  Scenario: No credentials at all succeed against a registry that doesn't require auth
    Given the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "registry": "<registry-url>" }
      }
      """
    Then the response status should be 200

  @client-request
  Scenario: Correct ambient registry auth succeeds against an auth-enforcing registry
    Given the ambient registry auth is configured for "<authed-registry-url>" with username "svc-bot" and password "hunter2"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "registry": "<authed-registry-url>" }
      }
      """
    Then the response status should be 200

  @negative @client-request
  Scenario: No ambient registry auth and no registryCredentials fails against an auth-enforcing registry
    Given the ambient registry auth is not configured
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "registry": "<authed-registry-url>" }
      }
      """
    Then the response status should be 500
    And the service logs should contain "401"

  @client-request
  Scenario: Correct registryCredentials succeed against an auth-enforcing registry with no ambient auth
    Given the ambient registry auth is not configured
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "registry": "<authed-registry-url>" },
        "registryCredentials": { "registry": "<authed-registry-url>", "username": "svc-bot", "password": "hunter2" }
      }
      """
    Then the response status should be 200

  @negative @client-request
  Scenario: Wrong registryCredentials fail against an auth-enforcing registry
    Given the ambient registry auth is not configured
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "registry": "<authed-registry-url>" },
        "registryCredentials": { "registry": "<authed-registry-url>", "username": "svc-bot", "password": "wrong-password" }
      }
      """
    Then the response status should be 500
    And the service logs should contain "401"

  @negative @client-request
  Scenario: registryCredentials for a different registry than image.registry have no effect on the actual push
    Given the ambient registry auth is not configured
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "registry": "<authed-registry-url>" },
        "registryCredentials": { "registry": "<registry-url>", "username": "svc-bot", "password": "hunter2" }
      }
      """
    Then the response status should be 500
    And the service logs should contain "401"

  Scenario: A registry-credentialed build against one registry and a plain build against another both succeed back to back
    # Regression anchor for the seed-from-ambient-DOCKER_CONFIG design: a
    # per-request registryCredentials override must not corrupt or replace
    # the ambient/buildx state that a later, differently-targeted request
    # relies on. Only observable from outside as "both requests still
    # work" - internal buildx builder reuse isn't visible over HTTP.
    Given the ambient registry auth is not configured
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "registry": "<authed-registry-url>" },
        "registryCredentials": { "registry": "<authed-registry-url>", "username": "svc-bot", "password": "hunter2" }
      }
      """
    Then the response status should be 200
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "registry": "<registry-url>" }
      }
      """
    Then the response status should be 200
