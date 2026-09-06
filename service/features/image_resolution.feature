Feature: Image name, tag, and registry resolution
  As a caller of devcontainer-builder
  I want sensible defaults for the pushed image reference
  So that I don't have to compute a registry, name, or tag myself for every build

  Runs real builds against the git-daemon fixture and the anonymous test
  registry (see features/support/build_fixtures.js) - the "(head:<repo
  path>)" sentinel resolves to the fixture repo's actual current HEAD short
  SHA (a real, content-derived value, not one a scenario can dictate).

  Background:
    Given the service is running
    And the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | (test buildkit) |
    And the server has no git credentials configured

  @client-request
  Scenario: A fully-specified image target is used verbatim
    Given the server's registry mapping rules are empty
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "(git fixture git)/example/example-devcontainer.git",
        "image": { "registry": "(test registry)", "name": "custom-name", "tag": "v1.2.3" }
      }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/custom-name:v1.2.3"

  @server-config @client-request
  Scenario: Omitting image entirely derives registry, name, and tag
    Given the server's registry mapping rules are:
      | pathPrefix | registry         |
      | example/   | (test registry)  |
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/example-devcontainer:sha-(head:example/example-devcontainer.git)"

  @client-request
  Scenario: A partially-specified image target derives only the missing fields
    Given the server's registry mapping rules are:
      | pathPrefix | registry         |
      | example/   | (test registry)  |
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "(git fixture git)/example/example-devcontainer.git",
        "image": { "name": "custom-name" }
      }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/custom-name:sha-(head:example/example-devcontainer.git)"

  @client-request
  Scenario Outline: The derived name strips a trailing .git and uses the last path segment
    Given the server's registry mapping rules are empty
    When I send a POST request to "/build" with body:
      """
      { "repository": "<repository>", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/<expected-name>:sha-(head:<repo-path>)"

    Examples:
      | repository                                            | repo-path                          | expected-name            |
      | (git fixture git)/example/example-devcontainer.git    | example/example-devcontainer.git   | example-devcontainer     |
      | (git fixture git)/example/sub/example-devcontainer     | example/sub/example-devcontainer   | example-devcontainer     |
      | (git fixture git)/solo-repo.git                        | solo-repo.git                      | solo-repo                |

  @server-config
  Scenario: A registry mapping rule matching on hostMatch only applies to any path on that host
    Given the server's registry mapping rules are:
      | hostMatch          | registry        |
      | (git fixture host) | (test registry) |
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/example-devcontainer:sha-(head:example/example-devcontainer.git)"

  @server-config
  Scenario: A registry mapping rule matching on pathPrefix only applies regardless of host
    Given the server's registry mapping rules are:
      | pathPrefix | registry        |
      | example/   | (test registry) |
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/example-devcontainer:sha-(head:example/example-devcontainer.git)"

  @server-config
  Scenario: A rule with neither hostMatch nor pathPrefix is a universal fallback
    Given the server's registry mapping rules are:
      | registry        |
      | (test registry) |
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/example-devcontainer:sha-(head:example/example-devcontainer.git)"

  @server-config
  Scenario: The first matching rule wins when more than one rule matches
    Given the server's registry mapping rules are:
      | pathPrefix | registry             |
      | example/   | (test registry)      |
      |            | (authed registry)    |
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git" }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/example-devcontainer:sha-(head:example/example-devcontainer.git)"

  @client-request
  Scenario: An explicit image.registry wins over a matching registry mapping rule
    Given the server's registry mapping rules are:
      | pathPrefix | registry           |
      | example/   | (authed registry)  |
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "(git fixture git)/example/example-devcontainer.git",
        "image": { "registry": "(test registry)" }
      }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/example-devcontainer:sha-(head:example/example-devcontainer.git)"

  @negative @client-request
  Scenario: No image.registry given and no rule matches is a 400, not a 500
    Given the server's registry mapping rules are empty
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git" }
      """
    Then the response status should be 400
    And the response body should contain "no registry resolved for repository"

  @negative @server-config
  Scenario: A non-matching registry mapping rule does not accidentally apply
    Given the server's registry mapping rules are:
      | hostMatch                    | registry           |
      | gitlab.internal.example.com  | (test registry)    |
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git" }
      """
    Then the response status should be 400
