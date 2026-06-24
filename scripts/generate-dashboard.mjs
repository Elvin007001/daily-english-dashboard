import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const publicPath = path.join(root, "public", "index.html");
const outputPath = path.join(root, "outputs", "daily-english-dashboard.html");
const statePath = path.join(root, "data", "dashboard-state.json");

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

if (!apiKey) {
  throw new Error("OPENAI_API_KEY secret is required for cloud AI generation.");
}

const currentHtml = await fs.readFile(publicPath, "utf8");
const state = JSON.parse(await fs.readFile(statePath, "utf8"));
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Baku",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

const prompt = `
You update a single-file offline HTML vocabulary dashboard.

Current Baku date: ${today}
Current dashboard state JSON:
${JSON.stringify(state, null, 2)}

Current HTML:
${currentHtml}

Task:
- Return one JSON object only, with keys "html" and "state".
- Update the dashboard for the new day. Overwrite the page content; do not create archives.
- UI language must be Azerbaijani. Taught words must be English.
- Add exactly 15 new English words: 5 Financial Audit, 5 IT, 5 Daily Conversation.
- Do not repeat words from state.usedWords except in the short previous-lesson review.
- For every word include English word, Azerbaijani translation, pronunciation/transcription, and an English example sentence.
- Keep premium design: gradient background, colored cards, dashboard stats, category sections, flip cards, interactive test cards, difficult words, dictionary if present, monthly certificate.
- Keep all CSS and JavaScript inline. Do not require external libraries or internet resources.
- Keep weekly target 75 words and monthly target 300 words with visual progress bars.
- Keep localStorage streak counter and difficult words list.
- Keep level system: Beginner, Intermediate, Advanced.
- Keep Monthly Vocabulary Certificate section.
- Flip cards must use <div class="flip-card" role="button" tabindex="0"> with nested <div class="flip-inner">, <div class="flip-face">, and <div class="flip-face flip-back">. .flip-inner must be display:block and rotateY transform must be applied to .flip-inner.
- Tests must be interactive A/B/C/D buttons or cards. Correct answer must be stored in data-correct. On answer click, correct answer turns green, wrong selected answer turns red/pink, feedback appears, and wrong word is added to localStorage difficult words.
- If the date is Friday, include a weekly test section in addition to the new 15 words.
- If it is the first business day of the month, include an interactive monthly exam section.
- Keep mobile and desktop readability. Preserve iPhone web-app meta tags: viewport-fit=cover, apple-mobile-web-app-capable, apple-mobile-web-app-title, apple-mobile-web-app-status-bar-style.
- Do not include mojibake such as GÃ¼n or replacement characters.

Output JSON shape:
{
  "html": "<!doctype html>...",
  "state": {
    "dayIndex": number,
    "lastRunDate": "${today}",
    "usedWords": ["..."],
    "notes": "..."
  }
}
`;

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model,
    input: [
      {
        role: "system",
        content: "You are a careful HTML generator. Return valid JSON only. Preserve offline interactivity and Azerbaijani text encoding."
      },
      { role: "user", content: prompt }
    ],
    text: {
      format: {
        type: "json_object"
      }
    }
  })
});

if (!response.ok) {
  throw new Error(`OpenAI API failed: ${response.status} ${await response.text()}`);
}

const payload = await response.json();
const raw = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("");
const result = JSON.parse(raw);

validateHtml(result.html);
validateState(result.state);

await fs.writeFile(publicPath, result.html, "utf8");
await fs.writeFile(outputPath, result.html, "utf8");
await fs.writeFile(statePath, `${JSON.stringify(result.state, null, 2)}\n`, "utf8");

console.log(`Dashboard updated for ${today}.`);
console.log(`HTML length: ${result.html.length}`);

function validateHtml(html) {
  const required = [
    "<!doctype html",
    "flip-card",
    "flip-inner",
    "localStorage",
    "data-correct",
    "apple-mobile-web-app-capable",
    "Monthly",
    "Çətin"
  ];

  for (const marker of required) {
    if (!html.includes(marker)) {
      throw new Error(`Generated HTML is missing required marker: ${marker}`);
    }
  }

  if (/GÃ|É™|�/.test(html)) {
    throw new Error("Generated HTML appears to contain broken Azerbaijani encoding.");
  }

  if (/<script[^>]+src=|<link[^>]+href=["']https?:/i.test(html)) {
    throw new Error("Generated HTML must not depend on external JS/CSS resources.");
  }
}

function validateState(nextState) {
  if (!nextState || !Array.isArray(nextState.usedWords)) {
    throw new Error("Generated state must include usedWords array.");
  }
  if (!nextState.lastRunDate) {
    throw new Error("Generated state must include lastRunDate.");
  }
}
