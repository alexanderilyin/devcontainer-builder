Feature: Liveness, readiness, and unknown routes
  As the Kubernetes Deployment running devcontainer-builder
  I want distinct liveness and readiness signals
  So that traffic is only routed to a pod that can actually accept a build

  Background:
    Given the service is running

  @server-config
  Scenario: Liveness succeeds even when the service isn't configured to build anything
    Given the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | (unset) |
    When I send a GET request to "/healthz"
    Then the response status should be 200
    And the response body should equal:
      """
      { "status": "ok" }
      """

  @server-config
  Scenario: Liveness succeeds when the service is fully configured
    Given the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | tcp://buildkit.example:1234 |
    When I send a GET request to "/healthz"
    Then the response status should be 200
    And the response body should equal:
      """
      { "status": "ok" }
      """

  @server-config
  Scenario: Readiness fails when BUILDKIT_ENDPOINT is not configured
    Given the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | (unset) |
    When I send a GET request to "/readyz"
    Then the response status should be 503
    And the response body should equal:
      """
      { "status": "not ready", "reason": "BUILDKIT_ENDPOINT not configured" }
      """

  @server-config
  Scenario: Readiness succeeds when BUILDKIT_ENDPOINT is configured
    Given the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | tcp://buildkit.example:1234 |
    When I send a GET request to "/readyz"
    Then the response status should be 200
    And the response body should equal:
      """
      { "status": "ready" }
      """

  @negative
  Scenario Outline: Unknown routes and methods fall through to a generic 404
    When I send a <method> request to "<path>"
    Then the response status should be 404
    And the response body should equal:
      """
      { "error": "not found" }
      """

    Examples:
      | method | path      |
      | GET    | /build    |
      | POST   | /healthz  |
      | POST   | /readyz   |
      | GET    | /         |
      | GET    | /nope     |
      | DELETE | /build    |
