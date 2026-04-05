# Tests

Two layers, both run from the `UI/` directory (that's where `package.json` lives).

## Unit tests (Vitest)

```bash
npm test            # one-shot
npm run test:watch  # interactive
npm test -- --coverage   # with coverage report (HTML in coverage/)
```

Specs live next to the source they cover:

```
src/utils/cookies.ts
src/utils/cookies.spec.ts
```

Conventions:
- File name: `*.spec.ts` (never `.test.ts`). This is convention, not
  enforcement — `vitest.config.ts` would pick up `.test.ts` files too.
- One `describe` block per export under test; test names read as
  sentences ("emits cancel when Escape is pressed").
- Selector priority: `getByRole` → `aria-label` → `text` → `data-testid`.
  Never CSS classes, never `nth-child`.
- No snapshot tests, no framework-internals tests.
- Async paths use `flushPromises` / `await nextTick` — no arbitrary
  `setTimeout` sleeps.
- The shared `fetch` stub pattern is `vi.stubGlobal('fetch', vi.fn())`
  in `beforeEach`, `vi.unstubAllGlobals()` in `afterEach`. See
  `src/services/http.spec.ts` for the canonical example.

## E2E tests (Playwright)

```bash
npm run test:e2e
```

The Vite dev server is auto-started by `playwright.config.ts` (`webServer`
block). The Spring Boot + WireMock backends are NOT required — every
network call goes through `page.route()` mocks defined in
`tests/fixtures/routeMocks.ts`.

Layout:

```
tests/
  journeys/        # real user journeys — *.spec.ts files only
  poms/            # Page Object Models — imported by journeys
  fixtures/        # factories + route mocks
  smoke.spec.ts    # intentionally empty placeholder (see its header); excluded by testMatch
```

Conventions:
- Each journey is independent and idempotent — `test.beforeEach`
  registers its own route mocks; nothing leaks between tests.
- Selectors come from the POMs, never from the journey directly.
- No `page.waitForTimeout(...)` — use Playwright's built-in
  auto-waiting on `Locator` operations.
- One Page Object per page (`ProjectsPage`, `CreateProjectPage`, ...).
  POMs expose locators as readonly properties and high-level actions
  as methods.
- Backend mocking: add a factory to `fixtures/factories.ts` and a
  route helper to `fixtures/routeMocks.ts` — never inline
  `await route.fulfill(...)` in a journey.
