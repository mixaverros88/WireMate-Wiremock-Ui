---
description: Adds a new REST endpoint to this Spring Boot service end-to-end — controller, service, repository, DTOs, validation, error handling, and tests. Use this whenever the user asks for a new endpoint, route, or API operation, or says things like "expose X", "add a GET for Y", or "we need an API to do Z", even if they don't mention the word endpoint.
argument-hint: <METHOD /path — short description>
---

# Add an endpoint

The point of this skill is consistency. An endpoint added by hand tends to drift
from the ones around it — a different error shape here, a missing `@Valid`
there — and those small inconsistencies are what make the API annoying to
consume. Read the neighbours first, then match them.

## Before writing anything

Read at least one existing controller and its service, and the global
`@RestControllerAdvice`. Match what you find there over anything in this file —
the codebase is the source of truth, this is just the checklist.

Confirm these before you start, and ask if the request doesn't say:

- Is this a public/partner-facing route or internal-only? It changes auth and
  whether the response shape is part of a contract.
- Pagination: does the collection need it? Anything that can grow unbounded does.
- Idempotency: for POST/PUT that mutates money, orders, or external state, ask
  whether the caller needs an idempotency key.

## Layers

Work outside-in and keep each layer honest about its job.

**Controller** — HTTP only. Maps request to DTO, calls the service, maps result
to a response DTO. No business logic, no repository access, no entities in the
signature. Annotate request bodies with `@Valid`.

**DTOs** — separate request and response records. Never expose JPA entities
directly: it leaks your schema into your contract and makes lazy-loading
surprises into serialization bugs. Use `record` for both.

**Service** — the business logic and the transaction boundary. `@Transactional`
lives here, not on the controller and not on the repository. Keep
`@Transactional(readOnly = true)` on pure reads; it lets the driver and Hibernate
skip dirty-checking.

**Repository** — Spring Data interface. Prefer derived query methods; drop to
`@Query` when the derived name would become unreadable.

## Errors

Throw domain exceptions from the service and let the existing
`@RestControllerAdvice` translate them. Adding try/catch in a controller to build
an error response by hand means two places now decide what a 404 looks like.

If you need a new exception type, add it next to the existing ones and add its
handler to the advice in the same change.

## Validation

Bean Validation on the request DTO for shape (`@NotBlank`, `@Positive`,
`@Size`). Business rules — "this SKU must exist", "the window can't be in the
past" — belong in the service, not in annotations. The split matters because
shape failures are 400s the caller can fix from the message alone, and business
failures usually need a domain-specific code.

## Tests

Two levels, both required:

- `@WebMvcTest` on the controller with the service mocked: status codes, the
  JSON shape, and validation rejections. Fast, and it's what catches contract
  regressions.
- A slice on the service covering the branch logic and the error paths.

If the endpoint touches the database in a way the slice can't cover, add an
integration test — see the `integration-test` skill.

## Finish

- OpenAPI annotations if the project publishes a spec (check for
  `springdoc-openapi` before adding them).
- Confirm the route appears where you expect, then run the module's tests.