Feature: BDD Framework for the rest-api fixture's Users CRUD
  Scenario: Creating and managing a user with credentials
    Given Directory known as "<RestApiChartDirectory>":
      | PROPERTY | VALUE            |
      | path     | ./charts/rest-api |
    And Helm Chart known as "<RestApiHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <RestApiChartDirectory> |
    And Release known as "<UsersRelease>":
      | PROPERTY  | VALUE                 |
      | chart     | <RestApiHelmChart>    |
      | name      | sandbox-users-release |
      | namespace | sandbox2-helm-test    |
    When I upgrade Release known as "<UsersRelease>" with:
      | OPTION            | VALUE |
      | --install         | True  |
      | --atomic          | True  |
      | --create-namespace | True  |
    Then the command exited with 0

    Given Service known as "<UsersService>":
      | PROPERTY                   | VALUE                 |
      | namespace                  | sandbox2-helm-test    |
      | app.kubernetes.io/instance | sandbox-users-release |
    And RestEndpoint known as "<UsersApi>":
      | PROPERTY | VALUE         |
      | service  | <UsersService> |
      | port     | 8000          |

    When I send a POST request to RestEndpoint known as "<UsersApi>" path "/users/" with:
      | TYPE  | KEY             | VALUE        |
      | FIELD | username        | lifecycle-user |
      | FIELD | password        | secret       |
      | FIELD | api_key_enabled | true         |
      | FIELD | bearer_enabled  | true         |
    Then the response status is 201
    Then the command result data has:
      | KEY             | CONDITION | VALUE          |
      | username        | equals    | lifecycle-user |
      | password_hash   | undefined |              |

    Given the value at "id" from the last response is known as "<UserId>"
    Given the value at "api_key" from the last response is known as "<ApiKey>"

    When I send a GET request to RestEndpoint known as "<UsersApi>" path "/users/<UserId>"
    Then the response status is 200
    Then the command result data has:
      | KEY      | CONDITION | VALUE          |
      | username | equals    | lifecycle-user |

    When I send a PUT request to RestEndpoint known as "<UsersApi>" path "/users/<UserId>" with:
      | TYPE  | KEY      | VALUE          |
      | FIELD | username | renamed-user   |
    Then the response status is 200
    Then the command result data has:
      | KEY             | CONDITION | VALUE        |
      | username        | equals    | renamed-user |
      | api_key_enabled | equals    | true         |

    When I send a POST request to RestEndpoint known as "<UsersApi>" path "/users/<UserId>/api-key"
    Then the response status is 200
    Then the command result data has:
      | KEY      | CONDITION | VALUE        |
      | api_key  | contains  |              |
      | username | equals    | renamed-user |

    When I send a DELETE request to RestEndpoint known as "<UsersApi>" path "/users/<UserId>"
    Then the response status is 204

    When I send a GET request to RestEndpoint known as "<UsersApi>" path "/users/<UserId>"
    Then the response status is 404

    When I uninstall Release known as "<UsersRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0
