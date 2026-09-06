Feature: POST /build request shape validation
  As a caller of the devcontainer-builder API
  I want a clear 400 for a malformed request
  So that I can distinguish "my request was wrong" from "the build failed"

  This feature only covers the up-front shape check performed before any
  clone/build work starts (server.ts's isValidBuildRequest). It does not
  cover whether the *values* given are usable (unparseable git URLs,
  unresolvable registries, etc.) - see git_source_resolution.feature and
  image_resolution.feature for that. Scenarios that assert "the request
  should pass validation" deliberately use a nonexistent local file:// path
  as the repository, so the clone attempt that follows fails fast and
  deterministically with no network dependency, instead of a real (slow,
  network-dependent) clone attempt.

  Background:
    Given the service is running
    And the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | tcp://buildkit.example:1234 |

  @negative
  Scenario: A malformed JSON body is rejected
    When I send a POST request to "/build" with body:
      """
      { this is not valid JSON
      """
    Then the response status should be 400
    And the response body should equal:
      """
      { "error": "invalid JSON body" }
      """

  @negative
  Scenario Outline: A well-formed but non-object JSON body is rejected
    When I send a POST request to "/build" with body:
      """
      <body>
      """
    Then the response status should be 400

    Examples:
      | body               |
      | []                 |
      | "a string"         |
      | 42                 |
      | true               |
      | null               |

  @negative @client-request
  Scenario: Missing repository is rejected
    When I send a POST request to "/build" with body:
      """
      {}
      """
    Then the response status should be 400
    And the response body should equal:
      """
      {
        "error": "missing or invalid fields: repository (required); branch, image.{registry,name,tag}, gitCredentials.{username,token}, registryCredentials.{registry,username,password} (all optional)"
      }
      """

  @negative @client-request
  Scenario: Empty-string repository is rejected
    When I send a POST request to "/build" with body:
      """
      { "repository": "" }
      """
    Then the response status should be 400

  @client-request
  Scenario: repository alone is a valid request shape
    When I send a POST request to "/build" with body:
      """
      { "repository": "file:///nonexistent-repo-for-validation-tests.git" }
      """
    Then the request should pass validation

  @negative @client-request
  Scenario: An empty-string branch is rejected
    When I send a POST request to "/build" with body:
      """
      { "repository": "https://github.com/example/example-devcontainer.git", "branch": "" }
      """
    Then the response status should be 400

  @client-request
  Scenario: An omitted branch is a valid request shape
    When I send a POST request to "/build" with body:
      """
      { "repository": "file:///nonexistent-repo-for-validation-tests.git" }
      """
    Then the request should pass validation

  @client-request
  Scenario Outline: A null value for an optional image field is treated as "not provided"
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "file:///nonexistent-repo-for-validation-tests.git",
        "image": <image>
      }
      """
    Then the request should pass validation

    Examples:
      | image                                             |
      | { "registry": null, "name": null, "tag": null }   |
      | { "registry": "ghcr.io/example", "name": null }   |
      | null                                              |

  @negative @client-request
  Scenario Outline: An empty-string image field is rejected (unlike null)
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "https://github.com/example/example-devcontainer.git",
        "image": <image>
      }
      """
    Then the response status should be 400

    Examples:
      | image                          |
      | { "registry": "" }             |
      | { "name": "" }                 |
      | { "tag": "" }                  |

  @negative @client-request
  Scenario Outline: An incomplete or malformed gitCredentials is rejected
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "https://github.com/example/example-devcontainer.git",
        "gitCredentials": <gitCredentials>
      }
      """
    Then the response status should be 400

    Examples:
      | gitCredentials                                  |
      | { "username": "svc-bot" }                       |
      | { "token": "ghp_example" }                      |
      | { "username": 12345, "token": "ghp_example" }   |
      | "svc-bot:ghp_example"                           |

  @client-request
  Scenario: gitCredentials with empty-string fields still passes shape validation
    # isValidBuildRequest only checks typeof "string" for gitCredentials
    # fields, not non-empty-ness - this documents that as current behavior.
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "file:///nonexistent-repo-for-validation-tests.git",
        "gitCredentials": { "username": "", "token": "" }
      }
      """
    Then the request should pass validation

  @negative @client-request
  Scenario Outline: An incomplete or empty-field registryCredentials is rejected
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "https://github.com/example/example-devcontainer.git",
        "registryCredentials": <registryCredentials>
      }
      """
    Then the response status should be 400

    Examples:
      | registryCredentials                                                          |
      | { "username": "svc-bot", "password": "hunter2" }                             |
      | { "registry": "ghcr.io/example", "password": "hunter2" }                     |
      | { "registry": "ghcr.io/example", "username": "svc-bot" }                     |
      | { "registry": "", "username": "svc-bot", "password": "hunter2" }             |
      | { "registry": "ghcr.io/example", "username": "", "password": "hunter2" }     |
      | { "registry": "ghcr.io/example", "username": "svc-bot", "password": "" }     |

  @client-request
  Scenario: A fully-specified registryCredentials passes shape validation
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "file:///nonexistent-repo-for-validation-tests.git",
        "registryCredentials": { "registry": "ghcr.io/example", "username": "svc-bot", "password": "hunter2" }
      }
      """
    Then the request should pass validation

  @client-request
  Scenario: Unknown extra top-level fields are tolerated
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "file:///nonexistent-repo-for-validation-tests.git",
        "somethingTheServiceDoesNotKnowAbout": true
      }
      """
    Then the request should pass validation
