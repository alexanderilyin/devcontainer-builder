Feature: URL alias validation

  Scenario: Defining a URL
    Given URL known as "<NginxChartUrl>":
      | PROPERTY | VALUE                                               |
      | value    | https://charts.bitnami.com/bitnami/nginx-18.2.5.tgz |

  Scenario: Rejecting an unknown property
    When I attempt to define URL known as "<BadUrl>":
      | PROPERTY | VALUE                 |
      | xxx      | https://example.com/x |
    Then it should have failed with 'URL has no field "xxx"'

  Scenario: Rejecting a malformed URL
    When I attempt to define URL known as "<MalformedUrl>":
      | PROPERTY | VALUE     |
      | value    | not-a-url |
    Then it should have failed with 'URL is not well-formed'

  Scenario: Rejecting a non-http(s) URL
    When I attempt to define URL known as "<FtpUrl>":
      | PROPERTY | VALUE                        |
      | value    | ftp://example.com/chart.tgz  |
    Then it should have failed with 'URL must be http(s)'

  Scenario: Referencing an unregistered URL alias from a Helm Chart
    When I attempt to define Helm Chart known as "<BadChart>":
      | PROPERTY | VALUE          |
      | chart    | <UndefinedUrl> |
    Then it should have failed with 'No Alias registered as "<UndefinedUrl>"'
