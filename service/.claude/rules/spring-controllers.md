## Spring Controllers

- Never null-check `@RequestBody` parameters. `@RequestBody` is `required = true`
  by default, so Spring rejects missing/empty bodies with
  `HttpMessageNotReadableException` and `@Valid` failures with
  `MethodArgumentNotValidException` — both before the handler method runs.
  A `body == null` check inside the method is unreachable dead code.
- Instead, ensure `GlobalExceptionHandler` maps `HttpMessageNotReadableException`
  and `MethodArgumentNotValidException` to the same 400 error response shape
  used for `IllegalArgumentException`, so all bad-request paths return a
  consistent format.