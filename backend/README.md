# Phish & Fable Gemini backend

Standalone Node.js backend for generating one beginner-friendly cybersecurity challenge at a time.

## API

### `POST /generate-challenge`

Request:

```json
{
  "kind": "email",
  "location": "The Whispering Grove",
  "topic": "phishing and suspicious links"
}
```

Successful response:

```json
{
  "kind": "email",
  "location": "The Whispering Grove",
  "title": "Is this message safe or a phishing trap?",
  "sender": "Forest Help Desk",
  "subject": "Urgent account warning",
  "message": "Your account will close unless you use this unfamiliar link.",
  "phishing": true,
  "lesson": "The urgent threat and unfamiliar link are phishing clues. The fairy seals the false path.",
  "story": "A glowing envelope appears beneath the whispering trees."
}
```

Any non-2xx response causes the existing frontend to retain its fallback challenges.

### `GET /health`

Returns:

```json
{ "status": "ok" }
```

## Environment variables

- `GEMINI_API_KEY` — required; server-side only.
- `PORT` — optional; defaults to `8787`.
- `ALLOWED_ORIGINS` — optional comma-separated origins; defaults to `*` for compatibility with Figma Make preview domains.
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`.

Never expose `GEMINI_API_KEY` through a `VITE_` variable or commit it to the repository.

## Run locally

Requires Node.js 20 or newer. There are no package dependencies to install.

```bash
cd backend
cp env.example .env
# Edit .env and set GEMINI_API_KEY.
npm run start:env
```

The server starts at `http://localhost:8787`.

Test it:

```bash
curl http://localhost:8787/health

curl -X POST http://localhost:8787/generate-challenge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer temporary-frontend-value" \
  -H "apikey: temporary-frontend-value" \
  --data '{
    "kind": "email",
    "location": "The Whispering Grove",
    "topic": "phishing and suspicious links"
  }'
```

## Deploy with Docker

Build:

```bash
docker build -t phish-and-fable-backend ./backend
```

Run:

```bash
docker run --rm -p 8787:8080 \
  -e GEMINI_API_KEY="your-key" \
  -e ALLOWED_ORIGINS="*" \
  phish-and-fable-backend
```

Deploy this image to Cloud Run, Railway, Render, Fly.io, or another container host. Configure `GEMINI_API_KEY` in that platform's secret/environment settings.

For production, set `ALLOWED_ORIGINS` to the exact deployed frontend origin. Multiple origins are comma-separated:

```text
https://your-site.example,https://your-preview.example
```

## Render deployment

1. Create a new **Web Service** from this repository.
2. Set **Root Directory** to `backend`.
3. Set **Runtime** to Node.
4. Leave the build command empty; there are no dependencies.
5. Set the start command to `npm start`.
6. Add `GEMINI_API_KEY` under the service's environment variables.
7. Optionally set `ALLOWED_ORIGINS` to `*` for the demo, then restrict it after determining the final frontend URL.

The public endpoint will be:

```text
https://YOUR-SERVICE.example/generate-challenge
```

Only that URL eventually needs to replace the current Supabase endpoint in the frontend.
