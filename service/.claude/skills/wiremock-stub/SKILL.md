---
description: Creates and debugs WireMock stubs for the external HTTP dependencies this service calls. Use this whenever the user needs to fake, stub, or mock an upstream or downstream HTTP API — for tests, for local development, or to reproduce a specific upstream response. Use it also when a WireMock stub isn't matching and they're trying to work out why, which is the most common WireMock problem by far.
argument-hint: <which upstream API and which scenario>
---

# WireMock stubs

Most WireMock time is spent on stubs that don't match rather than stubs that
don't exist. So bias toward loose matching by default and tighten only where the
test's whole point is the exact request shape.

## Matching

Match on method and a URL pattern. Add header and body matchers only when the
assertion is about them — every extra matcher is another way for the stub to
silently miss and return 404 instead of the response you wrote.

For JSON bodies use `equalToJson` with `ignoreArrayOrder` and
`ignoreExtraElements` set true unless the test is specifically about strictness.
Byte-exact JSON matching breaks the first time someone adds a field to the
request DTO, and the failure surfaces as an unrelated 404 rather than "your
matcher is out of date".

Use `matchingJsonPath` when you care about one field inside a large payload — it
expresses the intent better than a full-body matcher with everything else
wildcarded.

## Debugging a stub that won't match

WireMock will tell you exactly what went wrong; the trick is asking. Hit the
admin API for near misses:

```
GET /__admin/requests/unmatched/near-misses
```

It returns the closest registered stubs with a per-matcher diff, which names the
failing matcher directly. Reading that output is nearly always faster than
guessing.

If you're inside a test, `verify()` failures print the same diff. Check request
journal ordering too — a stub registered later overrides an earlier one for the
same request, which is easy to hit when a base class and a test both register.

## Statefulness

For multi-step flows use scenarios: give the stub a scenario name, a
`requiredScenarioState`, and a `newScenarioState`. That's how you express "the
first poll returns PENDING, the second returns COMPLETE" without hacks.

Reset scenario state between tests. A leaked scenario state is one of the more
confusing flaky-test causes, because the test that fails is the one after the
one that broke.

## Failure modes are the interesting cases

The happy-path stub is the least valuable one — production traffic already covers
it. Deliberately stub the paths your retry and circuit-breaker config claims to
handle:

- `withStatus(500)` and `withStatus(503)` — does the retry policy actually fire,
  and does it stop where you think it does?
- `withFixedDelay` past the client's read timeout — does the timeout surface as a
  clean domain error or as a raw exception reaching the controller?
- `withFault(Fault.CONNECTION_RESET_BY_PEER)` — connection-level failure, which
  behaves differently from an HTTP error status in most clients.
- Malformed body where valid JSON is expected.

If the service has resilience config (retries, circuit breaker, bulkhead), each
of those settings should have a stub that exercises it. Configuration nobody has
tested is configuration nobody knows the behaviour of.

## Organizing stubs

Prefer JSON mapping files under a well-known directory over programmatic
`stubFor` calls scattered through test classes — they're greppable, diffable in
review, and reusable for local development. Keep one file per scenario with a
name that says what it represents, not which endpoint it hits.