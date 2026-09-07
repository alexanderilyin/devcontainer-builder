# REST testing

REST scenarios send real `fetch()` requests to the deployed fixture service.
The endpoint alias resolves to an in-cluster Service URL, and assertions cover
status, headers, JSON data, raw text, and byte-exact files.

Requests support headers, query parameters, JSON fields, literal JSON bodies,
form fields, and file uploads. Response bodies are also recorded as command
results so existing structured-data assertions can be reused for JSON.

Authentication scenarios cover API keys, Basic authentication, bearer tokens,
OAuth2, and OpenID Connect. The auth providers are self-hosted fixtures, so
these tests do not depend on placeholder external endpoints.

For binary transfers, compare the response with the real fixture file rather
than hardcoding an expected string.
