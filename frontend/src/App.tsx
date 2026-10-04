import { isValidElement, useEffect, useRef, useState, type ReactNode } from "react";

type Scenario = {
  kind: "email" | "message" | "call";
  location: string;
  title: string;
  sender: string;
  subject: string;
  message: ReactNode;
  phishing: boolean;
  lesson: string;
  story: string;
};

const fallbackScenarios: Scenario[] = [
  {
    kind: "email",
    location: "The Whispering Grove",
    title: "A message appears in the mist",
    sender: "IT Helpdesk <support@silverleaf-it.co>",
    subject: "Your enchanted mail will vanish tonight",
    message: (
      <>
        Your forest account has exceeded its magic limit. Verify your identity
        immediately at <span className="fake-link">silverleaf-login.co</span> or
        all messages will be lost before moonrise.
      </>
    ),
    phishing: true,
    lesson:
      "Urgent threats and a look-alike login domain are classic phishing signs. A real helpdesk would not ask you to verify through an unfamiliar link.",
    story:
      "The fairy leads you beneath branches that whisper old passwords to the wind. At the center of the grove, a pale envelope floats above a ring of mushrooms.",
  },
  {
    kind: "message",
    location: "Moonmoss Crossing",
    title: "A message lights up your pocket",
    sender: "Forest Parcel",
    subject: "Today, 10:42 AM",
    message: (
      <>
        Your parcel could not be delivered. Pay the 1.50 moonstone redelivery
        fee now at <span className="fake-link">forest-post.help/claim</span> to
        prevent it being returned.
      </>
    ),
    phishing: true,
    lesson:
      "This is smishing: phishing sent by text message. Unexpected delivery notices, small payment requests, and unfamiliar shortened domains are designed to steal card details.",
    story:
      "Moonmoss glows beneath your feet as you cross the silver stream. Halfway over the stones, your pocket begins to shine with an unexpected message.",
  },
  {
    kind: "email",
    location: "The Hollow of Echoes",
    title: "A golden letter glints nearby",
    sender: "Forest Rewards <prizes@acorn-winner.net>",
    subject: "You won 500 moonstones!",
    message: (
      <>
        Congratulations, traveler! Claim your prize in the next 10 minutes.
        Reply with your full name, birth date, and account password to release
        the moonstones.
      </>
    ),
    phishing: true,
    lesson:
      "Unexpected prizes, artificial time pressure, and requests for passwords are all strong warning signs. Legitimate organizations never ask for your password.",
    story:
      "Every sound returns twice in the hollow, including a cheerful voice promising treasure. A golden letter waits where the echoes are strongest.",
  },
  {
    kind: "message",
    location: "Fernlight Bridge",
    title: "A familiar ranger sends a message",
    sender: "Mara Chen",
    subject: "Today, 4:16 PM",
    message: (
      <>
        Here is the trail map we discussed this morning. It is saved in our
        shared drive under Maps / Spring Review. Let me know if you cannot find
        it there.
      </>
    ),
    phishing: false,
    lesson:
      "The sender references an expected conversation and points to a known shared drive without including a suspicious attachment or login link.",
    story:
      "Warm lanterns sway along Fernlight Bridge. A ranger you met earlier waves from the opposite bank just as a familiar conversation continues on your phone.",
  },
  {
    kind: "call",
    location: "The Guardian Oak",
    title: "Your phone rings beneath the old oak",
    sender: "Silverleaf Vault",
    subject: "+1 (555) 014-8821",
    message: (
      <>
        “We detected a dangerous payment on your account. Tell me the six-digit
        code we just sent you so I can cancel it before your money is lost.”
      </>
    ),
    phishing: true,
    lesson:
      "Caller ID can be spoofed. A real bank or security team will never ask you to read out a one-time passcode. Hang up and call the trusted number on your card or official app.",
    story:
      "At last, the ancient Guardian Oak rises through the mist. Its leaves fall silent as your phone rings and an urgent voice claims your vault is in danger.",
  },
];

const chapterTopics = [
  "phishing and suspicious links",
  "smishing and privacy",
  "passwords and social engineering",
  "malware and safe file sharing",
  "MFA and voice phishing",
];

function isGeneratedScenario(value: unknown): value is Scenario {
  if (!value || typeof value !== "object") return false;
  const scenario = value as Record<string, unknown>;
  return (
    ["email", "message", "call"].includes(String(scenario.kind)) &&
    typeof scenario.location === "string" &&
    typeof scenario.title === "string" &&
    typeof scenario.sender === "string" &&
    typeof scenario.subject === "string" &&
    typeof scenario.message === "string" &&
    typeof scenario.phishing === "boolean" &&
    typeof scenario.lesson === "string" &&
    typeof scenario.story === "string"
  );
}

async function generateScenarios(
  onGenerated: (index: number, scenario: Scenario) => void,
  signal: AbortSignal,
) {
  const endpoint = "https://phish-and-fable-backend.onrender.com/generate-challenge";

  for (const [index, chapter] of fallbackScenarios.entries()) {
    if (signal.aborted) return;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: chapter.kind,
          location: chapter.location,
          topic: chapterTopics[index],
        }),
        signal,
      });

      if (!response.ok) {
        const details = (await response.text()).slice(0, 300);
        throw new Error(
          `Challenge generation failed with status ${response.status}${details ? `: ${details}` : ""}`,
        );
      }

      const generated: unknown = await response.json();
      if (!isGeneratedScenario(generated)) {
        throw new Error("Challenge generation returned an invalid response");
      }

      onGenerated(index, generated);
    } catch (error) {
      if (signal.aborted) return;
      console.error(`Unable to generate Gemini challenge ${index + 1}; using fallback content.`, error);
    }
  }
}

function LeafMark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M32.7 5.8C18.1 5.2 8.5 11.6 7.2 23.2c-.4 4 1.9 7.8 5.8 9 4.1 1.2 8.6-.7 10.6-4.6 2.4-4.8 1.8-10.2 9.1-21.8Z" />
      <path d="M8.2 34.7c5.3-8 10.5-13.5 17-18.1M16.5 26.6c-.1-3.2-.8-5.6-2.1-7.6m4.7 3.2c3.2-.6 5.5-1.5 7.4-2.8" />
    </svg>
  );
}

function nodeToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeToText(node.props.children);
  return "";
}

function Icon({
  name,
  size = 20,
}: {
  name: "heart" | "sound" | "muted" | "book" | "shield" | "check" | "x" | "phone";
  size?: number;
}) {
  const paths = {
    heart: <path d="M20.8 4.6c-2.2-2.2-5.8-2.2-8 0L12 5.4l-.8-.8a5.7 5.7 0 0 0-8 8L12 21.4l8.8-8.8a5.7 5.7 0 0 0 0-8Z" />,
    sound: (
      <>
        <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
        <path d="M15 8.5a5 5 0 0 1 0 7M18 5.5a9 9 0 0 1 0 13" />
      </>
    ),
    muted: (
      <>
        <path d="M11 5 6.5 9H3v6h3.5L11 19V5ZM16 9l5 6M21 9l-5 6" />
      </>
    ),
    book: <path d="M4 5.5c3.5-.7 6 .1 8 2.2 2-2.1 4.5-2.9 8-2.2v13c-3.5-.7-6 0-8 2-2-2-4.5-2.7-8-2v-13Zm8 2.2v12.8" />,
    shield: <path d="M12 3.5c2.2 1.7 4.8 2.5 7.5 2.4v5.3c0 4.4-2.5 7.5-7.5 9.7-5-2.2-7.5-5.3-7.5-9.7V5.9c2.7.1 5.3-.7 7.5-2.4Z" />,
    check: <path d="m5 12.5 4.2 4.2L19 7" />,
    x: <path d="m6.5 6.5 11 11m0-11-11 11" />,
    phone: <path d="M7.3 3.8 10 7.3 8.4 9.1c1.1 2.3 2.7 4 5 5l1.9-1.7 3.5 2.8-.5 3.2c-.2 1.1-1.2 1.9-2.3 1.7C9.7 19.2 4.8 14.3 3.9 8c-.2-1.1.6-2.1 1.7-2.3l1.7-.3V3.8Z" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export default function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>(fallbackScenarios);
  const challengeRequest = useRef<Promise<void> | null>(null);
  const challengeAbort = useRef<AbortController | null>(null);
  const generationRun = useRef(0);
  const challengesLoaded = useRef(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [traveling, setTraveling] = useState(false);
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [savedAnswers, setSavedAnswers] = useState<Record<number, boolean>>({});
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guardianAudioState, setGuardianAudioState] = useState<"idle" | "loading" | "playing">(
    "idle",
  );
  const guardianAudio = useRef<HTMLAudioElement | null>(null);
  const guardianAudioUrl = useRef<string | null>(null);

  const finished = step >= scenarios.length;
  const gameOver = lives === 0;
  const scenario = scenarios[Math.min(step, scenarios.length - 1)];
  const correct = answer === scenario.phishing;

  useEffect(() => {
    setGuardianAudioState("idle");
    return () => {
      guardianAudio.current?.pause();
      guardianAudio.current = null;
      if (guardianAudioUrl.current) URL.revokeObjectURL(guardianAudioUrl.current);
      guardianAudioUrl.current = null;
    };
  }, [step]);

  async function playGuardianAudio() {
    if (guardianAudioState === "playing") {
      guardianAudio.current?.pause();
      guardianAudio.current = null;
      if (guardianAudioUrl.current) URL.revokeObjectURL(guardianAudioUrl.current);
      guardianAudioUrl.current = null;
      setGuardianAudioState("idle");
      return;
    }

    if (guardianAudioState === "loading") return;

    const text = nodeToText(scenario.message).trim();
    if (!text) return;

    setGuardianAudioState("loading");
    try {
      const response = await fetch(
        "https://phish-and-fable-backend.onrender.com/text-to-speech",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      if (!response.ok) {
        const details = (await response.text()).slice(0, 200);
        throw new Error(
          `Voice generation failed with status ${response.status}${details ? `: ${details}` : ""}`,
        );
      }

      const audioUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(audioUrl);
      guardianAudio.current = audio;
      guardianAudioUrl.current = audioUrl;
      audio.onended = () => {
        setGuardianAudioState("idle");
        guardianAudio.current = null;
        URL.revokeObjectURL(audioUrl);
        if (guardianAudioUrl.current === audioUrl) guardianAudioUrl.current = null;
      };
      await audio.play();
      setGuardianAudioState("playing");
    } catch (error) {
      guardianAudio.current?.pause();
      guardianAudio.current = null;
      if (guardianAudioUrl.current) URL.revokeObjectURL(guardianAudioUrl.current);
      guardianAudioUrl.current = null;
      setGuardianAudioState("idle");
      console.warn("Guardian Oak voice playback is unavailable.", error);
    }
  }

  function beginJourney() {
    setHasStarted(true);
    setTraveling(true);

    if (challengesLoaded.current || challengeRequest.current) return;

    const runId = ++generationRun.current;
    const controller = new AbortController();
    challengeAbort.current = controller;
    challengeRequest.current = generateScenarios((index, generated) => {
      if (generationRun.current !== runId) return;
      setScenarios((current) =>
        current.map((scenario, scenarioIndex) => (scenarioIndex === index ? generated : scenario)),
      );
    }, controller.signal).finally(() => {
      if (generationRun.current !== runId) return;
      challengesLoaded.current = true;
      challengeRequest.current = null;
      challengeAbort.current = null;
    });
  }

  function goHome() {
    setHasStarted(false);
    setTraveling(false);
  }

  function choose(value: boolean) {
    if (answer !== null) return;
    setAnswer(value);
    setSavedAnswers((current) => ({ ...current, [step]: value }));
    if (value === scenario.phishing) {
      setScore((current) => current + 1);
    } else {
      setLives((current) => Math.max(0, current - 1));
    }
  }

  function advance() {
    const nextStep = step + 1;
    setStep(nextStep);
    setFurthestStep((current) => Math.max(current, nextStep));
    setAnswer(savedAnswers[nextStep] ?? null);
    setTraveling(true);
  }

  function visitChapter(index: number) {
    if (index > furthestStep) return;
    setStep(index);
    setAnswer(index < scenarios.length ? savedAnswers[index] ?? null : null);
    setTraveling(false);
  }

  function previousChapter() {
    if (step === 0) return;
    visitChapter(step - 1);
  }

  function restart() {
    setStep(0);
    setFurthestStep(0);
    setScore(0);
    setLives(3);
    setAnswer(null);
    setSavedAnswers({});
    setScenarios(fallbackScenarios);
    challengeAbort.current?.abort();
    generationRun.current += 1;
    challengesLoaded.current = false;
    challengeRequest.current = null;
    challengeAbort.current = null;
    setTraveling(false);
    setHasStarted(false);
  }

  return (
    <main className="app-shell">
      <div className="forest-photo" />
      <div className="forest-wash" />
      <div className="fireflies" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, index) => (
          <i key={index} />
        ))}
      </div>

      <header className="topbar">
        <button className="brand" onClick={goHome} aria-label="Go to Phish and Fable home">
          <span className="brand-mark"><LeafMark /></span>
          <span>
            <strong>PHISH &amp; FABLE</strong>
            <small>A CYBERSECURITY JOURNEY</small>
          </span>
        </button>
        <div className="header-actions">
          {hasStarted && (
            <div className="score-pill" aria-label={`Score ${score}`}>
              <Icon name="shield" size={17} />
              <span>{score} WISDOM</span>
            </div>
          )}
          <button
            className="icon-button"
            onClick={() => setSoundOn((value) => !value)}
            aria-label={soundOn ? "Mute ambience" : "Play ambience"}
          >
            <Icon name={soundOn ? "sound" : "muted"} />
          </button>
          <button className="guide-button" onClick={() => setGuideOpen(true)}>
            <Icon name="book" size={18} />
            <span>Field guide</span>
          </button>
        </div>
      </header>

      {!hasStarted ? (
        <section className="welcome-stage">
          <div className="welcome-copy">
            <div className="welcome-emblem">
              <span><LeafMark /></span>
            </div>
            <div className="chapter-kicker">
              <i />
              AN INTERACTIVE CYBERSECURITY TALE
              <i />
            </div>
            <h1>Not every message<br />is what it <em>seems.</em></h1>
            <p>
              Deep within the Silverleaf Forest, deceptive messages have begun
              to spread. Follow the hidden path, study each clue, and learn to
              recognize phishing spells before they take hold.
            </p>
            <button className="begin-button" onClick={beginJourney}>
              <span>Begin the journey</span>
              <b>→</b>
            </button>
            <button className="welcome-guide" onClick={() => setGuideOpen(true)}>
              <Icon name="book" size={16} />
              Read the ranger's field guide
            </button>
          </div>

          <div className="welcome-details">
            <div>
              <span>5</span>
              <p><strong>Forest trials</strong> await along the path</p>
            </div>
            <div>
              <span><Icon name="shield" size={27} /></span>
              <p><strong>Gather wisdom</strong> with every right choice</p>
            </div>
            <div>
              <span>∞</span>
              <p><strong>Try again</strong> and sharpen your instincts</p>
            </div>
          </div>

          <p className="photo-credit">
            Forest photograph by Marek Szturc on Unsplash
          </p>
        </section>
      ) : (
      <div className="game-layout">
        <aside className="journey-panel">
          <span className="eyebrow">YOUR JOURNEY</span>
          <div className="trail">
            {scenarios.map((item, index) => (
              <button
                className={`trail-stop ${index === step ? "active" : ""} ${index < furthestStep ? "complete" : ""}`}
                key={item.location}
                disabled={index > furthestStep}
                onClick={() => visitChapter(index)}
                aria-label={`Go to chapter ${index + 1}, ${item.location}${index > furthestStep ? ", locked" : ""}`}
              >
                <span className="trail-orb">
                  {index < furthestStep ? <Icon name="check" size={14} /> : index + 1}
                </span>
                <div>
                  <small>CHAPTER {index + 1}</small>
                  <strong>{item.location}</strong>
                </div>
              </button>
            ))}
          </div>
          <div className="lives">
            <span>FOREST SPIRIT</span>
            <div aria-label={`${lives} Forest Spirit hearts remaining`}>
              {[0, 1, 2].map((heart) => (
                <span className={heart < lives ? "heart-active" : "heart-lost"} key={heart}>
                  <Icon name="heart" size={17} />
                </span>
              ))}
            </div>
          </div>
        </aside>

        <section className="stage">
          {!traveling && !gameOver && <div className="mobile-progress">
            <span>CHAPTER {Math.min(step + 1, scenarios.length)} OF {scenarios.length}</span>
            <div><i style={{ width: `${(Math.min(step + 1, scenarios.length) / scenarios.length) * 100}%` }} /></div>
          </div>}

          {gameOver ? (
            <div className="ending-card">
              <div className="ending-mark"><Icon name="heart" size={44} /></div>
              <span className="eyebrow">FOREST SPIRIT FADED</span>
              <h1>The forest calls you back to the trailhead</h1>
              <p>Your last spirit light has gone out, but every wrong turn has revealed a clue. Begin again and use what the forest has taught you.</p>
              <button onClick={restart}>Journey again <span>↻</span></button>
            </div>
          ) : traveling ? (
            <div className="journey-map" aria-live="polite">
              <div className="map-heading">
                <span className="eyebrow">{finished ? "THE PATH IS COMPLETE" : "YOUR FOREST JOURNEY"}</span>
                <h1>{finished ? "The Guardian Oak awaits" : "Choose your next chapter"}</h1>
                <p>{finished ? "Walk the final few steps to reveal what the forest has learned from you." : "Follow the lantern trail. Each clearing holds a new message to investigate."}</p>
              </div>

              <div className="map-field">
                <svg className="map-route" viewBox="0 0 700 500" preserveAspectRatio="none" aria-hidden="true">
                  <path className="route-shadow" d="M98 425 C150 405 185 345 245 335 S370 410 441 390 S510 285 546 250 S475 170 371 145 S240 105 182 90" />
                  <path className="route-dashes" d="M98 425 C150 405 185 345 245 335 S370 410 441 390 S510 285 546 250 S475 170 371 145 S240 105 182 90" />
                </svg>

                {[...scenarios, { location: "The Guardian Oak" }].map((item, index) => {
                  const positions = [
                    { left: "14%", top: "82%" },
                    { left: "35%", top: "64%" },
                    { left: "63%", top: "75%" },
                    { left: "78%", top: "47%" },
                    { left: "53%", top: "26%" },
                    { left: "26%", top: "15%" },
                  ];
                  const isCurrent = index === step;
                  const isComplete = index < furthestStep;
                  const isLocked = index > furthestStep;
                  return (
                    <button
                      key={`${item.location}-${index}`}
                      className={`map-level ${isCurrent ? "current" : ""} ${isComplete ? "completed" : ""} ${isLocked ? "locked" : ""}`}
                      style={positions[index]}
                      disabled={isLocked}
                      onClick={() => visitChapter(index)}
                      aria-label={`${item.location}${isCurrent ? ", current level" : isComplete ? ", completed" : ", locked"}`}
                    >
                      <span className="level-orb">
                        {isComplete ? <Icon name="check" size={18} /> : index === scenarios.length ? <Icon name="shield" size={20} /> : index + 1}
                      </span>
                      <span className="level-label">
                        <small>{index === scenarios.length ? "FINALE" : `LEVEL ${index + 1}`}</small>
                        <strong>{item.location}</strong>
                      </span>
                    </button>
                  );
                })}

                <div
                  className={`map-fairy step-${Math.min(step, scenarios.length)}`}
                  aria-label="Your fairy guide on the map"
                >
                  <img src="/assets/fairy-guide.png" alt="" />
                  <i className="fairy-spark s-one" />
                  <i className="fairy-spark s-two" />
                  <i className="fairy-spark s-three" />
                </div>

                <span className="map-firefly f1" /><span className="map-firefly f2" />
                <span className="map-firefly f3" /><span className="map-firefly f4" />
              </div>

              <div className="map-action">
                <span>{finished ? "FINAL DESTINATION" : `NEXT: LEVEL ${step + 1}`}</span>
                <button onClick={() => visitChapter(step)}>
                  {finished ? "See journey results" : `Enter ${scenario.location}`}
                  <b>→</b>
                </button>
              </div>
            </div>
          ) : !finished ? (
            <div className="quest-wrap">
              <div className="chapter-nav">
                <button onClick={previousChapter} disabled={step === 0}>
                  <span>←</span> Previous chapter
                </button>
                <button onClick={() => setTraveling(true)}>
                  Journey map <span>⌁</span>
                </button>
              </div>
              <div className="chapter-kicker">
                <i />
                CHAPTER {step + 1} · {scenario.location}
                <i />
              </div>
              <h1>{scenario.title}</h1>
              <div className="story-beat">
                <p>{scenario.story}</p>
              </div>
              <p className="prompt">Study the clues. Is this message safe, or is something sinister hiding between the lines?</p>

              {scenario.kind === "email" && (
                <article className="message-card">
                  <div className="wax-seal" aria-hidden="true"><LeafMark /></div>
                  <div className="email-ribbon"><span>EMAIL</span><i>•••</i></div>
                  <div className="message-meta">
                    <div><span>FROM</span><strong>{scenario.sender}</strong></div>
                    <div><span>SUBJECT</span><strong>{scenario.subject}</strong></div>
                  </div>
                  <div className="message-body">{scenario.message}</div>
                </article>
              )}

              {scenario.kind === "message" && (
                <article className="text-phone">
                  <div className="text-phone-top">
                    <span>9:41</span><i />
                    <b>⌁</b>
                  </div>
                  <div className="text-contact">
                    <span>{scenario.sender.charAt(0)}</span>
                    <div><strong>{scenario.sender}</strong><small>Text message</small></div>
                  </div>
                  <div className="text-thread">
                    <time>{scenario.subject}</time>
                    <div className="text-bubble">{scenario.message}</div>
                    <small>Delivered</small>
                  </div>
                  <div className="text-compose"><i>＋</i><span>Text message</span><b>↑</b></div>
                </article>
              )}

              {scenario.kind === "call" && (
                <div className="call-illustration">
                  <div className="call-rings" aria-hidden="true"><i /><i /><i /></div>
                  <div className="hand">
                    <i className="thumb" />
                    <i className="finger f-one" />
                    <i className="finger f-two" />
                    <i className="finger f-three" />
                    <i className="finger f-four" />
                  </div>
                  <article className="call-phone">
                    <div className="phone-speaker" />
                    <div className="call-status">INCOMING CALL</div>
                    <button
                      className={`call-audio-button ${guardianAudioState}`}
                      onClick={playGuardianAudio}
                      disabled={guardianAudioState === "loading"}
                      aria-label={
                        guardianAudioState === "playing"
                          ? "Stop reading the call aloud"
                          : "Read the call aloud"
                      }
                      aria-pressed={guardianAudioState === "playing"}
                    >
                      <Icon name={guardianAudioState === "playing" ? "muted" : "sound"} size={14} />
                    </button>
                    <div className="caller-avatar"><LeafMark /></div>
                    <strong>{scenario.sender}</strong>
                    <span>{scenario.subject}</span>
                    <div className="caller-claim">{scenario.message}</div>
                    <div className="call-controls">
                      <span className="decline"><Icon name="x" size={24} /></span>
                      <span className="answer"><Icon name="phone" size={23} /></span>
                    </div>
                  </article>
                </div>
              )}

              {answer === null ? (
                <div className="choices">
                  <button className="choice safe" onClick={() => choose(false)}>
                    <span className="choice-icon"><Icon name="check" size={28} /></span>
                    <span><strong>Safe passage</strong><small>This message seems legitimate</small></span>
                  </button>
                  <span className="or">OR</span>
                  <button className="choice danger" onClick={() => choose(true)}>
                    <span className="choice-icon"><Icon name="x" size={28} /></span>
                    <span><strong>Phishing trap</strong><small>Something feels suspicious</small></span>
                  </button>
                </div>
              ) : (
                <div className={`feedback ${correct ? "right" : "wrong"}`}>
                  <span className="feedback-icon"><Icon name={correct ? "check" : "x"} size={24} /></span>
                  <div>
                    <strong>{correct ? "Your instincts are sharp." : "The forest fooled you this time."}</strong>
                    <p>{scenario.lesson}</p>
                  </div>
                  <button onClick={advance}>{step === scenarios.length - 1 ? "Finish journey" : "Continue onward"} <span>→</span></button>
                </div>
              )}
              <p className="hint">Look closely at the sender, urgency, links, and requests.</p>
            </div>
          ) : (
            <div className="ending-card">
              <div className="ending-mark"><Icon name="shield" size={44} /></div>
              <span className="eyebrow">JOURNEY COMPLETE</span>
              <h1>The forest remembers your wisdom</h1>
              <p>You identified <strong>{score} of {scenarios.length}</strong> messages correctly. {score >= 4 ? "You are ready to guard the realm from deceptive messages." : "Every wrong turn reveals a clue. Walk the path once more and sharpen your instincts."}</p>
              <button onClick={restart}>Journey again <span>↻</span></button>
            </div>
          )}
        </section>
      </div>
      )}

      {guideOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setGuideOpen(false)}>
          <section className="guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setGuideOpen(false)} aria-label="Close guide"><Icon name="x" /></button>
            <span className="eyebrow">THE RANGER'S FIELD GUIDE</span>
            <h2 id="guide-title">Four signs of a phishing spell</h2>
            <ol>
              <li><span>01</span><div><strong>False urgency</strong><p>Threats and countdowns are designed to make you act before thinking.</p></div></li>
              <li><span>02</span><div><strong>Strange sender</strong><p>Check every character in the email domain, not just the display name.</p></div></li>
              <li><span>03</span><div><strong>Secret requests</strong><p>Trusted organizations will never ask for your password or access code.</p></div></li>
              <li><span>04</span><div><strong>Unknown paths</strong><p>Avoid unexpected links and attachments. Visit trusted services directly.</p></div></li>
            </ol>
          </section>
        </div>
      )}
    </main>
  );
}
