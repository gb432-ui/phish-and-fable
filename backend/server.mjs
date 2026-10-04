backend/server.mjs
import { createServer } from "node:http";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const MAX_BODY_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const allowedKinds = new Set(["email", "message", "call"]);
const allowedTopics = [
  "phishing",
  "suspicious links",
  "passwords",
  "mfa",
  "social engineering",
  "malware",
  "privacy",
  "smishing",
  "safe file sharing",
  "voice phishing",
];

const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(request) {
  const requestOrigin = request.headers.origin;
  const allowsEveryOrigin = configuredOrigins.includes("*");
  const allowedOrigin =
    allowsEveryOrigin || !requestOrigin
      ? "*"
      : configuredOrigins.includes(requestOrigin)
        ? requestOrigin
        : null;

  if (!allowedOrigin) return null;

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function isShortString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isValidRequest(value) {
  if (!value || typeof value !== "object") return false;
  const kind = String(value.kind ?? "");
  const location = String(value.location ?? "");
  const topic = String(value.topic ?? "");

  return (
    allowedKinds.has(kind) &&
    isShortString(location, 80) &&
    isShortString(topic, 80) &&
    allowedTopics.some((allowed) => topic.toLowerCase().includes(allowed))
  );
}

function isGeminiChallenge(value) {
  if (!value || typeof value !== "object") return false;

  if (
    !isShortString(value.scenario, 360) ||
    !isShortString(value.question, 100) ||
    !isShortString(value.sender, 100) ||
    !isShortString(value.subject, 120) ||
    !isShortString(value.message, 420) ||
    !isShortString(value.explanation, 300) ||
    !isShortString(value.consequence, 220) ||
    !["safe", "phishing"].includes(String(value.correctAnswer))
  ) {
    return false;
  }

  if (!Array.isArray(value.choices) || value.choices.length !== 2) return false;

  const choices = value.choices.map((choice) => {
    if (!choice || typeof choice !== "object" || !isShortString(choice.label, 40)) {
      return "";
    }
    return String(choice.id);
  });

  return choices.includes("safe") && choices.includes("phishing");
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON request body");
    error.status = 400;
    throw error;
  }
}

function createPrompt({ kind, location, topic }) {
  return `Create ONE easy, beginner-friendly cybersecurity challenge for a two-choice educational game.

The game is an enchanted forest journey. This chapter is called "${location}" and the challenge appears as a ${kind}. The lesson topic is ${topic}.

Return only valid JSON with this exact shape:
{
  "scenario": "A short enchanted-forest story setup, no more than 2 sentences.",
  "question": "A simple question asking whether the communication is safe or a phishing trap.",
  "sender": "A realistic short sender or caller name.",
  "subject": "An email subject, message time, or caller number appropriate for the ${kind}.",
  "message": "The communication the player must judge, no more than 3 short sentences.",
  "choices": [
    { "id": "safe", "label": "Safe passage" },
    { "id": "phishing", "label": "Phishing trap" }
  ],
  "correctAnswer": "safe or phishing",
  "explanation": "A short plain-language explanation of the clue.",
  "consequence": "One short story sentence describing what happens after the choice."
}

Requirements:
- Make the answer clear from beginner-level clues.
- Do not require prior cybersecurity knowledge.
- Use only the two specified choices.
- Mix legitimate and dangerous communications across repeated requests.
- Never include a real company, real phone number, real active URL, personal data, or instructions that enable cyber abuse.
- Keep every field concise enough for a small game card.`;
}

async function generateChallenge(input, apiKey) {
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: createPrompt(input) }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 900,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!geminiResponse.ok) {
    const details = await geminiResponse.text();
    console.error("Gemini API error", geminiResponse.status, details.slice(0, 500));
    const error = new Error("Unable to generate a challenge");
    error.status = 502;
    throw error;
  }

  const payload = await geminiResponse.json();
  const responseText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof responseText !== "string") {
    const error = new Error("Gemini returned an empty challenge");
    error.status = 502;
    throw error;
  }

  let challenge;
  try {
    challenge = JSON.parse(responseText);
  } catch {
    const error = new Error("Gemini returned malformed challenge data");
    error.status = 502;
    throw error;
  }

  if (!isGeminiChallenge(challenge)) {
    const error = new Error("Gemini returned invalid challenge data");
    error.status = 502;
    throw error;
  }

  return {
    kind: input.kind,
    location: input.location.trim(),
    title: challenge.question.trim(),
    sender: challenge.sender.trim(),
    subject: challenge.subject.trim(),
    message: challenge.message.trim(),
    phishing: challenge.correctAnswer === "phishing",
    lesson: `${challenge.explanation.trim()} ${challenge.consequence.trim()}`,
    story: challenge.scenario.trim(),
  };
}

const server = createServer(async (request, response) => {
  const cors = corsHeaders(request);
  if (!cors) {
    sendJson(response, 403, { error: "Origin is not allowed" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, cors);
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, { status: "ok" }, cors);
    return;
  }

  if (request.method !== "POST" || requestUrl.pathname !== "/generate-challenge") {
    sendJson(response, 404, { error: "Not found" }, cors);
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not configured");
    sendJson(response, 503, { error: "Challenge generation is not configured" }, cors);
    return;
  }

  try {
    const input = await readJsonBody(request);
    if (!isValidRequest(input)) {
      sendJson(response, 400, { error: "Invalid challenge parameters" }, cors);
      return;
    }

    const challenge = await generateChallenge(input, apiKey);
    sendJson(response, 200, challenge, cors);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status === 500) console.error("Challenge generation failed", error);
    sendJson(response, status, { error: error?.message ?? "Unable to generate a challenge" }, cors);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Gemini challenge backend listening on port ${PORT}`);
});
backend/package.json
{
  "name": "phish-and-fable-backend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "start": "node server.mjs",
    "start:env": "node --env-file=.env server.mjs",
    "check": "node --check server.mjs"
  }
}
backend/env.example
GEMINI_API_KEY=replace-with-your-server-side-key
PORT=8787
ALLOWED_ORIGINS=*
GEMINI_MODEL=gemini-2.5-flash
backend/Dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package.json server.mjs ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.mjs"]
backend/README.md
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


