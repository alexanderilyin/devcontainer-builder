Feature: BDD Framework for Helm Releases
  As a DevOps engineer
  I want to install, inspect, and roll back real Helm releases on a real cluster
  So that I can functionally test a chart's actual deployed behavior

  Scenario: Installing, inspecting, testing, and uninstalling a Release
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    And Helm Chart known as "<NginxHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <NginxChartDirectory> |
    And Release known as "<NginxRelease>":
      | PROPERTY  | VALUE                  |
      | chart     | <NginxHelmChart>       |
      | name      | sandbox-nginx-release  |
      | namespace | sandbox2-helm-test     |
    When I upgrade Release known as "<NginxRelease>" with:
      | OPTION              | VALUE |
      | --install           | True  |
      | --atomic             | True  |
      | --create-namespace   | True  |
    Then the command exited with 0
    When I status Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
      | -o     | yaml  |
    Then the command result data has:
      | KEY         | CONDITION | VALUE    |
      | info.status | equals    | deployed |
    When I history Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
      | -o     | yaml  |
    Then the command result data has:
      | KEY        | CONDITION | VALUE    |
      | [*].status | equals    | deployed |
    When I get values for Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
      | -a     | True  |
      | -o     | yaml  |
    Then the command result data has:
      | KEY          | CONDITION | VALUE |
      | replicaCount | equals    | 1     |
    When I list Release with:
      | OPTION | VALUE              |
      | -n     | sandbox2-helm-test |
      | -o     | yaml               |
    Then the command result data has:
      | KEY      | CONDITION | VALUE                 |
      | [*].name | equals    | sandbox-nginx-release |
    When I get metadata for Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
      | -o     | yaml  |
    Then the command result data has:
      | KEY   | CONDITION | VALUE |
      | name  | equals    | sandbox-nginx-release |
      | chart | equals    | nginx |
    When I get hooks for Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE                        |
      | STDOUT | contains  | helm.sh/hook": test          |
    When I get manifest for Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE                                   |
      | STDOUT | contains  | # Source: nginx/templates/service.yaml  |
    When I get notes for Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE       |
      | STDOUT | contains  | Access it:  |
    When I get all for Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE                   |
      | STDOUT | contains  | NOTES:                  |
      | STDOUT | contains  | # Source: nginx/templates/service.yaml |
    When I test Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE     |
      | STDOUT | contains  | Succeeded |
    When I uninstall Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE       |
      | STDOUT | contains  | uninstalled |

  Scenario: Rolling back a Release to a previous revision
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    And Helm Chart known as "<NginxHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <NginxChartDirectory> |
    And Release known as "<RollbackRelease>":
      | PROPERTY  | VALUE                  |
      | chart     | <NginxHelmChart>       |
      | name      | sandbox-rollback-release |
      | namespace | sandbox2-helm-test     |
    When I upgrade Release known as "<RollbackRelease>" with:
      | OPTION              | VALUE |
      | --install           | True  |
      | --create-namespace   | True  |
    Then the command exited with 0
    When I upgrade Release known as "<RollbackRelease>" with:
      | OPTION | VALUE          |
      | --set  | replicaCount=2 |
    Then the command exited with 0
    When I rollback Release known as "<RollbackRelease>" with:
      | OPTION | VALUE |
      |        | 1     |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE                       |
      | STDOUT | contains  | Rollback was a success      |
    When I uninstall Release known as "<RollbackRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0

  Scenario: Rejecting a duplicate install
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    And Helm Chart known as "<NginxHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <NginxChartDirectory> |
    And Release known as "<DuplicateRelease>":
      | PROPERTY  | VALUE                   |
      | chart     | <NginxHelmChart>        |
      | name      | sandbox-duplicate-release |
      | namespace | sandbox2-helm-test      |
    When I install Release known as "<DuplicateRelease>" with:
      | OPTION            | VALUE |
      | --create-namespace | True  |
    Then the command exited with 0
    When I install Release known as "<DuplicateRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 1:
      | SOURCE | CONDITION | VALUE                          |
      | STDERR | contains  | cannot re-use a name            |
    When I uninstall Release known as "<DuplicateRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0
