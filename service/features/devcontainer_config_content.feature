Feature: devcontainer.json content validity, once it's been found
  As an operator of devcontainer-builder
  I want a build to fail clearly when a devcontainer.json is discoverable but unusable
  So that "found the file" and "could actually build from it" aren't confused

  Distinct from devcontainer_config_discovery.feature, which is only about
  *where* the file lives - every repo here has its devcontainer.json at the
  plain root location, found without ambiguity. What's under test is
  whether its *content* is enough to build anything, including the
  alternate `"build": {"dockerfile": ...}` shape (every other fixture repo
  in this suite uses a plain `"image"` reference instead - a materially
  different real path through the devcontainer CLI and BuildKit).

  Background:
    Given the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | (test buildkit) |
    And the server has no git credentials configured
    And the server's registry mapping rules are empty
    And the service is running

  @negative @client-request
  Scenario: A syntactically valid but empty devcontainer.json fails clearly
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/location/devcontainer-json-empty-config.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the response body should contain "exited with code 1"
    And the service logs should contain "No image information specified in devcontainer.json"

  @negative @client-request
  Scenario: A devcontainer.json referencing a Dockerfile that was never seeded fails clearly
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/location/devcontainer-json-missing-dockerfile.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the response body should contain "exited with code 1"
    And the service logs should contain "no such file or directory"
    And the service logs should contain "Dockerfile"

  @client-request
  Scenario: A devcontainer.json using "build": {"dockerfile": ...} with a real Dockerfile succeeds
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/location/devcontainer-json-dockerfile-build.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/devcontainer-json-dockerfile-build:sha-(head:location/devcontainer-json-dockerfile-build.git)"
