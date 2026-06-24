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

const state = JSON.parse(await fs.readFile(statePath, "utf8"));
const currentHtml = await fs.readFile(publicPath, "utf8");
assertFullTemplate(currentHtml);

const todayIso = formatBakuDate(new Date());
const displayDate = formatDisplayDate(todayIso);
const dayIndex = Number(state.dayIndex || 0) + 1;
const previousWords = Array.isArray(state.currentWords) && state.currentWords.length
  ? state.currentWords
  : fallbackPreviousWords();

const lesson = await generateLesson({ state, todayIso, dayIndex, previousWords });
validateLesson(lesson);

const todayWords = lesson.categories.flatMap((category) =>
  category.words.map((word) => ({ ...word, category: category.name }))
);

const learnedThisWeek = Math.min(75, dayIndex * 15);
const learnedThisMonth = Math.min(300, dayIndex * 15);
const weeklyPercent = Math.round((learnedThisWeek / 75) * 100);
const monthlyPercent = Math.round((learnedThisMonth / 300) * 100);
const level = learnedThisMonth >= 300 ? "Advanced" : learnedThisMonth >= 150 ? "Intermediate" : "Beginner";

const html = updateFullDashboard(currentHtml, {
  dayIndex,
  displayDate,
  todayWords,
  previousWords,
  learnedThisWeek,
  learnedThisMonth,
  weeklyPercent,
  monthlyPercent,
  level
});

validateHtml(html);

const nextState = {
  dayIndex,
  lastRunDate: todayIso,
  usedWords: unique([...(state.usedWords || []), ...todayWords.map((item) => item.word)]),
  currentWords: todayWords.map(({ word, translation, pronunciation, sentence, category }) => ({
    word,
    translation,
    pronunciation,
    sentence,
    category
  })),
  notes: "Full dashboard functionality is preserved by updating the existing HTML template instead of regenerating simplified markup."
};

await fs.writeFile(publicPath, html, "utf8");
await fs.writeFile(outputPath, html, "utf8");
await fs.writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");

console.log(`Dashboard updated for ${todayIso}.`);
console.log(`Preserved full dashboard template. New words: ${todayWords.map((item) => item.word).join(", ")}`);

async function generateLesson({ state, todayIso, dayIndex, previousWords }) {
  const prompt = `Return JSON only.
Dashboard language: Azerbaijani.
Taught words: English.
Date: ${todayIso}
Day: ${dayIndex}
Already used words: ${(state.usedWords || []).join(", ")}
Previous lesson review words: ${previousWords.map((item) => item.word).join(", ")}

Generate exactly 3 categories with exactly 5 new English words each:
1. Maliyyə auditi
2. IT
3. Gündəlik danışıq

For every word return:
- word: English word or phrase
- translation: Azerbaijani translation
- pronunciation: IPA/transcription
- sentence: English example sentence

Avoid repeating used words.

JSON shape:
{
  "categories": [
    {
      "name": "Maliyyə auditi",
      "words": [
        {"word":"...", "translation":"...", "pronunciation":"...", "sentence":"..."}
      ]
    }
  ]
}`;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: AbortSignal.timeout(120000),
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          input: [
            { role: "system", content: "Generate compact valid JSON only. No markdown." },
            { role: "user", content: prompt }
          ],
          text: { format: { type: "json_object" } }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API failed: ${response.status} ${await response.text()}`);
      }

      const payload = await response.json();
      const raw = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("");
      return JSON.parse(raw);
    } catch (error) {
      if (attempt === 2) throw error;
      console.log(`OpenAI attempt ${attempt} failed, retrying: ${error.message}`);
    }
  }
}

function updateFullDashboard(html, data) {
  const {
    dayIndex,
    displayDate,
    todayWords,
    previousWords,
    learnedThisWeek,
    learnedThisMonth,
    weeklyPercent,
    monthlyPercent,
    level
  } = data;

  let next = html;
  next = next.replace(/<title>Premium English Vocabulary Lab - Gün \d+<\/title>/, `<title>Premium English Vocabulary Lab - Gün ${dayIndex}</title>`);
  next = next.replace(/Bugünkü dashboard Gün \d+ üçün yeniləndi\./g, `Bugünkü dashboard Gün ${dayIndex} üçün yeniləndi.`);
  next = next.replace(/<span>Gün \d+<\/span>\s*<strong>\d{2}\.\d{2}\.\d{4}<\/strong>/, `<span>Gün ${dayIndex}</span>\n          <strong>${displayDate}</strong>`);
  next = next.replace(/<div class="stat"><span>Həftəlik sözlər<\/span><strong>\d+<\/strong><\/div>/, `<div class="stat"><span>Həftəlik sözlər</span><strong>${learnedThisWeek}</strong></div>`);
  next = next.replace(/<div class="stat"><span>Aylıq sözlər<\/span><strong>\d+<\/strong><\/div>/, `<div class="stat"><span>Aylıq sözlər</span><strong>${learnedThisMonth}</strong></div>`);
  next = next.replace(/<div class="stat"><span>Streak<\/span><strong id="streakValue">\d+ gün<\/strong><\/div>/, `<div class="stat"><span>Streak</span><strong id="streakValue">${dayIndex} gün</strong></div>`);
  next = next.replace(/<div class="feature-card"><h3>Həftəlik progress<\/h3><p>Hədəf: 75 söz\. Hazırda: \d+ söz\.<\/p><div class="progress-track"><div class="progress-fill" style="--value:\d+%"><\/div><\/div><\/div>/, `<div class="feature-card"><h3>Həftəlik progress</h3><p>Hədəf: 75 söz. Hazırda: ${learnedThisWeek} söz.</p><div class="progress-track"><div class="progress-fill" style="--value:${weeklyPercent}%"></div></div></div>`);
  next = next.replace(/<div class="feature-card"><h3>Aylıq progress<\/h3><p>Hədəf: 300 söz\. Hazırda: \d+ söz\.<\/p><div class="progress-track"><div class="progress-fill" style="--value:\d+%"><\/div><\/div><\/div>/, `<div class="feature-card"><h3>Aylıq progress</h3><p>Hədəf: 300 söz. Hazırda: ${learnedThisMonth} söz.</p><div class="progress-track"><div class="progress-fill" style="--value:${monthlyPercent}%"></div></div></div>`);
  next = next.replace(/İndiki mərhələ: (Beginner|Intermediate|Advanced)\./, `İndiki mərhələ: ${level}.`);
  next = next.replace(/<span class="level(?: active)?">Beginner<\/span><span class="level(?: active)?">Intermediate<\/span><span class="level(?: active)?">Advanced<\/span>/, ["Beginner", "Intermediate", "Advanced"].map((item) => `<span class="level${item === level ? " active" : ""}">${item}</span>`).join(""));

  next = replaceSection(next, /<section class="section">\s*<div class="section-header"><h2>Qısa Təkrar<\/h2>[\s\S]*?<\/section>/, renderReviewSection(previousWords));
  next = replaceSection(next, /<section class="section blue">[\s\S]*?<\/section>/, renderCategorySection("blue", "Maliyyə Auditi", "Mavi fokus", todayWords.filter((item) => item.category === "Maliyyə auditi")));
  next = replaceSection(next, /<section class="section teal">[\s\S]*?<\/section>/, renderCategorySection("teal", "IT", "Yaşıl fokus", todayWords.filter((item) => item.category === "IT")));
  next = replaceSection(next, /<section class="section gold">[\s\S]*?<\/section>/, renderCategorySection("gold", "Gündəlik Danışıq", "Qızılı fokus", todayWords.filter((item) => item.category === "Gündəlik danışıq")));
  next = replaceSection(next, /<section class="section">\s*<div class="section-header"><h2>Flip Card Rejimi<\/h2>[\s\S]*?<\/section>/, renderFlipSection(todayWords.slice(0, 3)));

  next = replaceJsArray(next, "todayWords", todayWords.map((item) => [item.word, item.translation, item.category]));
  next = replaceJsArray(next, "reviewWords", previousWords.map((item) => [item.word, item.translation, item.category]));
  next = replaceJsArray(next, "distractors", unique([...previousWords, ...todayWords].map((item) => item.translation)));
  next = replaceQuestionBank(next, "todayQuestionBank", todayWords);
  next = replaceQuestionBank(next, "reviewQuestionBank", previousWords);
  next = next.replace(/const state = JSON\.parse\(localStorage\.getItem\(storageKey\) \|\| '\{"streak":\d+,/, `const state = JSON.parse(localStorage.getItem(storageKey) || '{"streak":${dayIndex},`);
  next = next.replace(/\$čstate\.streak \|\| \d+\} gün/g, `$čstate.streak || ${dayIndex}} gün`);
  next = next.replace(/\$\{state\.streak \|\| \d+\} gün/g, `\${state.streak || ${dayIndex}} gün`);
  next = next.replace(/<div class="feature-card"><h3>Öyrənilən sözlər<\/h3><p>\d+ \/ 300<\/p><\/div>/, `<div class="feature-card"><h3>Öyrənilən sözlər</h3><p>${learnedThisMonth} / 300</p></div>`);

  return next;
}

function renderReviewSection(words) {
  return `<section class="section">
      <div class="section-header"><h2>Qısa Təkrar</h2><span class="pill" style="background:#f2f4f7;color:#475467;">Əvvəlki dərs</span></div>
      <div class="review-grid">
        ${Object.entries(groupByCategory(words)).map(([category, items]) => `<div class="review-card ${categoryClass(category)}">
          <h3>${escapeHtml(category)}</h3>
          <ul class="review-list">
            ${items.slice(0, 5).map((item) => `<li><strong>${escapeHtml(item.word)}</strong><span>${escapeHtml(item.translation)}</span></li>`).join("\n            ")}
          </ul>
        </div>`).join("\n        ")}
      </div>
    </section>`;
}

function renderCategorySection(className, title, pill, words) {
  return `<section class="section ${className}">
      <div class="section-header"><h2>${escapeHtml(title)}</h2><span class="pill">${escapeHtml(pill)}</span></div>
      <table>
        <thead><tr><th>#</th><th>Söz</th><th>Tələffüz</th><th>Tərcümə</th><th>Nümunə cümlə</th></tr></thead>
        <tbody>
          ${words.map((item, index) => `<tr><td>${index + 1}</td><td><code>${escapeHtml(item.word)}</code></td><td>${escapeHtml(item.pronunciation)}</td><td>${escapeHtml(item.translation)}</td><td>${escapeHtml(item.sentence)}</td></tr>`).join("\n          ")}
        </tbody>
      </table>
    </section>`;
}

function renderFlipSection(words) {
  return `<section class="section">
      <div class="section-header"><h2>Flip Card Rejimi</h2><span class="pill" style="background:#e9fbf7;color:var(--teal);">Kliklə çevir</span></div>
      <div class="flip-grid">
        ${words.map((item) => `<div class="flip-card" role="button" tabindex="0" aria-label="${escapeHtml(item.word)} kartını çevir"><div class="flip-inner"><div class="flip-face"><strong>${escapeHtml(item.word)}</strong><span class="pronunciation">${escapeHtml(item.pronunciation)}</span><p class="note">Tərcüməni görmək üçün kliklə.</p></div><div class="flip-face flip-back"><strong>${escapeHtml(item.translation)}</strong><p>${escapeHtml(item.sentence)}</p></div></div></div>`).join("\n        ")}
      </div>
    </section>`;
}

function replaceSection(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`Section pattern was not found: ${pattern}`);
  return html.replace(pattern, replacement);
}

function replaceJsArray(html, name, values) {
  const serialized = values.map((row) => Array.isArray(row)
    ? `      ${JSON.stringify(row)}`
    : `      ${JSON.stringify(row)}`).join(",\n");
  const pattern = new RegExp(`const ${name} = \\\\[([\\\\s\\\\S]*?)\\\\n    \\\\];`);
  if (!pattern.test(html)) throw new Error(`JS array was not found: ${name}`);
  return html.replace(pattern, `const ${name} = [\n${serialized}\n    ];`);
}

function replaceQuestionBank(html, name, words) {
  const questions = words.map((item, index) => ({
    word: item.word,
    translation: item.translation,
    category: item.category,
    prompt: index % 2 === 0 ? "Cümlədə boşluğu doldur:" : "Situasiyaya uyğun termini seç:",
    sentence: sentenceWithBlank(item.sentence, item.word),
    correct: item.word,
    options: buildWordOptions(item, words, index)
  }));
  const serialized = questions.map((question) => `      ${JSON.stringify(question)}`).join(",\n");
  const pattern = new RegExp(`const ${name} = \\\\[([\\\\s\\\\S]*?)\\\\n    \\\\];`);
  if (!pattern.test(html)) throw new Error(`Question bank was not found: ${name}`);
  return html.replace(pattern, `const ${name} = [\n${serialized}\n    ];`);
}

function sentenceWithBlank(sentence, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");
  return regex.test(sentence) ? sentence.replace(regex, "______") : `${sentence} (${word}: ______)`;
}

function buildWordOptions(correctItem, words, index) {
  const options = [correctItem.word];
  const pool = words.map((item) => item.word).filter((word) => word !== correctItem.word);
  for (let i = 0; options.length < 4 && i < pool.length + 8; i += 1) {
    const candidate = pool[(index * 3 + i) % pool.length];
    if (candidate && !options.includes(candidate)) options.push(candidate);
  }
  return options;
}

function assertFullTemplate(html) {
  const required = ["dictionaryModal", "renderDictionary", "todayQuestionBank", "reviewQuestionBank", "sentenceTranslations", "data-open-dictionary"];
  for (const marker of required) {
    if (!html.includes(marker)) {
      throw new Error(`Current dashboard is not the full template. Missing: ${marker}`);
    }
  }
}

function validateLesson(lesson) {
  if (!lesson || !Array.isArray(lesson.categories) || lesson.categories.length !== 3) {
    throw new Error("Lesson must include exactly 3 categories.");
  }
  for (const category of lesson.categories) {
    if (!Array.isArray(category.words) || category.words.length !== 5) {
      throw new Error(`Category ${category.name} must include exactly 5 words.`);
    }
    for (const word of category.words) {
      for (const key of ["word", "translation", "pronunciation", "sentence"]) {
        if (!word[key]) throw new Error(`Missing ${key} in generated lesson.`);
      }
    }
  }
}

function validateHtml(html) {
  const required = ["dictionaryModal", "renderDictionary", "todayQuestionBank", "reviewQuestionBank", "flip-card", "flip-inner", "localStorage", "data-correct", "apple-mobile-web-app-capable", "Çətin Sözlər"];
  for (const marker of required) {
    if (!html.includes(marker)) throw new Error(`Generated HTML is missing required marker: ${marker}`);
  }
  if (/GÃ|É™|�/.test(html)) throw new Error("Generated HTML appears to contain broken Azerbaijani encoding.");
}

function fallbackPreviousWords() {
  return [
    { word: "Audit evidence", translation: "audit sübutu", pronunciation: "/ˈɔː.dɪt ˈev.ɪ.dəns/", sentence: "The auditor collected audit evidence.", category: "Maliyyə auditi" },
    { word: "Cloud storage", translation: "bulud yaddaşı", pronunciation: "/klaʊd ˈstɔːr.ɪdʒ/", sentence: "We store backup files in cloud storage.", category: "IT" },
    { word: "Reschedule", translation: "vaxtını dəyişmək", pronunciation: "/ˌriːˈskedʒ.uːl/", sentence: "Can we reschedule the call?", category: "Gündəlik danışıq" }
  ];
}

function groupByCategory(words) {
  return words.reduce((groups, item) => {
    const category = item.category || "Təkrar";
    groups[category] ||= [];
    groups[category].push(item);
    return groups;
  }, {});
}

function categoryClass(category) {
  if (category === "Maliyyə auditi") return "blue";
  if (category === "IT") return "teal";
  if (category === "Gündəlik danışıq") return "gold";
  return "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function formatBakuDate(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatDisplayDate(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}
