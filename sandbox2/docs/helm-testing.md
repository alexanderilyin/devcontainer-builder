# Helm testing

Helm scenarios exercise the installed Helm binary against real repositories,
charts, and releases. The harness supports chart sources including local
folders, URLs, OCI artifacts, and repository references.

Typical operations include:

- Linting, templating, packaging, and dependency management
- Adding, listing, updating, and removing repositories
- Installing, upgrading, rolling back, testing, and uninstalling releases
- Asserting YAML output with JMESPath expressions

Release scenarios use atomic operations where appropriate and clean up their
resources in the dedicated test namespace. See [Fixtures and charts](fixtures.md)
for the charts used by the suite.
