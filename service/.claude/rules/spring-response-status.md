## @ResponseStatus

Spring returns 200 by default for any handler that completes normally. Do NOT
annotate a handler with `@ResponseStatus(HttpStatus.OK)` — it is redundant.
Delete it if you find it.

Only use `@ResponseStatus` when the status differs from 200:
- `@ResponseStatus(HttpStatus.CREATED)` on POST handlers that create a resource
- `@ResponseStatus(HttpStatus.NO_CONTENT)` on DELETE handlers — and the method
  must return `void`, otherwise the body is still sent alongside the 204
- On custom exception classes, to map them to a status

Do NOT add `@ResponseStatus` to a handler returning `ResponseEntity` — the
entity's status wins and the annotation is silently ignored.