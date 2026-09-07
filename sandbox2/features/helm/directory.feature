Feature: BDD Framework for Directory-scoped Helm commands
  As a DevOps engineer
  I want to run the `helm` subcommands that only accept a local chart
  directory (index, lint, package, dependency)
  So that I can validate a chart's source before it's ever installed

  Scenario: Indexing a Chart Directory
    Given Directory known as "<ChartsDirectory>":
      | PROPERTY | VALUE    |
      | path     | ./charts |
    When I index Directory known as "<ChartsDirectory>" with:
      | OPTION | VALUE |
    Then the command exited with 0

  Scenario: Linting a Chart Directory
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    When I lint Directory known as "<NginxChartDirectory>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE                            |
      | STDOUT | contains  | 1 chart(s) linted, 0 chart(s) failed |

  Scenario: Packaging a Chart Directory
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    When I package Directory known as "<NginxChartDirectory>" with:
      | OPTION | VALUE     |
      | -d     | .cache    |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE                          |
      | STDOUT | contains  | Successfully packaged chart    |

  Scenario: Listing Chart Dependencies
    Given Directory known as "<NginxChartDirectory>":
      | PROPERTY | VALUE          |
      | path     | ./charts/nginx |
    When I list dependencies for Directory known as "<NginxChartDirectory>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE                  |
      | STDOUT | contains  | no dependencies at     |

