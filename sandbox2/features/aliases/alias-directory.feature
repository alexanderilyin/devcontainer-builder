Feature: Directory alias validation

  Scenario: Defining a Directory
    Given Directory known as "<ChartsDirectory>":
      | PROPERTY | VALUE    |
      | path     | ./charts |

  Scenario: Rejecting an unknown property
    When I attempt to define Directory known as "<BadDirectory>":
      | PROPERTY | VALUE    |
      | xxx      | ./charts |
    Then it should have failed with 'Directory has no field "xxx"'

  Scenario: Rejecting a nonexistent path
    When I attempt to define Directory known as "<MissingDirectory>":
      | PROPERTY | VALUE            |
      | path     | ./does-not-exist |
    Then it should have failed with 'Directory does not exist'

  Scenario: Referencing an unregistered Directory alias from a Helm Chart
    When I attempt to define Helm Chart known as "<BadChart>":
      | PROPERTY | VALUE                |
      | chart    | <UndefinedDirectory> |
    Then it should have failed with 'No Alias registered as "<UndefinedDirectory>"'
