## Spring pagination

Never hand-clamp `Pageable` page sizes in controllers. Spring Boot's
`PageableHandlerMethodArgumentResolver` already does it via config:

```yaml
spring:
  data:
    web:
      pageable:
        default-page-size: 100
        max-page-size: 500
```

Rules:
- Do NOT write `pageable.getPageSize() > MAX ? PageRequest.of(...) : pageable`
  or any equivalent guard. Delete it if you find it.
- Do NOT declare `MAX_PAGE_SIZE` / `DEFAULT_PAGE_SIZE` constants for this purpose.
- Do NOT use `@PageableDefault(size = ...)` — an explicit `size` on the
  annotation overrides the global property for that endpoint. Use
  `@SortDefault("createdAt")` when only a sort default is needed.
- Exception: if the endpoint must reject an oversized `size` with 400 rather
  than silently truncating, keep an explicit check and add a comment saying why
  (the property clamps silently and always returns 200).