Feature: Git source resolution - URL parsing, credential precedence, and protocol conversion
  As an operator of devcontainer-builder
  I want the service to resolve the right credential and clone protocol for a repository
  So that callers don't need to know or care whether a host is configured for HTTPS or SSH

  Runs against real fixtures throughout (see features/support/build_fixtures.js).
  test-git-server genuinely serves all four protocols - git://, http://,
  https:// (real TLS via a self-signed CA generated per test run), and
  ssh:// (a real authorized key, via a `command=` forced wrapper) - so most
  scenarios below prove an actual, working clone rather than inferring
  success from a specific failure signature. One deliberate limit remains,
  a real infrastructure constraint rather than a gap in the service's own
  logic: "credential resolution is correctly scoped per host" is provable
  as "requests to different hosts produce different, correct outcomes" (not
  accidentally cross-wired) - the netrc/SSH key *content* actually used per
  request is an internal detail with no other external signal once the
  process exits.

  Background:
    # The buildkit fixture's trust config always needs both registry
    # hosts, even though this file never itself pushes to the authed one -
    # its deploy is memoized process-wide, so whichever file's Background
    # happens to trigger it first must have the complete picture, not just
    # what that one file personally uses.
    Given the following fixture releases are registered:
      | fixture              | release              |
      | test-registry        | test-registry        |
      | test-registry-authed | test-registry-authed |
      | test-buildkit        | test-buildkit         |
      | test-git-server      | test-git-server       |
    And the test-registry fixture is deployed
    And the test-buildkit fixture is deployed, trusting test-registry and test-registry-authed as insecure registries
    And the test-git-server fixture is deployed, serving:
      | protocol | port |
      | git      | 9418 |
      | http     | 8080 |
      | https    | 443  |
      | ssh      | 22   |
    And a fresh, never-authorized SSH private key named "<unauthorized-key>"
    And the test-git-server fixture's real authorized SSH private key named "<authorized-key>"
    And the test-registry fixture's URL is known as "<registry-url>"
    And the test-buildkit fixture's endpoint is known as "<buildkit-endpoint>"
    And the test-git-server fixture's bare host is known as "<git-host>"
    And the test-git-server fixture's git protocol URL is known as "<git-url>"
    And the test-git-server fixture's http URL is known as "<http-url>"
    And the test-git-server fixture's ssh URL is known as "<ssh-url>"
    And the devcontainer-builder service is configured with:
      | BUILDKIT_ENDPOINT | <buildkit-endpoint> |

  @client-request
  Scenario Outline: No credentials resolve anywhere - the given URL is cloned verbatim
    Given the server has no git credentials configured
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<repository>", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be <status>
    And the response body should contain "<expect>"

    Examples:
      | repository                                                    | status | expect               |
      | <git-url>/example/example-devcontainer.git            | 200    | example-devcontainer |
      | <http-url>/example/example-devcontainer.git           | 200    | example-devcontainer |
      | git@<git-host>:example/example-devcontainer.git       | 500    | git clone            |
      | <ssh-url>/example/example-devcontainer.git            | 500    | git clone            |

  @negative @client-request
  Scenario: An unparseable repository URL is rejected
    Given the server has no git credentials configured
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "not a git url at all", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 400
    And the response body should include:
      """
      { "error": "unable to parse git repository URL: not a git url at all" }
      """

  @client-request
  Scenario: Request-level gitCredentials rewrite an SCP-style URL to HTTPS
    Given the server has no git credentials configured
    And the devcontainer-builder service trusts the test-git-server fixture's TLS certificate authority
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "git@<git-host>:example/example-devcontainer.git",
        "gitCredentials": { "username": "svc-bot", "token": "ghp_example" },
        "image": { "registry": "<registry-url>" }
      }
      """
    Then the response status should be 200
    And the response body should contain "example-devcontainer"

  @server-config
  Scenario: A server-configured HTTPS credential is used when the request supplies none
    Given the server's git credentials are:
      | host               | kind  | username | token       |
      | <git-host> | https | svc-bot  | ghp_example |
    And the devcontainer-builder service trusts the test-git-server fixture's TLS certificate authority
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 200
    And the response body should contain "example-devcontainer"

  @server-config
  Scenario: A server-configured SSH credential rewrites an HTTPS request URL to SSH
    Given the server's git credentials are:
      | host          | kind | privateKey     | pinnedHostKey |
      | <git-host> | ssh  | <authorized-key> | (unset)       |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | tofu |
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "https://<git-host>/example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 200
    And the response body should contain "example-devcontainer"

  @server-config @client-request
  Scenario: Request-level gitCredentials win over a server-configured SSH default for the same host
    # If this regressed (server SSH wrongly won), the clone would instead
    # try ssh://<git-host>/... using the deliberately unauthorized
    # key below - a real, fast, clean "Permission denied" failure (not a
    # hang or timeout, since the SSH fixture genuinely listens and
    # responds), cleanly distinguishable from the 200 expected here.
    Given the server's git credentials are:
      | host               | kind | privateKey       | pinnedHostKey |
      | <git-host> | ssh  | <unauthorized-key> | (unset)       |
    And the devcontainer-builder service trusts the test-git-server fixture's TLS certificate authority
    And the service is running
    When I send a POST request to "/build" with body:
      """
      {
        "repository": "https://<git-host>/example/example-devcontainer.git",
        "gitCredentials": { "username": "svc-bot", "token": "ghp_example" },
        "image": { "registry": "<registry-url>" }
      }
      """
    Then the response status should be 200
    And the response body should contain "example-devcontainer"

  @server-config
  Scenario: Each host uses only its own server-configured credential
    # git.invalid is a reserved TLD (RFC 2606) guaranteed to never resolve -
    # a genuinely wrong host that fails fast and cleanly on DNS lookup
    # alone, with no dependency on any second real server.
    Given the server's git credentials are:
      | host               | kind  | username  | token         |
      | <git-host> | https | svc-bot   | ghp_example   |
      | git.invalid        | https | other-bot | glpat_example |
    And the devcontainer-builder service trusts the test-git-server fixture's TLS certificate authority
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "git@<git-host>:example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 200
    And the response body should contain "example-devcontainer"
    When I send a POST request to "/build" with body:
      """
      { "repository": "git@git.invalid:example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 500
    And the service logs should contain "Could not resolve host: git.invalid"

  @server-config
  Scenario: A host with no matching server credential falls back to a verbatim, unauthenticated clone
    Given the server's git credentials are:
      | host        | kind  | username | token       |
      | example.com | https | svc-bot  | ghp_example |
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<git-url>/example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 200

  @server-config
  Scenario: TOFU host key policy trusts the fixture's host key and proceeds to authentication
    Given the server's git credentials are:
      | host          | kind | privateKey       | pinnedHostKey |
      | <git-host> | ssh  | <unauthorized-key> | (unset)       |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | tofu |
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "ssh://<git-host>/example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 500
    And the response body should contain "git clone"
    And the service logs should not contain "Host key verification failed"

  @server-config
  Scenario: Pinned host key policy uses the configured pin without needing a scan
    Given the test-git-server fixture's real current SSH host key named "<current-host-key>"
    And the server's git credentials are:
      | host          | kind | privateKey       | pinnedHostKey    |
      | <git-host> | ssh  | <unauthorized-key> | <current-host-key> |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | pinned |
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "ssh://<git-host>/example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 500
    And the response body should contain "git clone"
    And the service logs should not contain "Host key verification failed"

  @negative @server-config
  Scenario: Pinned host key policy without a configured pin fails closed
    Given the server's git credentials are:
      | host          | kind | privateKey       | pinnedHostKey |
      | <git-host> | ssh  | <unauthorized-key> | (unset)       |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | pinned |
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "ssh://<git-host>/example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 400
    And the response body should contain "no pinned key configured for host"

  @server-config
  Scenario: Pinned host key policy succeeds end to end with a correct pin and an authorized key
    # The other pinned scenarios above only prove the policy *branches*
    # correctly (skips the scan, fails closed with no pin) - none of them
    # ever reach a real success, so "pinned" reaching an actual working
    # clone was unverified. The unauthorized key used elsewhere is
    # deliberate there (isolates host-key behavior from auth); this one
    # swaps in the real authorized key specifically to prove "pinned" can
    # carry a request all the way through, not just fail predictably.
    Given the test-git-server fixture's real current SSH host key named "<current-host-key>"
    And the server's git credentials are:
      | host          | kind | privateKey     | pinnedHostKey    |
      | <git-host> | ssh  | <authorized-key> | <current-host-key> |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | pinned |
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "ssh://<git-host>/example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 200
    And the response body should contain "example-devcontainer"

  @negative @server-config
  Scenario: Pinned host key policy rejects a stale or incorrect pin
    # "<wrong-host-key>" is a real, syntactically valid known_hosts line for
    # this host - just from an unrelated keypair - so this is a genuine
    # host-key mismatch (the actual security case "pinned" exists for),
    # not a parse error standing in for one.
    Given a stale, non-matching SSH host key for the test-git-server fixture named "<wrong-host-key>"
    And the server's git credentials are:
      | host          | kind | privateKey     | pinnedHostKey  |
      | <git-host> | ssh  | <authorized-key> | <wrong-host-key> |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | pinned |
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "ssh://<git-host>/example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 500
    And the response body should contain "git clone"
    And the service logs should contain "Host key verification failed"

  @negative @server-config
  Scenario: A malformed SSH private key fails clearly at clone time, not at config load
    # config.ts's validation only checks privateKey is a non-empty string -
    # garbage content passes startup and is only ever exercised for real
    # once a request actually tries to use it.
    Given the server's git credentials are:
      | host          | kind | privateKey                             | pinnedHostKey |
      | <git-host> | ssh  | this is not a real private key at all  | (unset)       |
    And the devcontainer-builder service is configured with:
      | SSH_HOST_KEY_POLICY | tofu |
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "ssh://<git-host>/example/example-devcontainer.git", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 500
    And the response body should contain "git clone"
    And the service logs should contain "error in libcrypto"

  @negative
  Scenario Outline: A failed clone surfaces as a 500 regardless of the credential path used
    Given the server has no git credentials configured
    And the service is running
    When I send a POST request to "/build" with body:
      """
      { "repository": "<repository>", "image": { "registry": "<registry-url>" } }
      """
    Then the response status should be 500
    And the response body should contain "git clone"

    Examples:
      | repository                                            |
      | <git-url>/example/nonexistent-repo.git         |
      | <http-url>/example/nonexistent-repo.git        |
