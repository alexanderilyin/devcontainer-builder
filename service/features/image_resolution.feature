Feature: Image name, tag, and registry resolution
  As a caller of devcontainer-builder
  I want sensible defaults for the pushed image reference
  So that I don't have to compute a registry, name, or tag myself for every build

  Runs real builds against the git-daemon fixture and the anonymous test
  registry (see features/support/build_fixtures.js) - "the current HEAD
  short sha of ... is known as ..." captures the fixture repo's actual
  current HEAD short sha (a real, content-derived value, not one a
  scenario can dictate) for later assertions to reference by name.

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

  @client-request
  Scenario: A fully-specified image target is used verbatim
    Given the server's registry mapping rules are empty
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "registry": "<registry-url>", "name": "custom-name", "tag": "v1.2.3" }
      }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/custom-name:v1.2.3"

  @server-config @client-request
  Scenario: Omitting image entirely derives registry, name, and tag
    Given the server's registry mapping rules are:
      | pathPrefix | registry         |
      | example/   | <registry-url>  |
    And the current HEAD short sha of "example/example-devcontainer.git" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/example-devcontainer:sha-<expected-sha>"

  @client-request
  Scenario: A partially-specified image target derives only the missing fields
    Given the server's registry mapping rules are:
      | pathPrefix | registry         |
      | example/   | <registry-url>  |
    And the current HEAD short sha of "example/example-devcontainer.git" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "name": "custom-name" }
      }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/custom-name:sha-<expected-sha>"

  @client-request
  Scenario Outline: The derived name strips a trailing .git and uses the last path segment
    Given the server's registry mapping rules are empty
    And the current HEAD short sha of "<repo-path>" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<repository>", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/<expected-name>:sha-<expected-sha>"

    Examples:
      | repository                                            | repo-path                          | expected-name            |
      | <git-url>/example/example-devcontainer.git    | example/example-devcontainer.git   | example-devcontainer     |
      | <git-url>/example/sub/example-devcontainer     | example/sub/example-devcontainer   | example-devcontainer     |
      | <git-url>/solo-repo.git                        | solo-repo.git                      | solo-repo                |

  @server-config
  Scenario: A registry mapping rule matching on hostMatch only applies to any path on that host
    Given the server's registry mapping rules are:
      | hostMatch          | registry        |
      | <git-host> | <registry-url> |
    And the current HEAD short sha of "example/example-devcontainer.git" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/example-devcontainer:sha-<expected-sha>"

  @server-config
  Scenario: A registry mapping rule matching on pathPrefix only applies regardless of host
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

  @server-config
  Scenario: A rule with neither hostMatch nor pathPrefix is a universal fallback
    Given the server's registry mapping rules are:
      | registry        |
      | <registry-url> |
    And the current HEAD short sha of "example/example-devcontainer.git" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/example-devcontainer:sha-<expected-sha>"

  @server-config
  Scenario: The first matching rule wins when more than one rule matches
    Given the server's registry mapping rules are:
      | pathPrefix | registry             |
      | example/   | <registry-url>      |
      |            | <authed-registry-url>    |
    And the current HEAD short sha of "example/example-devcontainer.git" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/example-devcontainer:sha-<expected-sha>"

  @client-request
  Scenario: An explicit image.registry wins over a matching registry mapping rule
    Given the server's registry mapping rules are:
      | pathPrefix | registry           |
      | example/   | <authed-registry-url>  |
    And the current HEAD short sha of "example/example-devcontainer.git" is known as "<expected-sha>"
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "<git-url>/example/example-devcontainer.git",
        "image": { "registry": "<registry-url>" }
      }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/example-devcontainer:sha-<expected-sha>"

  @negative @client-request
  Scenario: No image.registry given and no rule matches is a 400, not a 500
    Given the server's registry mapping rules are empty
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/example/example-devcontainer.git" }
      """
    Then the response status should be 400
    And the response body should contain "no registry resolved for repository"

  @negative @server-config
  Scenario: A non-matching registry mapping rule does not accidentally apply
    Given the server's registry mapping rules are:
      | hostMatch                    | registry           |
      | gitlab.internal.example.com  | <registry-url>    |
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/example/example-devcontainer.git" }
      """
    Then the response status should be 400
