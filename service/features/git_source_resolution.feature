Feature: Git source resolution - URL parsing, credential precedence, and protocol conversion
  As an operator of devcontainer-builder
  I want the service to resolve the right credential and clone protocol for a repository
  So that callers don't need to know or care whether a host is configured for HTTPS or SSH

  Runs against real fixtures throughout (see features/support/build_fixtures.js
  and features/support/ssh_fixture.js). Two deliberate limits on what's
  provable here, both real infrastructure constraints, not gaps in the
  service's own logic:
  - build.ts always rewrites an HTTPS-resolved clone to a literal
    "https://" URL, and this test setup has no real TLS anywhere, so
    HTTPS-credentialed scenarios can never reach a real 200. The git-server
    fixture's git-http container also listens on 443 with a plain
    (non-TLS) HTTP server specifically so an HTTPS attempt against it fails
    fast and distinctively ("GnuTLS, handshake failed") instead of hanging
    (a closed port is silently dropped on this cluster's network) -
    reaching that specific error is itself proof the rewrite correctly
    targeted this host, on this port, over this protocol.
  - "Credential resolution is correctly scoped per host" is provable as
    "requests to different hosts produce different, host-specific
    failures" (not accidentally cross-wired) - the netrc/SSH key *content*
    actually used per request is an internal detail with no external
    signal once the process exits.

  Background:
    Given the service is running
    And the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | (test buildkit) |

  @client-request
  Scenario Outline: No credentials resolve anywhere - the given URL is cloned verbatim
    Given the server has no git credentials configured
    When I send a POST request to "/build" with body:
      """
      { "repository": "<repository>", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be <status>
    And the response body should contain "<expect>"

    Examples:
      | repository                                            | status | expect               |
      | (git fixture git)/example/example-devcontainer.git    | 200    | example-devcontainer |
      | (git fixture http)/example/example-devcontainer.git   | 200    | example-devcontainer |
      | git@127.0.0.1:example/example-devcontainer.git        | 500    | git clone            |
      | ssh://git@127.0.0.1/example/example-devcontainer.git  | 500    | git clone            |

  @negative @client-request
  Scenario: An unparseable repository URL is rejected
    Given the server has no git credentials configured
    When I send a POST request to "/build" with body:
      """
      { "repository": "not a git url at all", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 400
    And the response body should include:
      """
      { "error": "unable to parse git repository URL: not a git url at all" }
      """

  @client-request
  Scenario: Request-level gitCredentials rewrite an SCP-style URL to HTTPS
    Given the server has no git credentials configured
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "git@(git fixture host):example/example-devcontainer.git",
        "gitCredentials": { "username": "svc-bot", "token": "ghp_example" },
        "image": { "registry": "(test registry)" }
      }
      """
    Then the response status should be 500
    And the service logs should contain "GnuTLS, handshake failed"

  @server-config
  Scenario: A server-configured HTTPS credential is used when the request supplies none
    Given the server's git credentials are:
      | host               | kind  | username | token       |
      | (git fixture host) | https | svc-bot  | ghp_example |
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the service logs should contain "GnuTLS, handshake failed"

  @server-config
  Scenario: A server-configured SSH credential rewrites an HTTPS request URL to SSH
    Given the server's git credentials are:
      | host          | kind | privateKey            | pinnedHostKey |
      | (ssh fixture) | ssh  | (a valid private key) | (unset)       |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | tofu |
    When I send a POST request to "/build" with body:
      """
      { "repository": "https://(ssh fixture)/example/example-devcontainer.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the response body should contain "git clone"
    And the service logs should not contain "Host key verification failed"

  @server-config @client-request
  Scenario: Request-level gitCredentials win over a server-configured SSH default for the same host
    # If this regressed (server SSH wrongly won), the clone would instead
    # try ssh://(git fixture host)/... - port 22 is closed there, and a
    # closed port hangs on this cluster's network rather than failing
    # cleanly, so a regression here shows up as a step timeout rather than
    # a clean assertion mismatch. Still a real, working regression signal.
    Given the server's git credentials are:
      | host               | kind | privateKey            | pinnedHostKey |
      | (git fixture host) | ssh  | (a valid private key) | (unset)       |
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "https://(git fixture host)/example/example-devcontainer.git",
        "gitCredentials": { "username": "svc-bot", "token": "ghp_example" },
        "image": { "registry": "(test registry)" }
      }
      """
    Then the response status should be 500
    And the service logs should contain "GnuTLS, handshake failed"

  @server-config
  Scenario: Each host uses only its own server-configured credential
    Given the server's git credentials are:
      | host               | kind  | username  | token         |
      | (git fixture host) | https | svc-bot   | ghp_example   |
      | 127.0.0.1          | https | other-bot | glpat_example |
    When I send a POST request to "/build" with body:
      """
      { "repository": "git@(git fixture host):example/example-devcontainer.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the service logs should contain "GnuTLS, handshake failed"
    When I send a POST request to "/build" with body:
      """
      { "repository": "git@127.0.0.1:example/example-devcontainer.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the service logs should contain "Failed to connect to 127.0.0.1 port 443"

  @server-config
  Scenario: A host with no matching server credential falls back to a verbatim, unauthenticated clone
    Given the server's git credentials are:
      | host        | kind  | username | token       |
      | example.com | https | svc-bot  | ghp_example |
    When I send a POST request to "/build" with body:
      """
      { "repository": "(git fixture git)/example/example-devcontainer.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 200

  @server-config
  Scenario: TOFU host key policy trusts the fixture's host key and proceeds to authentication
    Given the server's git credentials are:
      | host          | kind | privateKey            | pinnedHostKey |
      | (ssh fixture) | ssh  | (a valid private key) | (unset)       |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | tofu |
    When I send a POST request to "/build" with body:
      """
      { "repository": "ssh://(ssh fixture)/example/example-devcontainer.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the response body should contain "git clone"
    And the service logs should not contain "Host key verification failed"

  @server-config
  Scenario: Pinned host key policy uses the configured pin without needing a scan
    Given the server's git credentials are:
      | host          | kind | privateKey            | pinnedHostKey           |
      | (ssh fixture) | ssh  | (a valid private key) | (ssh fixture host key)  |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | pinned |
    When I send a POST request to "/build" with body:
      """
      { "repository": "ssh://(ssh fixture)/example/example-devcontainer.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the response body should contain "git clone"
    And the service logs should not contain "Host key verification failed"

  @negative @server-config
  Scenario: Pinned host key policy without a configured pin fails closed
    Given the server's git credentials are:
      | host          | kind | privateKey            | pinnedHostKey |
      | (ssh fixture) | ssh  | (a valid private key) | (unset)       |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | pinned |
    When I send a POST request to "/build" with body:
      """
      { "repository": "ssh://(ssh fixture)/example/example-devcontainer.git", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 400
    And the response body should contain "no pinned key configured for host"

  @negative
  Scenario Outline: A failed clone surfaces as a 500 regardless of the credential path used
    Given the server has no git credentials configured
    When I send a POST request to "/build" with body:
      """
      { "repository": "<repository>", "image": { "registry": "(test registry)" } }
      """
    Then the response status should be 500
    And the response body should contain "git clone"

    Examples:
      | repository                                            |
      | (git fixture git)/example/nonexistent-repo.git         |
      | (git fixture http)/example/nonexistent-repo.git        |
