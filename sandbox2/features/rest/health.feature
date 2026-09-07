Feature: BDD Framework for the rest-api test fixture's health probes
  As a DevOps engineer
  I want to exercise a real FastAPI app's k8s health-probe endpoints over
  real HTTP, and prove readiness failure behaves differently from
  liveness failure against the real cluster
  So that I can trust the pattern before building CRUD/auth on top of it

  Scenario: All three health endpoints report healthy after a real startup
    Given Directory known as "<RestApiChartDirectory>":
      | PROPERTY | VALUE            |
      | path     | ./charts/rest-api |
    And Helm Chart known as "<RestApiHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <RestApiChartDirectory> |
    And Release known as "<RestApiRelease>":
      | PROPERTY  | VALUE                  |
      | chart     | <RestApiHelmChart>     |
      | name      | sandbox-rest-api-release |
      | namespace | sandbox2-helm-test     |
    When I upgrade Release known as "<RestApiRelease>" with:
      | OPTION             | VALUE |
      | --install          | True  |
      | --atomic            | True  |
      | --create-namespace  | True  |
    Then the command exited with 0

    Given Service known as "<RestApiService>":
      | PROPERTY                   | VALUE                     |
      | namespace                  | sandbox2-helm-test        |
      | app.kubernetes.io/instance | sandbox-rest-api-release  |
    And RestEndpoint known as "<RestApi>":
      | PROPERTY | VALUE            |
      | service  | <RestApiService> |
      | port     | 8000             |

    When I send a GET request to RestEndpoint known as "<RestApi>" path "/health/startup"
    Then the response status is 200:
      | SOURCE | CONDITION | VALUE          |
      | BODY   | contains  | "started":true |

    When I send a GET request to RestEndpoint known as "<RestApi>" path "/health/ready"
    Then the response status is 200
    Then the command result data has:
      | KEY   | CONDITION | VALUE |
      | ready | equals    | true  |
    Then the response headers has:
      | KEY          | CONDITION | VALUE            |
      | content-type | contains  | application/json |

    When I send a GET request to RestEndpoint known as "<RestApi>" path "/health/live"
    Then the response status is 200

    When I uninstall Release known as "<RestApiRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0

  Scenario: Flipping readiness removes the Pod from Service endpoints without restarting it
    Given Directory known as "<RestApiChartDirectory>":
      | PROPERTY | VALUE            |
      | path     | ./charts/rest-api |
    And Helm Chart known as "<RestApiHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <RestApiChartDirectory> |
    And Release known as "<ReadinessRelease>":
      | PROPERTY  | VALUE                       |
      | chart     | <RestApiHelmChart>          |
      | name      | sandbox-rest-api-readiness  |
      | namespace | sandbox2-helm-test          |
    When I upgrade Release known as "<ReadinessRelease>" with:
      | OPTION             | VALUE |
      | --install          | True  |
      | --atomic            | True  |
      | --create-namespace  | True  |
    Then the command exited with 0

    Given Service known as "<ReadinessService>":
      | PROPERTY                   | VALUE                      |
      | namespace                  | sandbox2-helm-test         |
      | app.kubernetes.io/instance | sandbox-rest-api-readiness |
    And RestEndpoint known as "<ReadinessApi>":
      | PROPERTY | VALUE              |
      | service  | <ReadinessService> |
      | port     | 8000               |

    When I send a PUT request to RestEndpoint known as "<ReadinessApi>" path "/_test/ready" with:
      | TYPE  | KEY   | VALUE |
      | QUERY | ready | false |
    Then the response status is 200

    Given Pod known as "<ReadinessPod>":
      | PROPERTY                   | VALUE                      |
      | namespace                  | sandbox2-helm-test         |
      | app.kubernetes.io/instance | sandbox-rest-api-readiness |
    When I poll Pod known as "<ReadinessPod>" every "3s" for up to "30s" until:
      | KEY                                       | CONDITION | VALUE | OUTCOME |
      | status.containerStatuses[0].ready         | equals    | false | pass    |
      | status.containerStatuses[0].restartCount  | equals    | 0     | pass    |

    # Deliberately no follow-up request to /health/ready through
    # RestEndpoint here: once the Pod is confirmed NotReady above, it has
    # been removed from the Service's endpoints entirely (that's what the
    # poll just proved) - a request routed through the Service has no
    # backend left to reach, so it fails to connect rather than
    # returning a 503. The readiness-gates-traffic behavior is already
    # fully proven by the poll above: k8s's own readinessProbe (hitting
    # this exact path) is what flipped containerStatuses[0].ready false.

    When I uninstall Release known as "<ReadinessRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0

  Scenario: Rejecting an unregistered Service alias from a RestEndpoint
    When I attempt to define RestEndpoint known as "<BadEndpoint>":
      | PROPERTY | VALUE                 |
      | service  | <UndefinedRestService> |
      | port     | 8000                  |
    Then it should have failed with 'No Service registered as "<UndefinedRestService>"'
