// =============================================================
//  Runtime configuration — loaded by index.html BEFORE the app
//  bundle so it can override endpoint URLs without a rebuild.
//
//  This default ships an EMPTY config: every key is left unset,
//  so the app falls through to its build-time `VITE_*` env vars
//  (see .env) and finally to the localhost defaults in
//  `src/config.ts`. That keeps `npm run dev` and the production
//  image working out of the box.
//
//  To point a built image at a different environment, mount a
//  replacement config.js over this one (e.g. in docker-compose):
//
//    services:
//      ui:
//        volumes:
//          - ./config.js:/usr/share/nginx/html/config.js:ro
//
//  ...with the relevant keys filled in, for example:
//
//    window.__APP_CONFIG__ = {
//      WIREMOCK_ADMIN_URL: 'https://wiremock.example.com/__admin',
//      API_BASE_URL: 'https://wiremate-api.example.com',
//    }
// =============================================================
window.__APP_CONFIG__ = {}
