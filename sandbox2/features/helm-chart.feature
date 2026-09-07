Feature: BDD Framework for Helm Charts
  As a DevOps engineer
  I want to deploy Helm charts and verify their status using BDD-style tests
  So that I can ensure my deployments are successful and meet the required conditions

  Scenario: Defining Local Helm Chart
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    And Helm Chart known as "<LocalNginxHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <NginxChartDirectory> |
    And Helm Chart known as "<LocalNginxHelmChart>" has:
      | KEY         | CONDITION | VALUE       |
      | apiVersion  | equals    | v2          |
      | name        | equals    | nginx       |
      | description | contains  | nginx       |
      | type        | equals    | application |
      | version     | equals    | 0.1.0       |
      | appVersion  | equals    | 1.27        |

  Scenario: Defining Local Archive Chart
    Given File known as "<NginxChartFile>":
      | PROPERTY | VALUE                    |
      | path     | ./charts/nginx-0.1.0.tgz |
    And Helm Chart known as "<LocalArchiveNginxHelmChart>":
      | PROPERTY | VALUE            |
      | chart    | <NginxChartFile> |
    And Helm Chart known as "<LocalArchiveNginxHelmChart>" has:
      | KEY         | CONDITION | VALUE       |
      | apiVersion  | equals    | v2          |
      | name        | equals    | nginx       |
      | description | contains  | nginx       |
      | type        | equals    | application |
      | version     | equals    | 0.1.0       |
      | appVersion  | equals    | 1.27        |

  Scenario: Defining URL Chart
    Given URL known as "<NginxChartUrl>":
      | PROPERTY | VALUE                                               |
      | value    | https://charts.bitnami.com/bitnami/nginx-18.2.5.tgz |
    And Helm Chart known as "<UrlNginxHelmChart>":
      | PROPERTY | VALUE           |
      | chart    | <NginxChartUrl> |
    And Helm Chart known as "<UrlNginxHelmChart>" has:
      | KEY         | CONDITION | VALUE       |
      | apiVersion  | equals    | v2          |
      | name        | equals    | nginx       |
      | description | icontains | nginx       |
      | type        | undefined |             |
      | version     | equals    | 18.2.5      |
      | appVersion  | equals    | 1.27.2      |

  Scenario: Defining Reference Chart
    Given URL known as "<BitnamiRepoUrl>":
      | PROPERTY | VALUE                               |
      | value    | https://charts.bitnami.com/bitnami  |
    And Helm Repo known as "<BitnamiHelmRepo>":
      | PROPERTY | VALUE             |
      | name     | bitnami           |
      | url      | <BitnamiRepoUrl>  |
    When I add Helm Repo known as "<BitnamiHelmRepo>" with:
      | OPTION | VALUE |
    And Helm Chart known as "<ReferenceNginxHelmChart>":
      | PROPERTY | VALUE         |
      | chart    | bitnami/nginx |
    And Helm Chart known as "<ReferenceNginxHelmChart>" has:
      | KEY         | CONDITION | VALUE       |
      | apiVersion  | equals    | v2          |
      | name        | equals    | nginx       |
      | description | icontains  | nginx       |
      | type        | equals    | undefined |
      | version     | equals    |       25.1.10 |
      | appVersion  | equals    |        1.31.5 |

  Scenario: Defining Reference Chart via Repo
    Given URL known as "<BitnamiRepoUrl>":
      | PROPERTY | VALUE                               |
      | value    | https://charts.bitnami.com/bitnami  |
    And Helm Chart known as "<RepoReferenceNginxHelmChart>":
      | PROPERTY | VALUE            |
      | chart    | nginx            |
      | repo     | <BitnamiRepoUrl> |
    And Helm Chart known as "<RepoReferenceNginxHelmChart>" has:
      | KEY         | CONDITION | VALUE       |
      | apiVersion  | equals    | v2          |
      | name        | equals    | nginx       |
      | description | icontains  | nginx       |
      | type        | undefined    |  |
      | version     | equals    |       25.1.10 |
      | appVersion  | equals    |        1.31.5 |

  Scenario: Defining OCI Chart
    Given OCIArtifact known as "<NginxOciArtifact>":
      | PROPERTY | VALUE                                          |
      | ref      | oci://registry-1.docker.io/bitnamicharts/nginx |
    And Helm Chart known as "<OciNginxHelmChart>":
      | PROPERTY | VALUE              |
      | chart    | <NginxOciArtifact> |
    And Helm Chart known as "<OciNginxHelmChart>" has:
      | KEY         | CONDITION | VALUE       |
      | apiVersion  | equals    | v2          |
      | name        | equals    | nginx       |
      | description | contains  | NGINX       |
      | type        | undefined |  |
      | version     | equals    |       25.1.10 |
      | appVersion  | equals    |        1.31.5 |

  Scenario: Rejecting an unknown property
    When I attempt to define Helm Chart known as "<LocalNginxHelmChart>":
      | PROPERTY | VALUE |
      | xxx      | yyy   |
    Then it should have failed with 'HelmChart has no field "xxx"'
