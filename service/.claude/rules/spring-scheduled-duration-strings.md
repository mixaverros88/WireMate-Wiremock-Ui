# Rule: @Scheduled Duration Properties Need No SpEL Wrapper

## Guideline

Since Spring 5.3, `fixedDelayString`, `fixedRateString`, and
`initialDelayString` parse duration strings natively. Bind the property
placeholder directly — never wrap it in a SpEL expression that converts the
duration to millis:

```java
// ✅ Correct — placeholder resolves, Spring parses the duration itself
@Scheduled(
        initialDelayString = "${app.cross-check.interval}",
        fixedDelayString = "${app.cross-check.interval}"
)

// ❌ Avoid — redundant SpEL wrapper. Delete it if you find it.
@Scheduled(
        initialDelayString = "#{T(java.time.Duration).parse('${app.cross-check.interval}').toMillis()}",
        fixedDelayString = "#{T(java.time.Duration).parse('${app.cross-check.interval}').toMillis()}"
)
```

## How parsing works

`ScheduledAnnotationBeanPostProcessor` first tries the resolved string as a
plain long (millis), and on failure falls back to `DurationFormatterUtils`,
which detects both:

- ISO-8601 style — `PT10S`, `PT1M30S`
- Simple style — `10s`, `500ms`, `2m`

So `app.cross-check.interval=PT10S` and `=10s` both work with a bare
placeholder.

## Rules

- Do NOT use `#{T(java.time.Duration).parse('${...}').toMillis()}` or any
  equivalent SpEL conversion in `@Scheduled` string attributes.
- Prefer duration-style property values (`10s`, `PT10S`) over raw millis —
  they are self-documenting.
- The same applies to `@ConfigurationProperties` fields typed as
  `java.time.Duration` — Spring Boot converts duration strings automatically.

## Rationale

- Less noise — the SpEL wrapper triples the line length for zero benefit
- Fewer failure modes — no SpEL evaluation, no quoting mistakes
- The bare placeholder supports both duration formats *and* raw millis
