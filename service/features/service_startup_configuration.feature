Feature: Service startup configuration loading
  As an operator deploying devcontainer-builder
  I want misconfiguration caught at startup rather than surfacing as mysterious per-request failures
  So that a bad deployment fails its readiness/liveness checks immediately instead of serving broken requests

  Unlike the other features, these scenarios exercise process startup itself,
  not a request/response cycle against an already-running service.

  @server-config
  Scenario: The service starts normally when no optional config paths are set
    Given the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT             | tcp://buildkit.example:1234 |
      | GIT_CREDENTIALS_CONFIG_PATH   | (unset)                     |
      | REGISTRY_MAPPING_CONFIG_PATH  | (unset)                     |
      | SSH_HOST_KEY_POLICY           | (unset)                     |
    When the service is started
    Then the service should start successfully
    When I send a GET request to "/healthz"
    Then the response status should be 200

  @negative @server-config
  Scenario: A malformed git credentials config file prevents startup
    Given a file at "/config/git-credentials.json" containing:
      """
      { this is not valid JSON
      """
    And the devcontainer-builder service is configured with:
      | GIT_CREDENTIALS_CONFIG_PATH | /config/git-credentials.json |
    When the service is started
    Then the service should fail to start
    And the startup error should mention "failed to parse git credentials config"

  @negative @server-config
  Scenario: A git credentials config file that isn't a JSON array prevents startup
    Given a file at "/config/git-credentials.json" containing:
      """
      { "host": "github.com", "kind": "https", "username": "svc-bot", "token": "ghp_example" }
      """
    And the devcontainer-builder service is configured with:
      | GIT_CREDENTIALS_CONFIG_PATH | /config/git-credentials.json |
    When the service is started
    Then the service should fail to start
    And the startup error should mention "must be a JSON array"

  @server-config
  Scenario: One malformed entry in an otherwise-valid git credentials list is skipped, not fatal
    # Only checks that startup itself tolerates the bad entry - proving the
    # *valid* entry is actually usable would need a real network operation
    # against its host, which isn't reliable to depend on in a test (see the
    # SSH_HOST_KEY_POLICY scenario below for how that's done safely against
    # a real, disposable test fixture instead of a live third-party host).
    Given a file at "/config/git-credentials.json" containing:
      """
      [
        { "host": "github.com", "kind": "https", "username": "svc-bot", "token": "ghp_example" },
        { "kind": "https", "username": "missing-host", "token": "ghp_other" }
      ]
      """
    And the devcontainer-builder service is configured with:
      | GIT_CREDENTIALS_CONFIG_PATH | /config/git-credentials.json |
      | BUILDKIT_ENDPOINT           | tcp://buildkit.example:1234  |
    When the service is started
    Then the service should start successfully
    And the invalid entry should have been logged and skipped

  @negative @server-config
  Scenario: A registry mapping config file that isn't a JSON array prevents startup
    Given a file at "/config/registry-mapping.json" containing:
      """
      { "hostMatch": "github.com", "registry": "ghcr.io/example" }
      """
    And the devcontainer-builder service is configured with:
      | REGISTRY_MAPPING_CONFIG_PATH | /config/registry-mapping.json |
    When the service is started
    Then the service should fail to start
    And the startup error should mention "must be a JSON array"

  @server-config
  Scenario: A missing registry mapping entry field is skipped, not fatal
    Given a file at "/config/registry-mapping.json" containing:
      """
      [
        { "hostMatch": "github.com" }
      ]
      """
    And the devcontainer-builder service is configured with:
      | REGISTRY_MAPPING_CONFIG_PATH | /config/registry-mapping.json |
      | BUILDKIT_ENDPOINT            | tcp://buildkit.example:1234   |
    When the service is started
    Then the service should start successfully
    And the invalid entry should have been logged and skipped

  @negative @server-config
  Scenario: An unrecognized SSH_HOST_KEY_POLICY value prevents startup
    Given the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | strict |
    When the service is started
    Then the service should fail to start
    And the startup error should mention "SSH_HOST_KEY_POLICY must be \"tofu\" or \"pinned\""

  @server-config @needs-ssh-fixture
  Scenario: SSH_HOST_KEY_POLICY defaults to "tofu" when unset
    # Runs against a real, disposable SSH server (see charts/openssh-server
    # and features/support/ssh_fixture.js) rather than faking the SSH
    # protocol. The fixture has no authorized key matching our ephemeral
    # test key, so a real clone against it is expected to fail - but at the
    # *authentication* step, after host-key verification already succeeded.
    # That sequence is the real, observable signature of "TOFU scanned and
    # trusted the host key" as opposed to "pinned" failing closed before
    # ever attempting a connection.
    Given the server's git credentials are:
      | host          | kind | privateKey             | pinnedHostKey |
      | (ssh fixture) | ssh  | (a valid private key)  | (unset)       |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | (unset)                     |
      | BUILDKIT_ENDPOINT   | tcp://buildkit.example:1234 |
    When the service is started
    Then the service should start successfully
    When I send a POST request to "/build" with body:
      """
      { "repository": "https://(ssh fixture)/example/example-devcontainer.git", "image": { "registry": "ghcr.io/example" } }
      """
    Then the response status should be 500
    And the response body should contain "git clone"
    And the service logs should not contain "Host key verification failed"
