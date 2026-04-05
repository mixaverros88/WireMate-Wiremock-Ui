---
paths:
  - "**/*.java"
---

# final on parameters

Declare method parameters `final`:

```java
public void delete(final Long notificationId) { ... }
```

Applies to all methods — public, private, and catch parameters.

Do NOT add `final` to a parameter that is genuinely reassigned; restructure
instead.