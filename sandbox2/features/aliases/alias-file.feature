Feature: File alias validation

  Scenario: Defining a File
    Given File known as "<NginxChartFile>":
      | PROPERTY | VALUE                    |
      | path     | ./charts/nginx-0.1.0.tgz |

  Scenario: Rejecting an unknown property
    When I attempt to define File known as "<BadFile>":
      | PROPERTY | VALUE                    |
      | xxx      | ./charts/nginx-0.1.0.tgz |
    Then it should have failed with 'File has no field "xxx"'

  Scenario: Rejecting a nonexistent path
    When I attempt to define File known as "<MissingFile>":
      | PROPERTY | VALUE                |
      | path     | ./does-not-exist.tgz |
    Then it should have failed with 'File does not exist'

  Scenario: Referencing an unregistered File alias from a Helm Chart
    When I attempt to define Helm Chart known as "<BadChart>":
      | PROPERTY | VALUE           |
      | chart    | <UndefinedFile> |
    Then it should have failed with 'No Alias registered as "<UndefinedFile>"'
