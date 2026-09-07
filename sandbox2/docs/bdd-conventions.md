# BDD conventions

## Define, then act

Define an object with a `Given` step, then use a separate `When` step for the
operation:

```gherkin
Given Helm Repo known as "<BitnamiHelmRepo>":
  | PROPERTY | VALUE                              |
  | name     | bitnami                            |
  | url      | https://charts.bitnami.com/bitnami |
When I add Helm Repo known as "<BitnamiHelmRepo>" with:
  | OPTION | VALUE |
Then the command exited with 0
```

## Aliases

Values such as `<BitnamiHelmRepo>` refer to objects registered in the current
Cucumber World. Alias substitution also works in table values, paths, URLs,
and captured response values.

## Table vocabularies

Use the table headers that match the operation:

| Headers | Purpose |
| --- | --- |
| `PROPERTY | VALUE` | Construct an object |
| `OPTION | VALUE` | Build CLI arguments |
| `KEY | CONDITION | VALUE` | Assert structured output with JMESPath |
| `SOURCE | CONDITION | VALUE` | Assert raw command output |
| `TYPE | KEY | VALUE` | Build an HTTP request |

Keep scenarios self-contained. Any scenario that mutates cluster state must
redeploy its own resources and clean them up.
