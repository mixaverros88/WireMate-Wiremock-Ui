## Constructor formatting (Java / Spring Boot)

When a constructor (or any method signature) has multiple parameters that don't fit comfortably on one line, format it with **one parameter per line**, each indented once, with the closing parenthesis on its own line aligned with the opening brace:

```java
// ✅ Correct
public StrategyController(
    SymbolStrategyService strategies,
    StrategyRegistry registry,
    StrategyDefaultsService defaults
) {
    this.strategies = strategies;
    this.registry = registry;
    this.defaults = defaults;
}

// ❌ Wrong — do not use continuation-aligned wrapping
public StrategyController(SymbolStrategyService strategies, StrategyRegistry registry,
                          StrategyDefaultsService defaults) {
    this.strategies = strategies;
    this.registry = registry;
    this.defaults = defaults;
}
```

Rules:
- Never align wrapped parameters under the opening parenthesis
- If all parameters fit on a single line within the line-length limit, a single line is acceptable
- Apply the same style to long method signatures, record declarations, and builder-style method calls with many arguments