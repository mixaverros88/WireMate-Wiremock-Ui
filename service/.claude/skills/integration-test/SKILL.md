---
description: Writes and fixes integration tests for this Spring Boot service using Testcontainers and real Postgres. Use this whenever the user asks for an integration test, an end-to-end test, a test that hits the database, or help with a slow, flaky, or failing @SpringBootTest. Use it also when they say a test "passes locally but fails in CI" — that is almost always a context-caching or container-lifecycle problem this skill covers.
---

# Integration tests

An integration test earns its cost by testing the things a mock can't: the actual
SQL, the actual transaction boundaries, the actual serialization. If a test could
pass with the database mocked out, it should be a slice test instead — write it as
`@WebMvcTest` or `@DataJpaTest` and keep the suite fast.

## Context caching is the whole performance story

Spring caches the application context per unique configuration. Every distinct
combination of `@SpringBootTest` properties, `@MockBean` declarations, and active
profiles creates another context, and each one costs a full startup. A suite with
fifteen slightly-different configurations spends most of its wall time booting
Spring.

So: define one abstract base class with the container setup and the
`@SpringBootTest` annotation, and have every integration test extend it. Adding a
single `@MockBean` to one subclass forks the context — if you need a mock, ask
first whether the test wants to be a slice test instead.

## Containers

Use a static container field with `@Container` on the base class. Static means one
container for the whole JVM run rather than one per test class, which is usually
the difference between a two-minute suite and a fifteen-minute one.

Reuse `@ServiceConnection` (Spring Boot 3.1+) instead of hand-wiring
`@DynamicPropertySource` — it wires the datasource automatically and is less to
get wrong.

Pin the image tag. A floating `postgres:latest` means CI can break on a Tuesday
because upstream published a new minor.

## Isolation between tests

Pick one strategy and apply it consistently; mixing them causes the flakiness
people blame on Testcontainers.

`@Transactional` on the test rolls back after each method. It's fast and clean,
but it hides commit-time behaviour — deferred constraints, triggers, and anything
`@TransactionalEventListener` does won't fire. It's also wrong for tests that go
through the HTTP layer, since the request runs on a different thread with its own
transaction.

Explicit cleanup — truncating the affected tables in `@AfterEach` — is slower but
tests what actually happens on commit. Prefer it for anything going through
`TestRestTemplate` or `MockMvc` with a real transaction.

Never rely on test execution order for state. It works until someone adds a test.

## External calls

Stub them; don't call them. See the `wiremock-stub` skill for the setup. A test
that reaches a real external service is not a test, it's a monitor with a bad
error message.

## Async and timing

Never `Thread.sleep`. Use Awaitility with an explicit condition and a timeout —
it makes the test both faster in the good case and legible in the bad case. A
sleep-based test tells you nothing when it fails; an Awaitility failure tells you
which condition never became true.

## When a test is flaky

Work through these in order before adding a retry:

1. Shared mutable state between tests — static fields, caches, a container reused
   without cleanup.
2. Time. Anything using `Instant.now()` in an assertion. Inject a `Clock`.
3. Ordering assumptions in collection assertions — add an explicit `ORDER BY` or
   assert order-independently.
4. Async work not awaited.

Adding `@RepeatedTest` or a retry extension hides the bug and it will resurface in
production instead. Say what you found rather than suppressing it.