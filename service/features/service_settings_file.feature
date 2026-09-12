Feature: Loading settings from a JSON or YAML file
  As an operator deploying devcontainer-builder
  I want to set the service's configuration from one file instead of many env vars
  So that a deployment can ship one mounted settings file alongside (or instead of) individual env vars

  Distinct from service_startup_configuration.feature's other scenarios,
  which exercise individual env vars and the two dedicated
  GIT_CREDENTIALS_CONFIG_PATH/REGISTRY_MAPPING_CONFIG_PATH files - this
  file is about the general SERVICE_CONFIG_PATH settings file itself: its
  JSON/YAML parsing, its shape (deliberately mirroring charts/devcontainer-
  builder/values.yaml), and its own validation behavior. No scenario here
  ever sends a real /build request - a settings file that parses
  successfully and lets the pod become genuinely Ready (real readiness,
  not an inferred signal) is already direct proof the file loaded and was
  used; a malformed one is proven the same way build.ts's earlier CLI
  errors already are in this migration - a real, deterministic crash-loop
  + the exact real log line, not an inferred signal either.

  Background:
    Given the value of environment variable "CODER_WORKSPACE_OWNER_NAME", or "USER", or "local" is known as "<Owner>"
    And the value of environment variable "CUCUMBER_WORKER_ID" or "0" is known as "<WorkerId>"
    And the value "devcontainer-builder-<Owner>-w<WorkerId>" is known as "<Namespace>"

    Given Directory "<NamespaceChartDir>" at "../charts/test-namespace"
    And Helm Chart "<NamespaceChart>" in "<NamespaceChartDir>"
    And Helm Release known as "<NamespaceRelease>":
      | PROPERTY  | VALUE                      |
      | chart     | <NamespaceChart>           |
      | name      | test-namespace-<Namespace> |
      | namespace | default                    |
    When I upgrade Helm Release known as "<NamespaceRelease>" with:
      | OPTION    | VALUE                       |
      | --install | True                        |
      | --set     | targetNamespace=<Namespace> |
    Then the command exited with 0

    Given Docker Buildx Builder known as "<Builder>":
      | PROPERTY | VALUE                                                            |
      | name     | devcontainer-builder-settings-file-w<WorkerId> |
      | endpoint | tcp://buildkit-buildkit-service.buildkit.svc.cluster.local:1234 |
    When I create Docker Buildx Builder known as "<Builder>"
    Then the command exited with 0
    When I build and push "ghcr.io/alexanderilyin/devcontainer-builder-test:test" from "." using Docker Buildx Builder known as "<Builder>" with:
      | OPTION | VALUE |
    Then the command exited with 0

    Given Directory "<ChartDirectory>" at "../charts/devcontainer-builder"
    And Helm Chart "<Chart>" in "<ChartDirectory>"

  @server-config
  Scenario: A JSON settings file can set buildkit, ssh host key policy, git credentials, and registry mapping together
    When I create File known as "<SettingsFile>" at ".cache/fixtures/service-settings-file-w<WorkerId>/settings.json" with:
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
    Given Helm Release known as "<Release>":
      | PROPERTY  | VALUE                |
      | chart     | <Chart>              |
      | name      | devcontainer-builder |
      | namespace | <Namespace>          |
    When I upgrade Helm Release known as "<Release>" with:
      | OPTION             | VALUE                                                              |
      | --install          | True                                                               |
      | --set              | image.repository=ghcr.io/alexanderilyin/devcontainer-builder-test |
      | --set              | image.tag=test                                                     |
      | --set              | image.pullPolicy=Always                                            |
      | --set              | settingsFile.filename=settings.json                                |
      | --set-file         | settingsFile.content=.cache/fixtures/service-settings-file-w<WorkerId>/settings.json |
      | --wait             | True                                                               |
      | --timeout          | 120s                                                               |
    Then the command exited with 0
    Given Service known as "<AppService>":
      | PROPERTY                   | VALUE                |
      | namespace                  | <Namespace>          |
      | app.kubernetes.io/instance | devcontainer-builder |
    And HTTP Endpoint "<AppApi>" on "<AppService>" port "8080"
    When I send a GET request to Endpoint known as "<AppApi>" path "/health/ready"
    Then the response status is 200

    When I remove Docker Buildx Builder known as "<Builder>"
    Then the command exited with 0
    When I uninstall Helm Release known as "<Release>"
    Then the command exited with 0
    When I uninstall Helm Release "<NamespaceRelease>" with --wait --timeout 120s
    Then the command exited with 0

  @server-config
  Scenario: The identical settings in YAML produce the same outcome
    When I create File known as "<SettingsFile>" at ".cache/fixtures/service-settings-file-w<WorkerId>/settings.yaml" with:
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
    Given Helm Release known as "<Release>":
      | PROPERTY  | VALUE                |
      | chart     | <Chart>              |
      | name      | devcontainer-builder |
      | namespace | <Namespace>          |
    When I upgrade Helm Release known as "<Release>" with:
      | OPTION             | VALUE                                                              |
      | --install          | True                                                               |
      | --set              | image.repository=ghcr.io/alexanderilyin/devcontainer-builder-test |
      | --set              | image.tag=test                                                     |
      | --set              | image.pullPolicy=Always                                            |
      | --set              | settingsFile.filename=settings.yaml                                |
      | --set-file         | settingsFile.content=.cache/fixtures/service-settings-file-w<WorkerId>/settings.yaml |
      | --wait             | True                                                               |
      | --timeout          | 120s                                                               |
    Then the command exited with 0
    Given Service known as "<AppService>":
      | PROPERTY                   | VALUE                |
      | namespace                  | <Namespace>          |
      | app.kubernetes.io/instance | devcontainer-builder |
    And HTTP Endpoint "<AppApi>" on "<AppService>" port "8080"
    When I send a GET request to Endpoint known as "<AppApi>" path "/health/ready"
    Then the response status is 200

    When I remove Docker Buildx Builder known as "<Builder>"
    Then the command exited with 0
    When I uninstall Helm Release known as "<Release>"
    Then the command exited with 0
    When I uninstall Helm Release "<NamespaceRelease>" with --wait --timeout 120s
    Then the command exited with 0

  @negative @server-config
  Scenario: A settings file with invalid JSON prevents startup
    When I create File known as "<SettingsFile>" at ".cache/fixtures/service-settings-file-w<WorkerId>/settings-bad-json.json" with:
      """
      { this is not valid JSON
      """
    Given Helm Release known as "<Release>":
      | PROPERTY  | VALUE                |
      | chart     | <Chart>              |
      | name      | devcontainer-builder |
      | namespace | <Namespace>          |
    When I upgrade Helm Release known as "<Release>" with:
      | OPTION             | VALUE                                                              |
      | --install          | True                                                               |
      | --set              | image.repository=ghcr.io/alexanderilyin/devcontainer-builder-test |
      | --set              | image.tag=test                                                     |
      | --set              | image.pullPolicy=Always                                            |
      | --set              | settingsFile.filename=settings.json                                |
      | --set-file         | settingsFile.content=.cache/fixtures/service-settings-file-w<WorkerId>/settings-bad-json.json |
    Then the command exited with 0
    Given Pod "<AppPod>"
    And "<AppPod>" namespace is "<Namespace>"
    And "<AppPod>" label "app.kubernetes.io/instance" is "devcontainer-builder"
    When I wait for Pod known as "<AppPod>" every "2s" for up to "30s"
    When I poll logs for Pod known as "<AppPod>" every "2s" for up to "30s" until:
      | SOURCE | CONDITION | VALUE                          | OUTCOME |
      | STDOUT | contains  | failed to parse settings config | pass    |

    When I remove Docker Buildx Builder known as "<Builder>"
    Then the command exited with 0
    When I uninstall Helm Release known as "<Release>"
    Then the command exited with 0
    When I uninstall Helm Release "<NamespaceRelease>" with --wait --timeout 120s
    Then the command exited with 0

  @negative @server-config
  Scenario: A settings file with invalid YAML prevents startup
    When I create File known as "<SettingsFile>" at ".cache/fixtures/service-settings-file-w<WorkerId>/settings-bad-yaml.yaml" with:
      """
      buildkit: [ unterminated
      """
    Given Helm Release known as "<Release>":
      | PROPERTY  | VALUE                |
      | chart     | <Chart>              |
      | name      | devcontainer-builder |
      | namespace | <Namespace>          |
    When I upgrade Helm Release known as "<Release>" with:
      | OPTION             | VALUE                                                              |
      | --install          | True                                                               |
      | --set              | image.repository=ghcr.io/alexanderilyin/devcontainer-builder-test |
      | --set              | image.tag=test                                                     |
      | --set              | image.pullPolicy=Always                                            |
      | --set              | settingsFile.filename=settings.yaml                                |
      | --set-file         | settingsFile.content=.cache/fixtures/service-settings-file-w<WorkerId>/settings-bad-yaml.yaml |
    Then the command exited with 0
    Given Pod "<AppPod>"
    And "<AppPod>" namespace is "<Namespace>"
    And "<AppPod>" label "app.kubernetes.io/instance" is "devcontainer-builder"
    When I wait for Pod known as "<AppPod>" every "2s" for up to "30s"
    When I poll logs for Pod known as "<AppPod>" every "2s" for up to "30s" until:
      | SOURCE | CONDITION | VALUE                          | OUTCOME |
      | STDOUT | contains  | failed to parse settings config | pass    |

    When I remove Docker Buildx Builder known as "<Builder>"
    Then the command exited with 0
    When I uninstall Helm Release known as "<Release>"
    Then the command exited with 0
    When I uninstall Helm Release "<NamespaceRelease>" with --wait --timeout 120s
    Then the command exited with 0

  @negative @server-config
  Scenario: A settings file that isn't a JSON/YAML object prevents startup
    When I create File known as "<SettingsFile>" at ".cache/fixtures/service-settings-file-w<WorkerId>/settings-not-object.json" with:
      """
      [ "not", "an", "object" ]
      """
    Given Helm Release known as "<Release>":
      | PROPERTY  | VALUE                |
      | chart     | <Chart>              |
      | name      | devcontainer-builder |
      | namespace | <Namespace>          |
    When I upgrade Helm Release known as "<Release>" with:
      | OPTION             | VALUE                                                              |
      | --install          | True                                                               |
      | --set              | image.repository=ghcr.io/alexanderilyin/devcontainer-builder-test |
      | --set              | image.tag=test                                                     |
      | --set              | image.pullPolicy=Always                                            |
      | --set              | settingsFile.filename=settings.json                                |
      | --set-file         | settingsFile.content=.cache/fixtures/service-settings-file-w<WorkerId>/settings-not-object.json |
    Then the command exited with 0
    Given Pod "<AppPod>"
    And "<AppPod>" namespace is "<Namespace>"
    And "<AppPod>" label "app.kubernetes.io/instance" is "devcontainer-builder"
    When I wait for Pod known as "<AppPod>" every "2s" for up to "30s"
    When I poll logs for Pod known as "<AppPod>" every "2s" for up to "30s" until:
      | SOURCE | CONDITION | VALUE                        | OUTCOME |
      | STDOUT | contains  | must be a JSON/YAML object   | pass    |

    When I remove Docker Buildx Builder known as "<Builder>"
    Then the command exited with 0
    When I uninstall Helm Release known as "<Release>"
    Then the command exited with 0
    When I uninstall Helm Release "<NamespaceRelease>" with --wait --timeout 120s
    Then the command exited with 0

  @negative @server-config
  Scenario: A wrong-typed settings file field prevents startup
    When I create File known as "<SettingsFile>" at ".cache/fixtures/service-settings-file-w<WorkerId>/settings-wrong-type.json" with:
      """
      { "buildkit": { "endpoint": 1234 } }
      """
    Given Helm Release known as "<Release>":
      | PROPERTY  | VALUE                |
      | chart     | <Chart>              |
      | name      | devcontainer-builder |
      | namespace | <Namespace>          |
    When I upgrade Helm Release known as "<Release>" with:
      | OPTION             | VALUE                                                              |
      | --install          | True                                                               |
      | --set              | image.repository=ghcr.io/alexanderilyin/devcontainer-builder-test |
      | --set              | image.tag=test                                                     |
      | --set              | image.pullPolicy=Always                                            |
      | --set              | settingsFile.filename=settings.json                                |
      | --set-file         | settingsFile.content=.cache/fixtures/service-settings-file-w<WorkerId>/settings-wrong-type.json |
    Then the command exited with 0
    Given Pod "<AppPod>"
    And "<AppPod>" namespace is "<Namespace>"
    And "<AppPod>" label "app.kubernetes.io/instance" is "devcontainer-builder"
    When I wait for Pod known as "<AppPod>" every "2s" for up to "30s"
    When I poll logs for Pod known as "<AppPod>" every "2s" for up to "30s" until:
      | SOURCE | CONDITION | VALUE                                                        | OUTCOME |
      | STDOUT | contains  | settings file field \"buildkit.endpoint\" must be a string    | pass    |

    When I remove Docker Buildx Builder known as "<Builder>"
    Then the command exited with 0
    When I uninstall Helm Release known as "<Release>"
    Then the command exited with 0
    When I uninstall Helm Release "<NamespaceRelease>" with --wait --timeout 120s
    Then the command exited with 0

  @server-config
  Scenario: One malformed entry in a settings file's embedded git credentials list is skipped, not fatal
    # Mirrors "One malformed entry in an otherwise-valid git credentials
    # list is skipped, not fatal" in service_startup_configuration.feature
    # for the dedicated GIT_CREDENTIALS_CONFIG_PATH file - same real
    # validation code path (config.ts's validateEntries), reached from the
    # settings file instead.
    When I create File known as "<SettingsFile>" at ".cache/fixtures/service-settings-file-w<WorkerId>/settings-bad-entry.json" with:
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
    Given Helm Release known as "<Release>":
      | PROPERTY  | VALUE                |
      | chart     | <Chart>              |
      | name      | devcontainer-builder |
      | namespace | <Namespace>          |
    When I upgrade Helm Release known as "<Release>" with:
      | OPTION             | VALUE                                                              |
      | --install          | True                                                               |
      | --set              | image.repository=ghcr.io/alexanderilyin/devcontainer-builder-test |
      | --set              | image.tag=test                                                     |
      | --set              | image.pullPolicy=Always                                            |
      | --set              | gitCredentials.enabled=false                                       |
      | --set              | settingsFile.filename=settings.json                                |
      | --set-file         | settingsFile.content=.cache/fixtures/service-settings-file-w<WorkerId>/settings-bad-entry.json |
      | --wait             | True                                                               |
      | --timeout          | 120s                                                               |
    Then the command exited with 0
    Given Pod "<AppPod>"
    And "<AppPod>" namespace is "<Namespace>"
    And "<AppPod>" label "app.kubernetes.io/instance" is "devcontainer-builder"
    When I poll logs for Pod known as "<AppPod>" every "1s" for up to "10s" until:
      | SOURCE | CONDITION | VALUE                                                    | OUTCOME |
      | STDOUT | contains  | skipping invalid git credentials config entry at index 1 | pass    |

    When I remove Docker Buildx Builder known as "<Builder>"
    Then the command exited with 0
    When I uninstall Helm Release known as "<Release>"
    Then the command exited with 0
    When I uninstall Helm Release "<NamespaceRelease>" with --wait --timeout 120s
    Then the command exited with 0
