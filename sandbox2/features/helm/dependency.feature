Feature: BDD Framework for Helm Chart Dependencies
  As a DevOps engineer
  I want to resolve a chart's real dependencies against a real repository
  So that subchart references are verified, not assumed

  Background:
    Given Directory known as "<DependencyChartDirectory>":
      | PROPERTY | VALUE                    |
      | path     | ./charts/test-dependency |
    And Directory known as "<DownloadsDirectory>":
      | PROPERTY | VALUE                           |
      | path     | ./charts/test-dependency/charts |
    When I purge Directory known as "<DownloadsDirectory>"

  Scenario: Updating Chart Dependencies
    When I list dependencies for Directory known as "<DependencyChartDirectory>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE   |
      | STDOUT | contains  | missing |
    When I update dependencies for Directory known as "<DependencyChartDirectory>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE          |
      | STDOUT | contains  | Saving 1 charts |
    When I list dependencies for Directory known as "<DependencyChartDirectory>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE |
      | STDOUT | contains  | ok    |

  Scenario: Building Chart Dependencies from Chart.lock
    When I update dependencies for Directory known as "<DependencyChartDirectory>" with:
      | OPTION | VALUE |
    Then the command exited with 0
    When I purge Directory known as "<DownloadsDirectory>"
    When I build dependencies for Directory known as "<DependencyChartDirectory>" with:
      | OPTION | VALUE |
    Then the command exited with 0:
      | SOURCE | CONDITION | VALUE               |
      | STDOUT | contains  | Downloading metrics-server |
