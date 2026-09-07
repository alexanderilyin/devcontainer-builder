Feature: BDD Framework for real k8s resources created by a Helm Release
  As a DevOps engineer
  I want to discover the real Deployment/Service/Pod a Release creates,
  by their real labels, inspect their real cluster state, and poll for
  eventually-consistent readiness with real fast-fail on a bad state
  So that I can verify a chart's actual runtime behavior, not just that
  `helm install` exited zero

  Scenario: Discovering and validating a Release's Deployment, Service, and Pod
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    And Helm Chart known as "<NginxHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <NginxChartDirectory> |
    And Release known as "<NginxRelease>":
      | PROPERTY  | VALUE                     |
      | chart     | <NginxHelmChart>          |
      | name      | sandbox-nginx-k8s-release |
      | namespace | sandbox2-helm-test        |
    When I upgrade Release known as "<NginxRelease>" with:
      | OPTION             | VALUE |
      | --install           | True  |
      | --atomic             | True  |
      | --create-namespace   | True  |
    Then the command exited with 0

    # Deployment/Service are already stable by the time this discovers
    # them - `--atomic` above already blocked until the rollout was
    # healthy - so a plain one-shot `get` is safe here, no polling needed.
    Given Deployment known as "<NginxDeployment>":
      | PROPERTY                   | VALUE                     |
      | namespace                  | sandbox2-helm-test        |
      | app.kubernetes.io/name     | nginx                     |
      | app.kubernetes.io/instance | sandbox-nginx-k8s-release |
    And Service known as "<NginxService>":
      | PROPERTY                   | VALUE                     |
      | namespace                  | sandbox2-helm-test        |
      | app.kubernetes.io/name     | nginx                     |
      | app.kubernetes.io/instance | sandbox-nginx-k8s-release |

    When I get Deployment known as "<NginxDeployment>" with:
      | OPTION | VALUE |
      | -o     | json  |
    Then the command result data has:
      | KEY                                          | CONDITION | VALUE |
      | status.readyReplicas                         | equals    | 1     |
      | status.availableReplicas                     | equals    | 1     |
      | spec.replicas                                | equals    | 1     |
      | metadata.labels."app.kubernetes.io/version"   | equals    | 1.27  |

    When I get Service known as "<NginxService>" with:
      | OPTION | VALUE |
      | -o     | json  |
    Then the command result data has:
      | KEY                                          | CONDITION | VALUE      |
      | spec.ports[0].port                           | equals    | 80         |
      | spec.type                                    | equals    | ClusterIP  |
      | metadata.labels."app.kubernetes.io/version"   | equals    | 1.27       |

    When I get events for Deployment known as "<NginxDeployment>" with:
      | OPTION | VALUE |
    Then the command exited with 0

    When I get logs for Deployment known as "<NginxDeployment>" with:
      | OPTION | VALUE |
    Then the command exited with 0

    # A Pod, unlike Deployment/Service, has no such guarantee of already
    # being stable - so its readiness is polled, not checked once.
    Given Pod known as "<NginxPod>":
      | PROPERTY                   | VALUE                     |
      | namespace                  | sandbox2-helm-test        |
      | app.kubernetes.io/name     | nginx                     |
      | app.kubernetes.io/instance | sandbox-nginx-k8s-release |

    When I poll Pod known as "<NginxPod>" every "3s" for up to "30s" until:
      | KEY                                               | CONDITION | VALUE            | OUTCOME |
      | status.phase                                      | equals    | Running          | pass    |
      | status.containerStatuses[0].ready                 | equals    | true              | pass    |
      | status.containerStatuses[0].restartCount           | equals    | 0                 | pass    |
      | status.containerStatuses[0].state.waiting.reason   | equals    | CrashLoopBackOff  | fail    |

    When I poll logs for Pod known as "<NginxPod>" every "3s" for up to "15s" until:
      | SOURCE | CONDITION | VALUE                                | OUTCOME |
      | STDOUT | contains  | Configuration complete; ready for start up | pass |

    When I poll events for Pod known as "<NginxPod>" every "3s" for up to "15s" until:
      | SOURCE | CONDITION | VALUE   | OUTCOME |
      | STDOUT | contains  | Started | pass    |
      | STDOUT | contains  | BackOff | fail    |

    When I uninstall Release known as "<NginxRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0

  Scenario: Rejecting a label selector that matches no real resource
    When I attempt to define Deployment known as "<UnmatchedDeployment>":
      | PROPERTY                   | VALUE                          |
      | namespace                  | sandbox2-helm-test              |
      | app.kubernetes.io/instance | no-such-release-should-ever-exist |
    Then it should have failed with "Expected exactly one deployment matching"

  Scenario: Failing fast when a Pod enters a bad state
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    And Helm Chart known as "<NginxHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <NginxChartDirectory> |
    And Release known as "<BadImageRelease>":
      | PROPERTY  | VALUE                          |
      | chart     | <NginxHelmChart>               |
      | name      | sandbox-nginx-badimage-release |
      | namespace | sandbox2-helm-test              |
    # Deliberately no `--atomic` here - that would block and eventually
    # roll back on its own, which is exactly the condition this scenario
    # needs to observe directly via polling instead.
    When I upgrade Release known as "<BadImageRelease>" with:
      | OPTION              | VALUE                          |
      | --install            | True                           |
      | --create-namespace   | True                           |
      | --set                 | image.repository=no-such-image-xyz |
      | --set                 | image.tag=bogus                |
    Then the command exited with 0

    Given Pod known as "<BadImagePod>":
      | PROPERTY                   | VALUE                           |
      | namespace                  | sandbox2-helm-test               |
      | app.kubernetes.io/instance | sandbox-nginx-badimage-release   |
    When I attempt to poll Pod known as "<BadImagePod>" every "3s" for up to "2m" until:
      | KEY                                              | CONDITION | VALUE            | OUTCOME |
      | status.phase                                     | equals    | Running          | pass    |
      | status.containerStatuses[0].state.waiting.reason | equals    | ErrImagePull     | fail    |
      | status.containerStatuses[0].state.waiting.reason | equals    | ImagePullBackOff | fail    |
    Then it should have failed with either:
      | MESSAGE          |
      | ErrImagePull     |
      | ImagePullBackOff |

    When I uninstall Release known as "<BadImageRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0
