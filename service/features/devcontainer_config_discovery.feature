Feature: devcontainer.json discovery after clone
  As an operator of devcontainer-builder
  I want the service to find devcontainer.json wherever the containers.dev spec allows it to live
  So that callers aren't forced into one specific repo layout

  See https://containers.dev/implementors/spec/#devcontainerjson - it
  recognizes three locations, in precedence order: .devcontainer/
  devcontainer.json, .devcontainer.json, and .devcontainer/<folder>/
  devcontainer.json (one sub-folder deep, <folder>'s name unspecified).
  test-git-server seeds one real repo per location (see
  charts/test-git-server/values.yaml's devcontainer-json-* entries) - these
  are real builds, so "success" means the devcontainer CLI actually found
  and used the config, not an inferred signal.

  Background:
    Given the service is running
    And the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | (test buildkit) |
    And the server has no git credentials configured
    And the server's registry mapping rules are empty

  @client-request
  Scenario Outline: A devcontainer.json at the root or the standard .devcontainer/ location is found automatically
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/location/<repo>.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 200
    And the resolved image should be "(test registry)/<repo>:sha-(head:location/<repo>.git)"

    Examples:
      | repo                       |
      | devcontainer-json-root     |
      | devcontainer-json-standard |

  @negative @client-request
  Scenario Outline: A devcontainer.json in a sub-folder is not found automatically - a known gap, not this service's own logic
    # The spec itself only says a sub-folder config MAY exist - it
    # deliberately leaves <folder>'s name unspecified, since a tool can't
    # know which of possibly several sub-folder configs to pick without
    # being told explicitly (the spec: "consider providing a mechanism for
    # users to select one when appropriate"). The devcontainer CLI (0.89.0)
    # reflects exactly that: it auto-discovers only the root and standard
    # .devcontainer/devcontainer.json locations - a sub-folder config needs
    # an explicit `--config <path>`, which build.ts does not currently pass
    # (the /build request has no field for it). Three sub-folder names
    # prove this fails the same way regardless of which folder name is
    # used - it's not a naming mismatch, the location itself isn't checked.
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/location/<repo>.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the response body should contain "exited with code 1"
    And the service logs should contain "Dev container config"
    And the service logs should contain "not found"

    Examples:
      | repo                             |
      | devcontainer-json-subfolder-alpha |
      | devcontainer-json-subfolder-beta  |
      | devcontainer-json-subfolder-gamma |

  @negative @client-request
  Scenario: A repository with no devcontainer.json at any location fails clearly
    # Distinct from the sub-folder cases above: this repo has no config at
    # ANY of the three locations, not just an unchecked one - same CLI
    # error text either way, since "checked here, found nothing" and
    # "never checked here" are indistinguishable from the CLI's own output.
    # The distinction that matters is at the fixture level (see
    # devcontainer-json-missing in charts/test-git-server/values.yaml,
    # `noConfig: true`), proving this failure mode is reachable at all.
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/location/devcontainer-json-missing.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the response body should contain "exited with code 1"
    And the service logs should contain "Dev container config"
    And the service logs should contain "not found"
