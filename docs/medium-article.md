# I Got Tired of Hand-Writing WireMock JSON, So I Built a UI for It

*Meet WireMate: an open-source web UI, persistence layer, and dashboard for WireMock.*

---

If you've ever worked on a backend team that depends on third-party APIs, you know the drill. The payment gateway sandbox is down again. The partner API has a rate limit that makes integration testing miserable. QA needs a downstream service to return a 500, just once, just for this test, and nobody wants to touch the real thing.

So you reach for [WireMock](https://wiremock.org/). And WireMock is great. It's the de facto standard for mocking HTTP APIs on the JVM and beyond, it's battle-tested, and its matching engine can simulate almost anything.

But here's the thing nobody tells you: **WireMock has no UI.**

Every stub is a JSON file. Every change means editing JSON by hand, POSTing it to an admin endpoint with curl, and hoping you didn't typo a field name. Stubs live in a `mappings/` folder somewhere, or worse: in a shared Postman collection that three people edit and nobody versions. When the server restarts, non-persistent stubs vanish. When QA asks "what mocks are currently active?", the honest answer is usually a shrug.

I lived with this long enough. Then I built [WireMate](https://mixaverros88.github.io/WireMate/).

## What is WireMate?

WireMate is the web UI and admin dashboard that teams keep wishing WireMock shipped with. It sits on top of your WireMock server and gives you three things:

1. **A GUI.** Build request/response stubs through a guided form instead of raw JSON.
2. **A persistence layer.** Every stub is stored in PostgreSQL, organized into projects.
3. **A management dashboard.** Live stubs, request logs with analytics, server health, all in one place.

The workflow is simple: create a project, build your stubs in the UI, hit publish. WireMate persists the mapping to the database and pushes it to the running WireMock server in one step. Your mocks survive restarts, live in one place, and every one of them has a name and a description a human can actually read.

## The problems it solves

### 1. No more hand-crafted JSON

WireMock mappings look like this:

```json
{
  "request": {
    "method": "POST",
    "url": "/interaction/v1/events"
  },
  "response": {
    "status": 201,
    "jsonBody": {},
    "headers": {
      "Content-Type": "application/json"
    },
    "delayDistribution": {
      "type": "uniform",
      "lower": 60,
      "upper": 80
    }
  },
  "persistent": true
}
```

That's a simple one. Real stubs pile on header matchers, body patterns, fault simulation, delays, webhooks. In WireMate, all of that is a form: pick a method, type a URL, fill in headers and a JSON body, set a delay distribution with two number inputs. The JSON is generated for you, correctly, every time.

The mock editor covers a lot more than the basics, too. Cookies, basic auth, custom matchers, chunked dribble delays, fault simulation, proxying, and post-serve webhooks are all first-class sections in the form.

### 2. Stubs that don't disappear

A bare WireMock server treats stubs as ephemeral unless you carefully manage mapping files. WireMate treats the database as the source of truth. Every stub is persisted to PostgreSQL and grouped into **projects**, so your "Payment Gateway" mock set and your "Order Service" mock set never collide. You can clone a mock in one click, or move it to another project as your test suites evolve.

### 3. Knowing what's actually running

This is my favorite part. WireMate runs a background sync task that continuously diffs the database against the live WireMock server. If someone POSTs a stub directly to WireMock, or a stub in the database isn't live on the server, the drift shows up in the notifications panel. No more guessing whether the mock server matches what you think you deployed.

### 4. Debugging unmatched requests

WireMock's request journal is powerful but raw. WireMate wraps it in a searchable log view with live charts for method distribution, status codes, and request volume over time, plus a dedicated **Near Misses** view that shows you the closest matching stubs for any unmatched request. When a test fails because a request didn't match, you can see exactly *why* in seconds instead of diffing JSON in your head.

### 5. Meeting your existing collections where they are

Already have everything in Postman? WireMate imports Postman v2.x collections and turns each request into a mock in the selected project. Going the other way, any project exports to JSON for versioning or sharing.

## Under the hood

For the curious, the stack is deliberately boring, in the good way:

- **Backend:** Java 25, Spring Boot 4.1, Spring Data JPA, PostgreSQL 17
- **Frontend:** Vue 3.5 with the Composition API, TypeScript, Vite, Tailwind CSS 4, Chart.js for the analytics
- **Infrastructure:** Docker Compose, Nginx serving the production UI, WireMock 3.13

The backend exposes a clean REST API and talks to WireMock through its admin API. The UI talks to both: the WireMate backend for persistence and project management, and WireMock's admin API directly for live data like the request journal and active stubs.

Dark and light themes are both first-class, because a mocking dashboard is the kind of tool you end up staring at all day.

## Try it in two minutes

The whole stack runs with Docker Compose. The compose file pulls prebuilt images, so there's nothing to build locally:

```bash
git clone https://github.com/mixaverros88/WireMate.git
cd WireMate
docker compose up -d
```

That gives you:

- **UI** at http://localhost:9002
- **WireMate API** at http://localhost:9001
- **WireMock** at http://localhost:9000
- **PostgreSQL** at http://localhost:5432

## What's next

WireMate is MIT-licensed and under active development. On the roadmap:

- **Scenarios**: WireMock's stateful behavior, managed from the UI
- **Traffic recording**: capture real traffic and turn it into stubs
- **Response transformers**: dynamic responses without leaving the dashboard

## Wrapping up

WireMock deserved a UI, and now it has one. If your team fakes downstream services for development or testing (and whose doesn't?), give WireMate a spin:

**🌐 Website: [mixaverros88.github.io/WireMate](https://mixaverros88.github.io/WireMate/)**

**⭐ GitHub: [github.com/mixaverros88/WireMate](https://github.com/mixaverros88/WireMate)**

Issues, feature requests, and PRs are all welcome. And if WireMate saves you from hand-editing one more mapping file, consider leaving a star. It helps other people find it.

---

*Thanks for reading! If you enjoyed this, follow me for more posts on backend development and developer tooling.*

https://medium.com/@mixalisgiwrgosverros/i-got-tired-of-hand-writing-wiremock-json-so-i-built-a-ui-for-it-651962201c41