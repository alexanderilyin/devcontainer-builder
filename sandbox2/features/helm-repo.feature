Feature: BDD Framework for Helm Repositories
  As a DevOps engineer
  I want to register real Helm chart repositories
  So that scenarios referencing a chart by "repo-alias/name" can resolve it

  Scenario: Defining a Helm Repo
    Given URL known as "<BitnamiRepoUrl>":
      | PROPERTY | VALUE                               |
      | value    | https://charts.bitnami.com/bitnami  |
    And Helm Repo known as "<BitnamiHelmRepo>":
      | PROPERTY | VALUE            |
      | name     | bitnami          |
      | url      | <BitnamiRepoUrl> |
    When I add Helm Repo known as "<BitnamiHelmRepo>" with:
      | OPTION | VALUE |
    Then the Helm Repo command exited with 0

  Scenario: Adding a Helm Repo
    Given URL known as "<MetricsServerRepoUrl>":
      | PROPERTY | VALUE                                             |
      | value    | https://kubernetes-sigs.github.io/metrics-server/ |
    And Helm Repo known as "<SandboxAddExampleRepo>":
      | PROPERTY | VALUE                  |
      | name     | sandbox-add-example    |
      | url      | <MetricsServerRepoUrl> |
    When I add Helm Repo known as "<SandboxAddExampleRepo>" with:
      | OPTION                     | VALUE |
      | --insecure-skip-tls-verify | True  |
    Then the Helm Repo command exited with 0:
      | SOURCE | CONDITION | VALUE                              |
      | STDOUT | contains  | has been added to your repositories |
    And I list Helm Repo with:
      | OPTION | VALUE |
      | -o     | yaml  |
    Then the Helm Repo command result data has:
      | KEY      | CONDITION | VALUE                |
      | [*].name | equals    | sandbox-add-example  |
    And I remove Helm Repo known as "<SandboxAddExampleRepo>" with:
      | OPTION | VALUE |
    Then the Helm Repo command exited with 0

  Scenario: Indexing a Helm Repo directory
    Given Directory known as "<ChartsDirectory>":
      | PROPERTY | VALUE    |
      | path     | ./charts |
    When I index Directory known as "<ChartsDirectory>" with:
      | OPTION | VALUE |
    Then the Helm Repo command exited with 0

  Scenario: Listing Helm Repos
    Given URL known as "<BitnamiRepoUrl>":
      | PROPERTY | VALUE                               |
      | value    | https://charts.bitnami.com/bitnami  |
    And Helm Repo known as "<BitnamiHelmRepo>":
      | PROPERTY | VALUE            |
      | name     | bitnami          |
      | url      | <BitnamiRepoUrl> |
    When I add Helm Repo known as "<BitnamiHelmRepo>" with:
      | OPTION | VALUE |
    And I list Helm Repo with:
      | OPTION | VALUE |
      | -o     | yaml  |
    Then the Helm Repo command result data has:
      | KEY      | CONDITION | VALUE   |
      | [*].name | equals    | bitnami |

  Scenario: Removing a Helm Repo
    Given URL known as "<MetricsServerRepoUrl>":
      | PROPERTY | VALUE                                             |
      | value    | https://kubernetes-sigs.github.io/metrics-server/ |
    And Helm Repo known as "<SandboxRemoveExampleRepo>":
      | PROPERTY | VALUE                  |
      | name     | sandbox-remove-example |
      | url      | <MetricsServerRepoUrl> |
    When I add Helm Repo known as "<SandboxRemoveExampleRepo>" with:
      | OPTION | VALUE |
    And I remove Helm Repo known as "<SandboxRemoveExampleRepo>" with:
      | OPTION | VALUE |
    Then the Helm Repo command exited with 0:
      | SOURCE | CONDITION | VALUE                                  |
      | STDOUT | contains  | has been removed from your repositories |

  Scenario: Updating a Helm Repo
    Given URL known as "<MetricsServerRepoUrl>":
      | PROPERTY | VALUE                                             |
      | value    | https://kubernetes-sigs.github.io/metrics-server/ |
    And Helm Repo known as "<MetricsServerHelmRepo>":
      | PROPERTY | VALUE                  |
      | name     | metrics-server         |
      | url      | <MetricsServerRepoUrl> |
    When I add Helm Repo known as "<MetricsServerHelmRepo>" with:
      | OPTION | VALUE |
    And I update Helm Repo known as "<MetricsServerHelmRepo>" with:
      | OPTION                       | VALUE |
      | --fail-on-repo-update-fail   | True  |
    Then the Helm Repo command exited with 0
