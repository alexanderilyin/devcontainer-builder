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
    # The buildkit fixture's trust config always needs both registry
    # hosts, even though this file never itself pushes to the authed one -
    # its deploy is memoized process-wide, so whichever file's Background
    # happens to trigger it first must have the complete picture, not just
    # what that one file personally uses.
    Given the following fixture releases are registered:
      | fixture              | release              |
      | test-registry        | test-registry        |
      | test-registry-authed | test-registry-authed |
      | test-buildkit        | test-buildkit         |
      | test-git-server      | test-git-server       |
    And the test-registry fixture is deployed
    And the test-buildkit fixture is deployed, trusting test-registry and test-registry-authed as insecure registries
    And the test-git-server fixture is deployed, serving:
      | protocol | port |
      | git      | 9418 |
      | http     | 8080 |
      | https    | 443  |
      | ssh      | 22   |
    And the test-registry fixture's URL is known as "<registry-url>"
    And the test-buildkit fixture's endpoint is known as "<buildkit-endpoint>"
    And the test-git-server fixture's git protocol URL is known as "<git-url>"
    And the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | <buildkit-endpoint> |
    And the server has no git credentials configured
    And the server's registry mapping rules are empty
    And the service is running

  @negative @client-request
  Scenario: A syntactically valid but empty devcontainer.json fails clearly
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/location/devcontainer-json-empty-config.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 500
    And the response body should contain "exited with code 1"
    And the service logs should contain "No image information specified in devcontainer.json"

  @negative @client-request
  Scenario: A devcontainer.json referencing a Dockerfile that was never seeded fails clearly
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/location/devcontainer-json-missing-dockerfile.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 500
    And the response body should contain "exited with code 1"
    And the service logs should contain "no such file or directory"
    And the service logs should contain "Dockerfile"

  @client-request
  Scenario: A devcontainer.json using "build": {"dockerfile": ...} with a real Dockerfile succeeds
    Given the current HEAD short sha of "location/devcontainer-json-dockerfile-build.git" is known as "<expected-sha>"
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/location/devcontainer-json-dockerfile-build.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 200
    And the resolved image should be "<registry-url>/devcontainer-json-dockerfile-build:sha-<expected-sha>"
