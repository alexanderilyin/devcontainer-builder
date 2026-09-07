# test-dependency

Minimal chart whose only purpose is declaring a real dependency (a
small, public `metrics-server` repo), for exercising `helm dependency
build/list/update` against real chart-dependency resolution. Not
deployed anywhere - no templates of its own. See
`sandbox2/features/helm/dependency.feature`.
