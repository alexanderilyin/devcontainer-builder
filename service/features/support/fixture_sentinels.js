import {
  REGISTRY_HOST,
  AUTHED_REGISTRY_HOST,
  TEST_BUILDKIT_ENDPOINT,
  GIT_FIXTURE_HOST,
  getFixtureHeadShortSha,
  getFixtureHostKeyLine,
  getWrongHostKeyLine,
} from "./build_fixtures.js";

// Lets .feature files reference real, per-run fixture addresses via a
// readable symbolic token instead of hardcoding a namespace-dependent DNS
// name - resolved wherever a scenario provides free text (request bodies,
// config tables, Given-step string params). "(ssh fixture)" is an alias for
// the same host as "(git fixture host)" - there's only one git server
// fixture now (it serves SSH too), kept as a separate name mainly so
// existing scenario text reads naturally where it's about SSH specifically.
const SENTINELS = {
  "(ssh fixture)": GIT_FIXTURE_HOST,
  "(test registry)": REGISTRY_HOST,
  "(authed registry)": AUTHED_REGISTRY_HOST,
  "(test buildkit)": TEST_BUILDKIT_ENDPOINT,
  "(git fixture host)": GIT_FIXTURE_HOST,
  "(git fixture git)": `git://${GIT_FIXTURE_HOST}:9418`,
  "(git fixture http)": `http://${GIT_FIXTURE_HOST}:8080`,
  "(git fixture https)": `https://${GIT_FIXTURE_HOST}`,
  "(git fixture ssh)": `ssh://git@${GIT_FIXTURE_HOST}`,
};

export function resolveFixtureSentinels(text) {
  let result = text;
  for (const [sentinel, value] of Object.entries(SENTINELS)) {
    result = result.replaceAll(sentinel, value);
  }
  return result;
}

const HEAD_SENTINEL_RE = /\(head:([^)@]+)(?:@([^)]+))?\)/g;

// "(head:<repo path>)" resolves to the fixture's actual current HEAD short
// SHA, and "(head:<repo path>@<branch>)" to a specific branch's - both via
// getFixtureHeadShortSha - so a scenario can prove the request's `branch`
// field genuinely changed which commit got built (main and release are
// real, different commits on the seeded fixture repos, not values a test
// can dictate). "(ssh fixture host key)" resolves to the fixture's actual
// current SSH host key line (see getFixtureHostKeyLine), and "(wrong ssh
// fixture host key)" to a real, syntactically valid, but genuinely
// non-matching one (see getWrongHostKeyLine) - a fake/placeholder pinned
// host key would make a "pinned" scenario fail at host-key verification for
// the wrong reason (or the right one, by accident) instead of proving
// pinned policy behaves correctly either way.
export async function resolveDynamicSentinels(text) {
  let result = text;
  for (const match of text.matchAll(HEAD_SENTINEL_RE)) {
    const sha = await getFixtureHeadShortSha(match[1], match[2]);
    result = result.replace(match[0], sha);
  }
  if (result.includes("(ssh fixture host key)")) {
    const keyLine = await getFixtureHostKeyLine();
    result = result.replaceAll("(ssh fixture host key)", keyLine);
  }
  if (result.includes("(wrong ssh fixture host key)")) {
    const keyLine = await getWrongHostKeyLine();
    result = result.replaceAll("(wrong ssh fixture host key)", keyLine);
  }
  return result;
}
