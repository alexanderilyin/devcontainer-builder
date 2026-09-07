# Kubernetes testing

Kubernetes aliases discover real resources using label selectors. The suite
supports Deployments, Services, and Pods, including events and logs.

Pods are eventually consistent, so use polling when readiness or container
state can change after a command returns. A poll repeats a real `kubectl`
command until pass conditions hold, fails fast when a terminal bad condition
matches, or reports the last observed state when the timeout expires.

```gherkin
When I poll Pod known as "<Pod>" every "2s" for up to "2m" until:
  | KEY          | CONDITION | VALUE   | OUTCOME |
  | status.phase | equals    | Running | pass    |
Then the command exited with 0
```

Never assume a Service can route to a Pod that is not Ready. Assert readiness
and failure states directly when Kubernetes has removed the Pod from Service
endpoints.
