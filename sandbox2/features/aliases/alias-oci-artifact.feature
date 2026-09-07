Feature: OCIArtifact alias validation

  Scenario: Defining an OCIArtifact
    Given OCIArtifact known as "<NginxOciArtifact>":
      | PROPERTY | VALUE                                          |
      | ref      | oci://registry-1.docker.io/bitnamicharts/nginx |

  Scenario: Rejecting an unknown property
    When I attempt to define OCIArtifact known as "<BadOci>":
      | PROPERTY | VALUE                      |
      | xxx      | oci://example.com/charts/x |
    Then it should have failed with 'OCIArtifact has no field "xxx"'

  Scenario: Rejecting a ref without the oci:// prefix
    When I attempt to define OCIArtifact known as "<NotOci>":
      | PROPERTY | VALUE                       |
      | ref      | https://example.com/charts |
    Then it should have failed with 'OCIArtifact ref must start with "oci://"'

  Scenario: Referencing an unregistered OCIArtifact alias from a Helm Chart
    When I attempt to define Helm Chart known as "<BadChart>":
      | PROPERTY | VALUE                  |
      | chart    | <UndefinedOciArtifact> |
    Then it should have failed with 'No Alias registered as "<UndefinedOciArtifact>"'
