import { createServer } from "node:http";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const MAX_BODY_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_GEMINI_ATTEMPTS = 1;
const MAX_CONTENT_ATTEMPTS = 1;

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

let answerTargets = [];

function createAnswerCycle() {
  const safeCount = Math.random() < 0.5 ? 2 : 3;
  const cycle = [
    ...Array.from({ length: safeCount }, () => "safe"),
    ...Array.from({ length: 5 - safeCount }, () => "phishing"),
  ];

  for (let index = cycle.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [cycle[index], cycle[randomIndex]] = [cycle[randomIndex], cycle[index]];
  }

  return cycle;
}

function reserveAnswerTarget() {
  if (answerTargets.length === 0) {
    answerTargets = createAnswerCycle();
  }
  return answerTargets.shift();
}

function restoreAnswerTarget(targetAnswer) {
  answerTargets.unshift(targetAnswer);
}

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

function isGeneratedString(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2_000;
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
    !isGeneratedString(value.scenario) ||
    !isGeneratedString(value.question) ||
    !isGeneratedString(value.sender) ||
    !isGeneratedString(value.subject) ||
    !isGeneratedString(value.message) ||
    !isGeneratedString(value.explanation) ||
    !isGeneratedString(value.consequence) ||
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

function createPrompt({ kind, location, topic }, targetAnswer) {
  return `Create ONE easy, beginner-friendly cybersecurity challenge for a two-choice educational game.

The game is an enchanted forest journey. This chapter is called "${location}" and the challenge appears as a ${kind}. The lesson topic is ${topic}.
The required correct answer for this challenge is "${targetAnswer}".

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
  "correctAnswer": "${targetAnswer}",
  "explanation": "A short plain-language explanation of the clue.",
  "consequence": "One short story sentence describing what happens after the choice."
}

Requirements:
- Make the answer clear from beginner-level clues.
- Do not require prior cybersecurity knowledge.
- Use only the two specified choices.
- Set correctAnswer to exactly "${targetAnswer}".
- Make every clue in the sender, subject, message, explanation, and consequence clearly support "${targetAnswer}" as the correct choice.
- Keep the choices exactly "safe" → "Safe passage" and "phishing" → "Phishing trap".
- Set correctAnswer to exactly "safe" or exactly "phishing". Never write "safe or phishing".
- Mix legitimate and dangerous communications across repeated requests.
- Never include a real company, real phone number, real active URL, personal data, or instructions that enable cyber abuse.
- Keep every field concise enough for a small game card.`;
}

async function generateChallenge(input, apiKey, targetAnswer, contentAttempt = 1) {
  let geminiResponse;

  for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt += 1) {
    try {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: createPrompt(input, targetAnswer) }] }],
            generationConfig: {
              maxOutputTokens: 900,
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                required: [
                  "scenario",
                  "question",
                  "sender",
                  "subject",
                  "message",
                  "choices",
                  "correctAnswer",
                  "explanation",
                  "consequence",
                ],
                properties: {
                  scenario: { type: "STRING" },
                  question: { type: "STRING" },
                  sender: { type: "STRING" },
                  subject: { type: "STRING" },
                  message: { type: "STRING" },
                  choices: {
                    type: "ARRAY",
                    minItems: 2,
                    maxItems: 2,
                    items: {
                      type: "OBJECT",
                      required: ["id", "label"],
                      properties: {
                        id: { type: "STRING", enum: ["safe", "phishing"] },
                        label: { type: "STRING" },
                      },
                    },
                  },
                  correctAnswer: {
                    type: "STRING",
                    enum: [targetAnswer],
                  },
                  explanation: { type: "STRING" },
                  consequence: { type: "STRING" },
                },
              },
            },
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        const timeoutError = new Error("Gemini request timed out");
        timeoutError.status = 503;
        throw timeoutError;
      }
      throw error;
    }

    const retryable = [429, 500, 503, 504].includes(geminiResponse.status);
    if (geminiResponse.ok || !retryable || attempt === MAX_GEMINI_ATTEMPTS) break;

    const retryAfter = Number.parseInt(geminiResponse.headers.get("retry-after") ?? "", 10);
    const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 1200;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (!geminiResponse?.ok) {
    const details = await geminiResponse.text();
    console.error("Gemini API error", geminiResponse.status, details.slice(0, 500));
    const error = new Error("Unable to generate a challenge");
    error.status = [429, 503, 504].includes(geminiResponse.status) ? 503 : 502;
    throw error;
  }

  const payload = await geminiResponse.json();
  const responseText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof responseText !== "string") {
    if (contentAttempt < MAX_CONTENT_ATTEMPTS) {
      return generateChallenge(input, apiKey, targetAnswer, contentAttempt + 1);
    }
    const error = new Error("Gemini returned an empty challenge");
    error.status = 502;
    throw error;
  }

  let challenge;
  try {
    const jsonText = responseText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    challenge = JSON.parse(jsonText);
  } catch {
    if (contentAttempt < MAX_CONTENT_ATTEMPTS) {
      return generateChallenge(input, apiKey, targetAnswer, contentAttempt + 1);
    }
    const error = new Error("Gemini returned malformed challenge data");
    error.status = 502;
    throw error;
  }

  if (!isGeminiChallenge(challenge) || challenge.correctAnswer !== targetAnswer) {
    if (contentAttempt < MAX_CONTENT_ATTEMPTS) {
      return generateChallenge(input, apiKey, targetAnswer, contentAttempt + 1);
    }
    const error = new Error("Gemini returned invalid challenge data");
    error.status = 502;
    throw error;
  }

  return {
    kind: input.kind,
    location: input.location.trim(),
    title: challenge.question.trim().slice(0, 100),
    sender: challenge.sender.trim().slice(0, 100),
    subject: challenge.subject.trim().slice(0, 120),
    message: challenge.message.trim().slice(0, 420),
    phishing: challenge.correctAnswer === "phishing",
    lesson: `${challenge.explanation.trim().slice(0, 300)} ${challenge.consequence.trim().slice(0, 220)}`,
    story: challenge.scenario.trim().slice(0, 360),
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

    const targetAnswer = reserveAnswerTarget();
    try {
      const challenge = await generateChallenge(input, apiKey, targetAnswer);
      sendJson(response, 200, challenge, cors);
    } catch (error) {
      restoreAnswerTarget(targetAnswer);
      throw error;
    }
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status === 500) console.error("Challenge generation failed", error);
    sendJson(response, status, { error: error?.message ?? "Unable to generate a challenge" }, cors);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Gemini challenge backend listening on port ${PORT}`);
});
