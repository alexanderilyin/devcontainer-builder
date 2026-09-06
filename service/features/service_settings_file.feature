Feature: Loading settings from a JSON or YAML file
  As an operator deploying devcontainer-builder
  I want to set the service's configuration from one file instead of many env vars
  So that a deployment can ship one mounted settings file alongside (or instead of) individual env vars

  Distinct from service_startup_configuration.feature's other scenarios,
  which exercise individual env vars and the two dedicated
  GIT_CREDENTIALS_CONFIG_PATH/REGISTRY_MAPPING_CONFIG_PATH files - this
  file is about the general SERVICE_CONFIG_PATH settings file itself:
  its JSON/YAML parsing, its shape (deliberately mirroring
  charts/devcontainer-builder/values.yaml), and its own validation
  behavior. Precedence between this file, env vars, and CLI flags is
  covered separately in service_startup_configuration.feature's
  SSH_HOST_KEY_POLICY precedence scenarios, which can prove a real
  behavioral difference between sources - a settings-file-only scenario
  here can only prove the file loaded without error, the same modest
  scope the dedicated-file scenarios already use for the same reason.

  @server-config
  Scenario: A JSON settings file can set buildkit, ssh host key policy, git credentials, and registry mapping together
    Given a file at "/config/settings.json" containing:
      """
      {
        "buildkit": { "endpoint": "tcp://buildkit.example:1234" },
        "sshHostKeyPolicy": "pinned",
        "gitCredentials": {
          "entries": [
            { "host": "github.com", "kind": "https", "username": "svc-bot", "token": "ghp_example" }
          ]
        },
        "registryMapping": {
          "rules": [
            { "hostMatch": "github.com", "registry": "ghcr.io/example" }
          ]
        }
      }
      """
    And the devcontainer-builder service is configured with:
      | SERVICE_CONFIG_PATH | /config/settings.json |
    When the service is started
    Then the service should start successfully
    When I send a GET request to "/health/ready"
    Then the response status should be 200

  @server-config
  Scenario: The identical settings in YAML produce the same outcome
    Given a file at "/config/settings.yaml" containing:
      """
      buildkit:
        endpoint: tcp://buildkit.example:1234
      sshHostKeyPolicy: pinned
      gitCredentials:
        entries:
          - host: github.com
            kind: https
            username: svc-bot
            token: ghp_example
      registryMapping:
        rules:
          - hostMatch: github.com
            registry: ghcr.io/example
      """
    And the devcontainer-builder service is configured with:
      | SERVICE_CONFIG_PATH | /config/settings.yaml |
    When the service is started
    Then the service should start successfully
    When I send a GET request to "/health/ready"
    Then the response status should be 200

  @negative @server-config
  Scenario: A settings file with invalid JSON prevents startup
    Given a file at "/config/settings.json" containing:
      """
      { this is not valid JSON
      """
    And the devcontainer-builder service is configured with:
      | SERVICE_CONFIG_PATH | /config/settings.json |
    When the service is started
    Then the service should fail to start
    And the startup error should mention "failed to parse settings config"

  @negative @server-config
  Scenario: A settings file with invalid YAML prevents startup
    Given a file at "/config/settings.yaml" containing:
      """
      buildkit: [ unterminated
      """
    And the devcontainer-builder service is configured with:
      | SERVICE_CONFIG_PATH | /config/settings.yaml |
    When the service is started
    Then the service should fail to start
    And the startup error should mention "failed to parse settings config"

  @negative @server-config
  Scenario: A settings file that isn't a JSON/YAML object prevents startup
    Given a file at "/config/settings.json" containing:
      """
      [ "not", "an", "object" ]
      """
    And the devcontainer-builder service is configured with:
      | SERVICE_CONFIG_PATH | /config/settings.json |
    When the service is started
    Then the service should fail to start
    And the startup error should mention "must be a JSON/YAML object"

  @negative @server-config
  Scenario: A wrong-typed settings file field prevents startup
    Given a file at "/config/settings.json" containing:
      """
      { "buildkit": { "endpoint": 1234 } }
      """
    And the devcontainer-builder service is configured with:
      | SERVICE_CONFIG_PATH | /config/settings.json |
    When the service is started
    Then the service should fail to start
    And the startup error should mention "settings file field \"buildkit.endpoint\" must be a string"

  @server-config
  Scenario: One malformed entry in a settings file's embedded git credentials list is skipped, not fatal
    # Mirrors "One malformed entry in an otherwise-valid git credentials
    # list is skipped, not fatal" in service_startup_configuration.feature
    # for the dedicated GIT_CREDENTIALS_CONFIG_PATH file - same validation
    # code path (validateEntries), reached from the settings file instead.
    Given a file at "/config/settings.json" containing:
      """
      {
        "buildkit": { "endpoint": "tcp://buildkit.example:1234" },
        "gitCredentials": {
          "entries": [
            { "host": "github.com", "kind": "https", "username": "svc-bot", "token": "ghp_example" },
            { "kind": "https", "username": "missing-host", "token": "ghp_other" }
          ]
        }
      }
      """
    And the devcontainer-builder service is configured with:
      | SERVICE_CONFIG_PATH | /config/settings.json |
    When the service is started
    Then the service should start successfully
    And the invalid entry should have been logged and skipped
