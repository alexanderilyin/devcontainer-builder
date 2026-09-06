import { SSH_FIXTURE_HOST, getFixtureHostKeyLine } from "./ssh_fixture.js";
import {
  REGISTRY_HOST,
  AUTHED_REGISTRY_HOST,
  TEST_BUILDKIT_ENDPOINT,
  GIT_FIXTURE_HOST,
  getFixtureHeadShortSha,
} from "./build_fixtures.js";

// Lets .feature files reference real, per-run fixture addresses via a
// readable symbolic token instead of hardcoding a namespace-dependent DNS
// name - resolved wherever a scenario provides free text (request bodies,
// config tables, Given-step string params).
const SENTINELS = {
  "(ssh fixture)": SSH_FIXTURE_HOST,
  "(test registry)": REGISTRY_HOST,
  "(authed registry)": AUTHED_REGISTRY_HOST,
  "(test buildkit)": TEST_BUILDKIT_ENDPOINT,
  "(git fixture host)": GIT_FIXTURE_HOST,
  "(git fixture git)": `git://${GIT_FIXTURE_HOST}:9418`,
  "(git fixture http)": `http://${GIT_FIXTURE_HOST}:8080/cgi-bin/git-http-backend`,
};

export function resolveFixtureSentinels(text) {
  let result = text;
  for (const [sentinel, value] of Object.entries(SENTINELS)) {
    result = result.replaceAll(sentinel, value);
  }
  return result;
}

const HEAD_SENTINEL_RE = /\(head:([^)]+)\)/g;

// "(head:<repo path>)" resolves to the fixture's actual current HEAD short
// SHA (see getFixtureHeadShortSha), and "(ssh fixture host key)" to the SSH
// fixture's actual current host key line (see getFixtureHostKeyLine) - both
// real, dynamic values a scenario can't dictate, unlike the static
// sentinels above. A fake/placeholder pinned host key would make a
// "pinned" scenario fail at host-key verification for the wrong reason (a
// real mismatch) instead of proving pinned policy behaves correctly.
export async function resolveDynamicSentinels(text) {
  let result = text;
  for (const match of text.matchAll(HEAD_SENTINEL_RE)) {
    const sha = await getFixtureHeadShortSha(match[1]);
    result = result.replace(match[0], sha);
  }
  if (result.includes("(ssh fixture host key)")) {
    const keyLine = await getFixtureHostKeyLine();
    result = result.replaceAll("(ssh fixture host key)", keyLine);
  }
  return result;
}
