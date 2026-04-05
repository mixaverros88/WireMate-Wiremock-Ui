# Rule: DTOs Must Be Java Records

## Guideline

Every DTO (Data Transfer Object) — including request, response, and internal transfer objects — must be defined as a **Java record**, not a class.

```java
// ✅ Preferred
public record ProjectRequest(
    String name,
    String description,
    LocalDate deadline
) {}

public record ProjectResponse(
    Long id,
    String name,
    String description,
    LocalDate deadline
) {}

// ❌ Avoid
public class ProjectRequest {
    private String name;
    private String description;
    private LocalDate deadline;

    // getters, setters, constructors, equals, hashCode, toString...
}
```

## Naming conventions that imply a record

Any class whose name ends in the following suffixes must be a record:

- `*Request`
- `*Response`
- `*Dto` / `*DTO`
- `*Payload`
- `*Body`

## Validation

If the DTO needs Bean Validation, annotate the record components directly:

```java
public record ProjectRequest(
    @NotBlank String name,
    @Size(max = 500) String description,
    @Future LocalDate deadline
) {}
```

## Jackson / serialization

Records serialize and deserialize correctly with Jackson out of the box (Spring Boot 2.5+).
No extra annotations needed for standard cases.
If a custom field name is required, use `@JsonProperty` on the component:

```java
public record ProjectResponse(
    Long id,
    @JsonProperty("project_name") String name
) {}
```

## Rationale

- Eliminates boilerplate — no need for Lombok `@Data`, `@Builder`, or manual getters/setters
- Immutable by default — DTOs should never be mutated after construction
- `equals`, `hashCode`, and `toString` are auto-generated and correct
- Makes intent explicit — a record signals "this is pure data, not a domain object"
