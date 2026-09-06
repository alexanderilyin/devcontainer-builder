---
name: git-protocol-servers
description: Gotchas standing up minimal real git servers (git-daemon, git-http-backend, OpenSSH) for testing - Alpine's missing git-daemon package, bare repo HEAD defaults, serving smart HTTP without a full webserver, git's "dubious ownership" check across container UIDs, and real SSH host-key verification testing. Use when setting up a git-over-git/http/ssh test fixture, or debugging a git clone that "succeeds" against an empty-looking repo.
---

# Git protocol server gotchas

Concrete lessons from `charts/test-git-server` and `charts/test-openssh-server`
(real, disposable git servers used as BDD test fixtures instead of mocks).

## Alpine's `git` package doesn't include `git-daemon`

`git daemon ...` on a plain `alpine/git` (or `alpine` + `apk add git`) image
fails with `git: 'daemon' is not a git command` - the `git-daemon` binary
ships in a **separate** Alpine package:

```sh
apk add --no-cache git git-daemon
git daemon --reuseaddr --export-all --base-path=/repos --port=9418 /repos
```

## `git init --bare` defaults HEAD to `refs/heads/master`, even if you only ever push to `main`

Symptom: a real clone against a freshly-seeded bare repo "succeeds" but
checks out nothing (`warning: remote HEAD refers to nonexistent ref`, or
"You appear to have cloned an empty repository" over HTTP) - even though
`git show-ref`/`git log` run *inside* the bare repo prove the content and
`refs/heads/main` are genuinely there. The bare repo's `HEAD` symref was
never updated to point at the branch you actually populated.

Fix: create the bare repo with the branch name you intend to push, not the
default:

```sh
git init --bare --initial-branch=main /repos/some/repo.git
git -C /path/to/worktree push /repos/some/repo.git HEAD:main
```

## Serving git smart HTTP doesn't need a full webserver

`git-http-backend` is a standard CGI program - Python's stdlib
`http.server --cgi` (`CGIHTTPRequestHandler`) can run it directly, no
nginx/Apache/fcgiwrap needed:

```sh
mkdir -p /http-root/cgi-bin
cat > /http-root/cgi-bin/git-http-backend <<'EOF'
#!/bin/sh
export GIT_PROJECT_ROOT=/repos
export GIT_HTTP_EXPORT_ALL=1
exec git http-backend
EOF
chmod +x /http-root/cgi-bin/git-http-backend
cd /http-root && python3 -m http.server 8080 --cgi
```

Clone URL shape is then `http://host:8080/cgi-bin/git-http-backend/<repo-path>`.

## git's "dubious ownership" check blocks cross-UID access, and `git config --global` may not be visible to it

If the repo directory was created by a different container/UID than the one
now trying to read it (common when an initContainer seeds a shared volume
that a different container later serves), git refuses with
`fatal: detected dubious ownership in repository at '...'`. The documented
fix (`git config --global --add safe.directory '*'`) writes to
`$HOME/.gitconfig` - but if the process invoking git doesn't reliably carry
`HOME` through (e.g. Python's `CGIHTTPRequestHandler` spawning a CGI
subprocess did **not** carry `HOME` through here, even though the parent
process had it), that global config is invisible to the child and the
error persists despite being "fixed."

More robust fix - git's environment-variable config override, which
doesn't depend on `HOME` or any file at all:

```sh
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0=*
```

Set this directly in whatever script actually invokes git (e.g. inside the
CGI wrapper script above), not just once at container startup.

## Real SSH host-key verification testing, without faking the SSH protocol

A real, disposable `sshd` (e.g. `linuxserver/openssh-server` with no
`PUBLIC_KEY`/`PASSWORD_ACCESS` configured) is enough to test host-key
verification behavior (TOFU vs. pinned) for real: an actual `ssh-keyscan`
against it succeeds, and a real `git clone ssh://...` against it fails
**at the authentication step** ("Permission denied (publickey,...)"),
*after* host-key verification already succeeded - a clean, real,
observable distinction from a host-key-verification failure
("Host key verification failed"), without needing to configure a working
login or fake the protocol. This is enough to prove TOFU/pinned branching
logic works without needing the fixture to also serve real repo content
over SSH.
