Feature: Liveness, readiness, and unknown routes
  As the Kubernetes Deployment running devcontainer-builder
  I want distinct liveness and readiness signals
  So that traffic is only routed to a pod that can actually accept a build

  No Background here - each scenario needs a differently-configured real
  server (or none at all for the 404 outline), and "the service is
  running" starts one for real using whatever's been configured so far, so
  it has to come after any "configured with" step, not before it.

  @server-config
  Scenario: Liveness succeeds even when the service isn't configured to build anything
    Given the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | (unset) |
    And the service is running
    When I send a GET request to "/health/live"
    Then the response status should be 200
    And the response body should equal:
      """
      { "status": "ok" }
      """

  @server-config
  Scenario: Liveness succeeds when the service is fully configured
    Given the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | tcp://buildkit.example:1234 |
    And the service is running
    When I send a GET request to "/health/live"
    Then the response status should be 200
    And the response body should equal:
      """
      { "status": "ok" }
      """

  @server-config
  Scenario: Readiness fails when BUILDKIT_ENDPOINT is not configured
    Given the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | (unset) |
    And the service is running
    When I send a GET request to "/health/ready"
    Then the response status should be 503
    And the response body should equal:
      """
      { "status": "not ready", "reason": "BUILDKIT_ENDPOINT not configured" }
      """

  @server-config
  Scenario: Readiness succeeds when BUILDKIT_ENDPOINT is configured
    Given the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | tcp://buildkit.example:1234 |
    And the service is running
    When I send a GET request to "/health/ready"
    Then the response status should be 200
    And the response body should equal:
      """
      { "status": "ready" }
      """

  @negative
  Scenario Outline: Unknown routes and methods fall through to a generic 404
    Given the service is running
    When I send a <method> request to "<path>"
    Then the response status should be 404
    And the response body should equal:
      """
      { "error": "not found" }
      """

    Examples:
      | method | path          |
      | GET    | /build        |
      | POST   | /health/live  |
      | POST   | /health/ready |
      | GET    | /health       |
      | GET    | /             |
      | GET    | /nope         |
      | DELETE | /build        |
