Feature: BDD Framework for the rest-api test fixture's Notes CRUD
  As a DevOps engineer
  I want to exercise real create/read/update/delete round trips against
  a deployed app's own JSON API, using a value the server generated
  (a created note's real id) in later requests
  So that I can trust dynamic-value capture before building auth on top

  Scenario: Creating, reading, updating, and deleting a Note
    Given Directory known as "<RestApiChartDirectory>":
      | PROPERTY | VALUE            |
      | path     | ./charts/rest-api |
    And Helm Chart known as "<RestApiHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <RestApiChartDirectory> |
    And Release known as "<NotesRelease>":
      | PROPERTY  | VALUE                |
      | chart     | <RestApiHelmChart>   |
      | name      | sandbox-notes-release |
      | namespace | sandbox2-helm-test   |
    When I upgrade Release known as "<NotesRelease>" with:
      | OPTION             | VALUE |
      | --install          | True  |
      | --atomic            | True  |
      | --create-namespace  | True  |
    Then the command exited with 0

    Given Service known as "<NotesService>":
      | PROPERTY                   | VALUE                  |
      | namespace                  | sandbox2-helm-test     |
      | app.kubernetes.io/instance | sandbox-notes-release   |
    And RestEndpoint known as "<NotesApi>":
      | PROPERTY | VALUE           |
      | service  | <NotesService> |
      | port     | 8000            |

    When I send a POST request to RestEndpoint known as "<NotesApi>" path "/notes/" with:
      | TYPE  | KEY   | VALUE      |
      | FIELD | title | Groceries  |
      | FIELD | body  | Milk, eggs |
    Then the response status is 201
    Then the command result data has:
      | KEY   | CONDITION | VALUE      |
      | title | equals    | Groceries  |
      | body  | equals    | Milk, eggs |

    Given the value at "id" from the last response is known as "<NoteId>"

    When I send a GET request to RestEndpoint known as "<NotesApi>" path "/notes/<NoteId>"
    Then the response status is 200
    Then the command result data has:
      | KEY   | CONDITION | VALUE      |
      | title | equals    | Groceries  |
      | body  | equals    | Milk, eggs |

    When I send a PUT request to RestEndpoint known as "<NotesApi>" path "/notes/<NoteId>" with:
      | TYPE  | KEY   | VALUE               |
      | FIELD | title | Groceries v2        |
      | FIELD | body  | Milk, eggs, bread   |
    Then the response status is 200
    Then the command result data has:
      | KEY   | CONDITION | VALUE             |
      | title | equals    | Groceries v2      |
      | body  | equals    | Milk, eggs, bread |

    When I send a GET request to RestEndpoint known as "<NotesApi>" path "/notes/<NoteId>"
    Then the command result data has:
      | KEY   | CONDITION | VALUE        |
      | title | equals    | Groceries v2 |

    When I send a DELETE request to RestEndpoint known as "<NotesApi>" path "/notes/<NoteId>"
    Then the response status is 204

    When I send a GET request to RestEndpoint known as "<NotesApi>" path "/notes/<NoteId>"
    Then the response status is 404

    When I uninstall Release known as "<NotesRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0

  Scenario: Rejecting a request for a Note that was never created
    Given Directory known as "<RestApiChartDirectory>":
      | PROPERTY | VALUE            |
      | path     | ./charts/rest-api |
    And Helm Chart known as "<RestApiHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <RestApiChartDirectory> |
    And Release known as "<NotesMissingRelease>":
      | PROPERTY  | VALUE                        |
      | chart     | <RestApiHelmChart>           |
      | name      | sandbox-notes-missing-release |
      | namespace | sandbox2-helm-test           |
    When I upgrade Release known as "<NotesMissingRelease>" with:
      | OPTION             | VALUE |
      | --install          | True  |
      | --atomic            | True  |
      | --create-namespace  | True  |
    Then the command exited with 0

    Given Service known as "<NotesMissingService>":
      | PROPERTY                   | VALUE                          |
      | namespace                  | sandbox2-helm-test              |
      | app.kubernetes.io/instance | sandbox-notes-missing-release   |
    And RestEndpoint known as "<NotesMissingApi>":
      | PROPERTY | VALUE                  |
      | service  | <NotesMissingService> |
      | port     | 8000                   |

    When I send a GET request to RestEndpoint known as "<NotesMissingApi>" path "/notes/no-such-note"
    Then the response status is 404:
      | SOURCE | CONDITION | VALUE            |
      | BODY   | contains  | note not found   |

    When I uninstall Release known as "<NotesMissingRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0
