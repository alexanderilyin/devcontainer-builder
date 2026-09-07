Feature: Helm Repo alias validation

  Scenario: Defining a Helm Repo
    Given URL known as "<BitnamiRepoUrl>":
      | PROPERTY | VALUE                              |
      | value    | https://charts.bitnami.com/bitnami |
    And Helm Repo known as "<BitnamiHelmRepo>":
      | PROPERTY | VALUE            |
      | name     | bitnami          |
      | url      | <BitnamiRepoUrl> |

  Scenario: Rejecting an unknown property
    When I attempt to define Helm Repo known as "<BadRepo>":
      | PROPERTY | VALUE |
      | xxx      | yyy   |
    Then it should have failed with 'HelmRepo has no field "xxx"'

  Scenario: Rejecting a missing name
    When I attempt to define Helm Repo known as "<NoNameRepo>":
      | PROPERTY | VALUE                               |
      | url      | https://charts.bitnami.com/bitnami  |
    Then it should have failed with 'HelmRepo requires a "name" field'

  Scenario: Rejecting a missing url
    When I attempt to define Helm Repo known as "<NoUrlRepo>":
      | PROPERTY | VALUE   |
      | name     | bitnami |
    Then it should have failed with 'HelmRepo requires a "url" field'

  Scenario: Referencing an unregistered URL alias from a Helm Repo
    When I attempt to define Helm Repo known as "<BadRepo>":
      | PROPERTY | VALUE          |
      | name     | bitnami        |
      | url      | <UndefinedUrl> |
    Then it should have failed with 'No Alias registered as "<UndefinedUrl>"'
