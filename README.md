<p align="center">
  <img src="docs/logo.svg" alt="WireMate – WireMock UI" width="380">
</p>

<h1 align="center">WireMate — Web UI for WireMock</h1>

<p align="center">
  <strong>A web UI, dashboard, and management GUI for <a href="https://wiremock.org/">WireMock</a>.</strong><br>
  Design, persist, and publish WireMock stubs from a clean UI. No hand-crafted JSON required.
</p>

<p align="center">
  <a href="https://github.com/mixaverros88/WireMate">Source on GitHub</a> ·
  <a href="https://github.com/mixaverros88/WireMate/releases">Releases</a>
</p>

<p align="center">
  <img alt="Java" src="https://img.shields.io/badge/Java-25-007396?logo=openjdk&logoColor=white">
  <img alt="Spring Boot" src="https://img.shields.io/badge/Spring%20Boot-4.1.1-6DB33F?logo=springboot&logoColor=white">
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3.5-42B883?logo=vue.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white">
  <img alt="WireMock" src="https://img.shields.io/badge/WireMock-3.13.2-FF6B35">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white">
</p>

<p align="center">
  <img src="docs/demo.gif" alt="WireMate walkthrough" width="780">
</p>

## What is WireMate?

WireMate is the web UI and admin dashboard that teams keep wishing WireMock shipped with: a GUI, a persistence layer, and a management API on top of your WireMock mock server. Instead of editing JSON stub files by hand, engineers and QA testers work inside a single web app where every mock has a name and a description, while a Spring Boot backend stores every stub in PostgreSQL and keeps the running WireMock server in sync.

Every stub is persisted to PostgreSQL and grouped into **projects**, so a "Payment Gateway" mock set and an "Order Service" mock set never collide. From the same dashboard, you can **browse live WireMock stubs** and **search the logs** with analytics charts.

The goal is simple: give WireMock a GUI that the whole team can use to manage a mock server and spin up reliable test environments in seconds.

### Who it's for

- **Backend engineers** who want to stop maintaining stub JSON in a shared Postman collection.
- **QA and integration testers** who need to fake downstream services on demand.

### What makes it different

- **Everything is persisted.** Unlike a bare WireMock server.
- **Projects, not folders.** Organise stubs the way you think about them by service, by feature, by team.
- **Sync awareness.** A background task continuously diffs your database against the live WireMock server and surfaces drift in the notifications panel.
- **One place for everything.** Mocks, active stubs, logs, near misses, and server health all live in the same UI.

## Features

- **Visual Mock Builder** — Create request/response mappings through an intuitive form: methods, URLs, headers, JSON bodies, delays, and descriptions.
- **Project Management** — Organise mocks into projects with search and filtering across your entire workspace.
- **WireMock Stubs Viewer** — Browse all active stub mappings on your WireMock server. Filter by method, search by URL, and preview responses in real time.
- **Logs with Analytics** — Inspect every request WireMock receives (matched and unmatched) with live charts for method distribution, status codes, and request volume over time.
- **State Control** — Monitor server health and perform admin operations from a single dashboard.
- **Clone & Move** — Duplicate any mock in one click, or transfer mocks between projects as your needs evolve.
- **Postman Import / JSON Export** — Bring existing collections in and export any project for versioning or sharing.
- **Sync Delta Notifications** — A background task detects differences between the database and WireMock and surfaces them in-app.
- **One-Click Publish** — Push stubs directly to any WireMock server. Go from draft to live mock in seconds.
- **Dark & Light Theme** — Switch between dark and light modes; every view adapts seamlessly.
- **Persistent Storage** — All mappings are persisted to PostgreSQL. Never lose a stub.
- **Docker-Ready** — Spin up the entire stack with Docker Compose in one command.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/projects.png" alt="Projects list"><br><sub><b>Projects</b> — everything is scoped to a project you own.</sub></td>
    <td width="50%"><img src="docs/screenshots/project-detail.png" alt="Project detail"><br><sub><b>Project detail</b> — all mocks in one place, with per-mock logs, clone, and move.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/mock-editor.png" alt="Mock editor"><br><sub><b>Mock editor</b> — guided form for request matching, response, headers, and delays.</sub></td>
    <td><img src="docs/screenshots/stubs.png" alt="WireMock Stubs Viewer"><br><sub><b>Stubs viewer</b> — live mirror of what's actually running on the WireMock server.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/logs.png" alt="Logs with analytics"><br><sub><b>Logs</b> — matched vs unmatched, method + status breakdowns, volume over time.</sub></td>
    <td><img src="docs/screenshots/settings.png" alt="State control and settings"><br><sub><b>State control</b> — server health, reset, and admin operations.</sub></td>
  </tr>
</table>

## How It Works

1. **Create a project** — Group your stubs by project. Stay organised from day one.
2. **Build your stubs** — Use the UI to define requests, responses, delays, and headers.
3. **Publish to WireMock** — Publish instantly. All stubs are persisted in the database.
4. **Monitor & debug** — Search through the logs to inspect incoming requests and debug your stubs.

## Tech Stack

**Backend** — Java 25, Spring Boot 4.1.1, Spring Data JPA, PostgreSQL 17, Maven

**Frontend** — Vue 3.5, TypeScript 6.0, Vite 8, Tailwind CSS 4

**Infrastructure** — Docker & Docker Compose, Nginx, WireMock 3.13.2

## Getting Started

### Prerequisites

- Docker

### Run with Docker Compose

The compose file pulls the backend and UI images, so you don't need to build anything locally.

```bash
git clone https://github.com/mixaverros88/WireMate.git
cd WireMate
docker compose up -d
```

### This starts

**UI** at http://localhost:9002/

**WireMate** at http://localhost:9001/ (a JVM debug agent listens on port 8002 — disable by adding `JAVA_TOOL_OPTIONS: ""` to the backend's `environment` block in `docker-compose.yml`)

**WireMock** at http://localhost:9000/

**PostgreSQL** at localhost:5432

### Configuration (`.env`)

Most knobs of the compose stack live in the repo-root `.env` (a matching `.env.example` is provided). A few values are fixed in `docker-compose.yml` itself — the backend's internal `SERVER_PORT`, the debug-port mapping, and the WireMock URL as seen from inside the Docker network:

| Variable | Default | Description |
|---|---|---|
| `DATA_PATH` | `${HOME:-${USERPROFILE}}/docker_volumes/wiremate` | Host path for the data volumes |
| `POSTGRES_IMAGE` | `postgres:17-alpine` | PostgreSQL image |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `postgres` / `5432` / `wiremate` / `wiremate` / `wiremate` | Database connection |
| `WIREMOCK_IMAGE` | `wiremock/wiremock:3.13.2` | WireMock image |
| `WIREMOCK_PORT` | `9000` | Host port for WireMock (container 8080) |
| `BACKEND_IMAGE` | `ghcr.io/mixaverros88/wiremate-service:latest` | Backend image |
| `BACKEND_PORT` | `9001` | Host port for the backend API (container 8081) |
| `UI_IMAGE` | `ghcr.io/mixaverros88/wiremate-ui:latest` | UI image |
| `UI_PORT` | `9002` | Host port for the UI (container 80) |
| `UI_WIREMOCK_URL` | `http://localhost:9000/__admin` | WireMock admin URL injected into the UI's runtime config |
| `UI_WIREMATE_BASE_URL` | `http://localhost:9001` | Backend URL injected into the UI's runtime config |
| `APP_WIREMOCK_BASE_URL` | `http://wiremock:8080` | WireMock URL as seen from the backend container (internal port; note: compose hard-codes this value, the `.env` entry is informational) |
| `APP_WIREMOCK_MAIN_PATH` / `APP_CROSS_CHECK_INTERVAL` / `APP_CROSS_CHECK_ENABLED` / `APP_CORS_ORIGINS` | `/__admin/mappings` / `10000` / `true` / `http://localhost:9002` | Backend app settings (see the service README for the full list) |

## Project Structure

```
WireMate/
├── service/                              # Spring Boot backend
├── UI/                                   # Vue 3 frontend
├── .github/workflows/                    # CI / CD (docker-publish.yml)
├── docs/                                 # Logo, demo GIF, screenshots, GitHub Pages site
├── docker-compose.yml
├── config.js.template                    # UI runtime config, env-substituted into the Nginx container
├── .env                                  # Compose configuration (ports, images, app settings)
├── .env.example                          # Template for .env
├── CHANGELOG.md
└── LICENSE
```

## License

This project is licensed under the [MIT License](LICENSE).

## Upcoming features

- **Scenarios**
- **Traffic Recording**
- **Response Transformers**
