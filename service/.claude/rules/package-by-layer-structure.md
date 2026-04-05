# Rule: Spring Boot Project Must Follow Package-by-Layer Structure

## Guideline

All Spring Boot components must be placed in their designated layer folder.
Never scatter components arbitrarily or create ad-hoc packages.

## Required folder structure

```
src/main/java/com/example/project/
│
├── config/                         ← all configuration classes
│   ├── SecurityConfig.java
│   ├── SwaggerConfig.java
│   └── CacheConfig.java
│
├── controller/                     ← all REST controllers
│   ├── ProjectController.java
│   └── UserController.java
│
├── dto/                            ← all request and response records
│   ├── ProjectRequest.java
│   ├── ProjectResponse.java
│   ├── UserRequest.java
│   └── UserResponse.java
│
├── entity/                         ← all JPA entities and base classes
│   ├── Project.java
│   ├── User.java
│   └── BaseEntity.java
│
├── exception/                      ← all custom exceptions and handlers
│   ├── ProjectNotFoundException.java
│   ├── UserNotFoundException.java
│   └── GlobalExceptionHandler.java
│
├── repository/                     ← all Spring Data repositories
│   ├── ProjectRepository.java
│   └── UserRepository.java
│
├── service/                        ← all service classes and interfaces
│   ├── ProjectService.java
│   └── UserService.java
│
└── gateway/                        ← all third-party API integrations
    ├── SalesforceGateway.java
    ├── StripeGateway.java
    └── SendGridGateway.java
```

## Rules per layer

### `config/`
- Classes annotated with `@Configuration`, `@EnableWebSecurity`, `@EnableCaching`, etc.
- Bean definitions (`@Bean`) that don't belong to a specific feature class

### `controller/`
- Classes annotated with `@RestController`
- No business logic — delegates everything to the service layer

### `dto/`
- Java records only (see rule: dto-must-be-record)
- Named with `*Request` or `*Response` suffix
- No JPA annotations, no entity references

### `entity/`
- Classes annotated with `@Entity`
- May include `@MappedSuperclass` base classes (e.g. `BaseEntity`)
- No DTO references, no controller logic

### `exception/`
- Custom exception classes extending `RuntimeException`
- `@RestControllerAdvice` / `@ControllerAdvice` global handler class

### `repository/`
- Interfaces extending `JpaRepository`, `CrudRepository`, or `PagingAndSortingRepository`
- Custom `@Query` methods defined here, not in the service

### `service/`
- Classes annotated with `@Service`
- All business logic lives here
- Read methods annotated with `@Transactional(readOnly = true)` (see rule: transactional-readonly-fetch)
- Must not call third-party APIs directly — delegate to `gateway/`

### `gateway/`
- Classes annotated with `@Component` or `@Service`
- Each class wraps calls to a **single** external system — one gateway per third party
- Responsible for HTTP client setup, request building, response mapping, and error handling for that external API
- No business logic — only translation between internal models and external API contracts
- Examples: REST clients (`RestTemplate`, `WebClient`, `FeignClient`), SDK wrappers (Stripe, Twilio, SendGrid), SOAP clients
- Naming convention: `<ThirdPartyName>Gateway` (e.g. `SalesforceGateway`, `StripeGateway`)

```java
// ✅ Correct
@Component
public class StripeGateway {

    private final StripeClient stripeClient;

    public PaymentResult charge(ChargeRequest request) {
        // all Stripe-specific logic stays here
    }
}

// ❌ Avoid — third-party call leaking into service
@Service
public class PaymentService {

    public void processPayment(Order order) {
        Stripe.apiKey = "...";
        PaymentIntent.create(...); // Stripe logic should be in gateway
    }
}
```

## Rationale

- Immediately clear where any component lives regardless of who wrote it
- Consistent with the traditional Spring Boot project layout most developers expect
- Easy onboarding — new team members know exactly where to look
