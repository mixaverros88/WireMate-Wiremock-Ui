## Caching (Spring Boot)

When a Spring Boot project requires in-memory caching, always use **Ehcache** (via JCache/JSR-107). Do not use Caffeine, Guava, ConcurrentHashMap-based custom caches, or Spring's default simple cache.

- Add dependencies: `org.springframework.boot:spring-boot-starter-cache`, `org.ehcache:ehcache` (jakarta classifier for Spring Boot 3+), and `javax.cache:cache-api`
- Enable caching with `@EnableCaching` on a configuration class
- Configure caches declaratively in `ehcache.xml` under `src/main/resources`, and register it in `application.yml` via `spring.cache.jcache.config: classpath:ehcache.xml`
- Define explicit cache names, heap entry limits, and TTL (`expiry`) for every cache — never leave caches unbounded
- Use Spring's cache abstraction (`@Cacheable`, `@CachePut`, `@CacheEvict`) rather than calling the Ehcache API directly, unless low-level access is genuinely required
- For distributed caching needs (multi-pod on Kubernetes), flag it and discuss alternatives (e.g. Redis) instead of assuming Ehcache is sufficient