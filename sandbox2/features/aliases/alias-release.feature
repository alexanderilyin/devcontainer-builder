Feature: Release alias validation

  Scenario: Defining a Release
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    And Helm Chart known as "<NginxHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <NginxChartDirectory> |
    And Release known as "<NginxRelease>":
      | PROPERTY  | VALUE              |
      | chart     | <NginxHelmChart>   |
      | name      | sandbox-nginx      |
      | namespace | sandbox2-helm-test |

  Scenario: Rejecting an unknown property
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    And Helm Chart known as "<NginxHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <NginxChartDirectory> |
    When I attempt to define Release known as "<BadRelease>":
      | PROPERTY  | VALUE              |
      | chart     | <NginxHelmChart>   |
      | name      | sandbox-nginx      |
      | namespace | sandbox2-helm-test |
      | xxx       | yyy                |
    Then it should have failed with 'Release has no field "xxx"'

  Scenario: Rejecting a missing name
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    And Helm Chart known as "<NginxHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <NginxChartDirectory> |
    When I attempt to define Release known as "<NoNameRelease>":
      | PROPERTY  | VALUE              |
      | chart     | <NginxHelmChart>   |
      | namespace | sandbox2-helm-test |
    Then it should have failed with 'Release requires a "name" field'

  Scenario: Rejecting a missing namespace
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    And Helm Chart known as "<NginxHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <NginxChartDirectory> |
    When I attempt to define Release known as "<NoNamespaceRelease>":
      | PROPERTY | VALUE            |
      | chart    | <NginxHelmChart> |
      | name     | sandbox-nginx    |
    Then it should have failed with 'Release requires a "namespace" field'

  Scenario: Rejecting a missing chart
    When I attempt to define Release known as "<NoChartRelease>":
      | PROPERTY  | VALUE              |
      | name      | sandbox-nginx      |
      | namespace | sandbox2-helm-test |
    Then it should have failed with 'Release requires a "chart" field'

  Scenario: Referencing an unregistered HelmChart alias from a Release
    When I attempt to define Release known as "<BadRelease>":
      | PROPERTY  | VALUE                 |
      | chart     | <UndefinedHelmChart>  |
      | name      | sandbox-nginx         |
      | namespace | sandbox2-helm-test    |
    Then it should have failed with 'No HelmChart registered as "<UndefinedHelmChart>"'
