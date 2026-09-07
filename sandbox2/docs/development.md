# Development

Run these commands from `sandbox2/`:

```bash
npm test
npm run test:ff
npm run test:verbose
npm run test:usage
npm run test:junit
npm run docs:serve
npm run docs:build
```

`docs:serve` starts the local MkDocs server with live reload. `docs:build`
uses strict mode so missing navigation entries and documentation warnings fail
the build.

The documentation site is configured in `mkdocs.yml`. Public guides and the
existing `docs/claude/plans/` documents are both listed explicitly in the
navigation. Add new pages to the navigation when they are created.

The GitHub Actions workflow validates the site on changes. The Pages workflow
publishes the site from pushes to `main`; pull requests only run validation.
