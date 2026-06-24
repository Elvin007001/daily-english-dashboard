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
const now = new Date();
const todayIso = formatBakuDate(now);
const displayDate = formatDisplayDate(todayIso);
const nextDayIndex = Number(state.dayIndex || 0) + 1;
const previousWords = Array.isArray(state.currentWords) && state.currentWords.length
  ? state.currentWords
  : fallbackPreviousWords();

const lesson = await generateLesson({ state, todayIso, nextDayIndex, previousWords });
validateLesson(lesson);

const allWords = lesson.categories.flatMap((category) =>
  category.words.map((word) => ({ ...word, category: category.name }))
);
const learnedThisWeek = Math.min(75, nextDayIndex * 15);
const learnedThisMonth = Math.min(300, nextDayIndex * 15);
const weeklyPercent = Math.round((learnedThisWeek / 75) * 100);
const monthlyPercent = Math.round((learnedThisMonth / 300) * 100);
const level = learnedThisMonth >= 300 ? "Advanced" : learnedThisMonth >= 150 ? "Intermediate" : "Beginner";
const isFriday = getBakuWeekday(now) === 5;
const isFirstBusinessDay = await firstBusinessDayOfMonth(todayIso) === todayIso;

const html = renderHtml({
  lesson,
  allWords,
  previousWords,
  todayIso,
  displayDate,
  nextDayIndex,
  learnedThisWeek,
  learnedThisMonth,
  weeklyPercent,
  monthlyPercent,
  level,
  isFriday,
  isFirstBusinessDay
});

validateHtml(html);

const nextState = {
  dayIndex: nextDayIndex,
  lastRunDate: todayIso,
  usedWords: unique([...(state.usedWords || []), ...allWords.map((word) => word.word)]),
  currentWords: allWords.map(({ word, translation, pronunciation, sentence, category }) => ({
    word,
    translation,
    pronunciation,
    sentence,
    category
  })),
  notes: "Keep UI Azerbaijani and taught words English. Do not repeat usedWords except review sections."
};

await fs.writeFile(publicPath, html, "utf8");
await fs.writeFile(outputPath, html, "utf8");
await fs.writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");

console.log(`Dashboard updated for ${todayIso}.`);
console.log(`New words: ${allWords.map((word) => word.word).join(", ")}`);
console.log(`HTML length: ${html.length}`);

async function generateLesson({ state, todayIso, nextDayIndex, previousWords }) {
  const prompt = `Return JSON only for an Azerbaijani UI English vocabulary dashboard.
Date: ${todayIso}
Day: ${nextDayIndex}
Already used English words: ${(state.usedWords || []).join(", ")}
Previous lesson words for review: ${previousWords.map((item) => item.word).join(", ")}

Generate exactly 3 categories:
1. Maliyyə auditi
2. IT
3. Gündəlik danışıq

Each category must contain exactly 5 new English words. Avoid used words. For each word provide:
- word: English term
- translation: Azerbaijani translation
- pronunciation: IPA or clear transcription
- sentence: English example sentence

Also provide:
- title: short Azerbaijani title for today's lesson
- focus: one Azerbaijani sentence describing today's focus

JSON shape:
{
  "title": "...",
  "focus": "...",
  "categories": [
    {
      "name": "Maliyyə auditi",
      "theme": "blue",
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
            {
              role: "system",
              content: "You generate compact, valid JSON for vocabulary lessons. Do not include markdown."
            },
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

function renderHtml(input) {
  const {
    lesson,
    allWords,
    previousWords,
    todayIso,
    displayDate,
    nextDayIndex,
    learnedThisWeek,
    learnedThisMonth,
    weeklyPercent,
    monthlyPercent,
    level,
    isFriday,
    isFirstBusinessDay
  } = input;

  const quizWords = allWords.slice(0, 12);
  const weeklyWords = isFriday ? uniqueWords([...previousWords, ...allWords]).slice(0, 20) : [];
  const monthlyWords = isFirstBusinessDay ? uniqueWords([...previousWords, ...allWords]).slice(0, 20) : [];

  return `<!doctype html>
<html lang="az" class="no-js">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="English Dashboard">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Premium English Vocabulary Lab - Gün ${nextDayIndex}</title>
  <style>
    :root { --ink:#172033; --muted:#667085; --card:#fff; --line:#e6e9f2; --blue:#315cff; --teal:#008c7a; --gold:#b7791f; --rose:#c2415d; --green:#12b76a; --red:#f04438; --shadow:0 20px 50px rgba(17,24,39,.12); }
    * { box-sizing:border-box; }
    body { margin:0; font-family: Georgia, "Segoe UI", sans-serif; color:var(--ink); background:radial-gradient(circle at 10% 5%, rgba(49,92,255,.20), transparent 28rem), radial-gradient(circle at 95% 12%, rgba(0,140,122,.18), transparent 30rem), linear-gradient(135deg,#f8fbff,#fffaf0); min-height:100vh; }
    .shell { width:min(1180px, calc(100% - 28px)); margin:0 auto; padding:28px 0 48px; }
    .hero { color:white; background:linear-gradient(135deg, rgba(23,32,51,.97), rgba(49,92,255,.84)), radial-gradient(circle at 88% 10%, rgba(255,215,128,.45), transparent 20rem); border-radius:26px; padding:34px; box-shadow:var(--shadow); }
    .hero-top, .section-header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; flex-wrap:wrap; }
    .eyebrow { letter-spacing:.08em; text-transform:uppercase; font-size:12px; opacity:.78; margin:0 0 10px; }
    h1 { font-size:clamp(32px, 5vw, 58px); line-height:1; margin:0; max-width:760px; }
    h2, h3 { margin-top:0; }
    .hero-note { max-width:720px; color:rgba(255,255,255,.80); line-height:1.65; }
    .date-card { min-width:220px; border:1px solid rgba(255,255,255,.28); background:rgba(255,255,255,.13); border-radius:18px; padding:18px; backdrop-filter:blur(10px); }
    .date-card strong { display:block; font-size:26px; margin:6px 0; }
    .stats, .dashboard-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-top:24px; }
    .dashboard-grid { grid-template-columns:repeat(3,minmax(0,1fr)); margin:0; padding:22px; }
    .stat, .feature-card, .module-card, .review-card { border-radius:18px; padding:16px; border:1px solid rgba(255,255,255,.22); background:rgba(255,255,255,.14); }
    .stat span { display:block; color:rgba(255,255,255,.75); font-size:13px; margin-bottom:8px; }
    .stat strong { font-size:24px; }
    .section { margin-top:22px; background:var(--card); border:1px solid var(--line); border-radius:22px; box-shadow:0 12px 30px rgba(17,24,39,.06); overflow:hidden; }
    .section-header { align-items:center; padding:20px 22px; border-bottom:1px solid var(--line); }
    .pill { border-radius:999px; padding:7px 12px; font-size:12px; font-weight:800; white-space:nowrap; background:#eef3ff; color:var(--blue); }
    .feature-card, .module-card, .review-card { background:linear-gradient(135deg,#fff,#fbfcff); border-color:var(--line); }
    .progress-track { height:12px; background:#edf1f7; border-radius:999px; overflow:hidden; margin-top:12px; }
    .progress-fill { height:100%; width:var(--value); background:linear-gradient(90deg,var(--blue),var(--teal)); border-radius:inherit; }
    .level-band { display:flex; gap:8px; margin-top:12px; }
    .level { flex:1; border-radius:999px; padding:8px 10px; text-align:center; font-size:12px; font-weight:800; color:#475467; background:#f2f4f7; }
    .level.active { color:white; background:linear-gradient(135deg,var(--blue),var(--teal)); }
    table { width:100%; border-collapse:collapse; }
    th,td { padding:15px 18px; text-align:left; border-bottom:1px solid var(--line); vertical-align:top; }
    th { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; background:#fbfcff; }
    code { color:#101828; background:#f2f4f7; border-radius:8px; padding:3px 7px; font-family:Consolas,monospace; font-size:13px; }
    .review-grid, .flip-grid, .difficult-list, .module-grid, .quiz-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; padding:22px; }
    .review-list { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
    .review-list li { display:flex; justify-content:space-between; gap:12px; border:1px solid var(--line); border-radius:12px; padding:10px 12px; background:#fff; }
    .note { color:var(--muted); line-height:1.6; }
    .flip-card { display:block; width:100%; min-height:160px; perspective:900px; cursor:pointer; outline:0; }
    .flip-card:focus-visible { outline:3px solid rgba(49,92,255,.35); outline-offset:4px; border-radius:18px; }
    .flip-inner { display:block; position:relative; min-height:160px; border-radius:18px; transform-style:preserve-3d; transition:transform 360ms ease; box-shadow:0 12px 26px rgba(17,24,39,.08); }
    .flip-card.is-flipped .flip-inner { transform:rotateY(180deg); }
    .flip-face { position:absolute; inset:0; backface-visibility:hidden; border-radius:18px; padding:18px; border:1px solid var(--line); background:white; overflow:hidden; }
    .flip-back { transform:rotateY(180deg); background:linear-gradient(135deg,#eef3ff,#e9fbf7); }
    .pronunciation { display:inline-block; margin-top:10px; color:#344054; background:#f8fafc; border-radius:999px; padding:6px 10px; font-size:12px; font-weight:700; }
    .question { border:1px solid #f3d6df; background:linear-gradient(135deg,#fff7f9,#fff); border-radius:18px; padding:18px; }
    .options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:14px; }
    .option { border:1px solid var(--line); border-radius:14px; padding:12px 14px; background:white; color:var(--ink); cursor:pointer; font:inherit; text-align:left; }
    .option.correct { border-color:var(--green); background:#dcfae6; color:#05603a; }
    .option.wrong { border-color:var(--red); background:#fff1f0; color:#b42318; }
    .answer-feedback { display:none; margin-top:14px; border-radius:14px; padding:12px 14px; font-weight:800; }
    .answer-feedback.success { display:block; color:#05603a; background:#dcfae6; }
    .answer-feedback.retry { display:block; color:#b42318; background:#fff1f0; }
    .word-chip { border:1px solid #ffd6d3; background:#fff7f6; color:#b42318; border-radius:16px; padding:14px; font-weight:800; }
    .certificate { padding:28px; background:linear-gradient(135deg,rgba(183,121,31,.16),rgba(49,92,255,.10)),#fff; }
    .certificate-card { border:1px solid rgba(183,121,31,.32); border-radius:22px; padding:26px; background:linear-gradient(135deg,#fffaf0,#fff); box-shadow:0 16px 34px rgba(183,121,31,.12); }
    @media (max-width:760px) { .shell{width:min(100% - 20px,1180px); padding-top:14px;} .hero{padding:24px;} .stats,.dashboard-grid,.review-grid,.flip-grid,.difficult-list,.options,.module-grid,.quiz-grid{grid-template-columns:1fr;} table{display:block; overflow-x:auto;} th,td{padding:12px;} }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="hero-top">
        <div>
          <p class="eyebrow">Daily English Vocabulary Lab</p>
          <h1>${escapeHtml(lesson.title || `Premium söz dərsi`)}</h1>
          <p class="hero-note">${escapeHtml(lesson.focus || "Maliyyə auditi, IT və gündəlik danışıq üzrə gündəlik 15 söz.")}</p>
        </div>
        <div class="date-card"><span>Gün ${nextDayIndex}</span><strong>${displayDate}</strong><span>Bakı vaxtı ilə 10:00</span></div>
      </div>
      <div class="stats">
        <div class="stat"><span>Bugünkü sözlər</span><strong>15</strong></div>
        <div class="stat"><span>Həftəlik sözlər</span><strong>${learnedThisWeek}</strong></div>
        <div class="stat"><span>Aylıq sözlər</span><strong>${learnedThisMonth}</strong></div>
        <div class="stat"><span>Streak</span><strong id="streakValue">${nextDayIndex} gün</strong></div>
      </div>
    </section>

    <section class="section">
      <div class="section-header"><h2>Learning Dashboard</h2><span class="pill">Premium status</span></div>
      <div class="dashboard-grid">
        <div class="feature-card"><h3>Həftəlik progress</h3><p>Hədəf: 75 söz. Hazırda: ${learnedThisWeek} söz.</p><div class="progress-track"><div class="progress-fill" style="--value:${weeklyPercent}%"></div></div></div>
        <div class="feature-card"><h3>Aylıq progress</h3><p>Hədəf: 300 söz. Hazırda: ${learnedThisMonth} söz.</p><div class="progress-track"><div class="progress-fill" style="--value:${monthlyPercent}%"></div></div></div>
        <div class="feature-card"><h3>Level sistemi</h3><p>İndiki mərhələ: ${level}.</p><div class="level-band">${["Beginner", "Intermediate", "Advanced"].map((name) => `<span class="level ${name === level ? "active" : ""}">${name}</span>`).join("")}</div></div>
      </div>
    </section>

    <section class="section">
      <div class="section-header"><h2>Qısa Təkrar</h2><span class="pill">Əvvəlki dərs</span></div>
      <div class="review-grid">${renderReview(previousWords)}</div>
    </section>

    ${lesson.categories.map(renderCategory).join("")}

    <section class="section">
      <div class="section-header"><h2>Flip Card Rejimi</h2><span class="pill">Kliklə çevir</span></div>
      <div class="flip-grid">${allWords.slice(0, 6).map(renderFlipCard).join("")}</div>
    </section>

    <section class="section">
      <div class="section-header"><h2>Mini Practice</h2><span class="pill">A/B/C/D test</span></div>
      <div class="quiz-grid">${quizWords.map((word, index) => renderQuestion(word, index, allWords)).join("")}</div>
    </section>

    ${isFriday ? `<section class="section"><div class="section-header"><h2>Həftəlik Test</h2><span class="pill">Cümə yoxlaması</span></div><div class="quiz-grid">${weeklyWords.slice(0, 8).map((word, index) => renderQuestion(word, index, weeklyWords)).join("")}</div></section>` : ""}
    ${isFirstBusinessDay ? `<section class="section"><div class="section-header"><h2>Aylıq İmtahan</h2><span class="pill">Monthly exam</span></div><div class="quiz-grid">${monthlyWords.slice(0, 10).map((word, index) => renderQuestion(word, index, monthlyWords)).join("")}</div></section>` : ""}

    <section class="section">
      <div class="section-header"><h2>Çətin Sözlər</h2><span class="pill">Avtomatik siyahı</span></div>
      <div class="difficult-list" id="difficultWords"><div class="word-chip">Səhv cavab verilən sözlər burada görünəcək.</div></div>
    </section>

    <section class="section">
      <div class="section-header"><h2>Aylıq Sertifikat Kartı</h2><span class="pill">Monthly Vocabulary Certificate</span></div>
      <div class="certificate"><div class="certificate-card">
        <p class="eyebrow" style="color:#8a5a16;opacity:1;">Monthly Vocabulary Certificate</p>
        <h3>${monthName(todayIso)} ${todayIso.slice(0, 4)} nəticə kartı</h3>
        <div class="dashboard-grid" style="padding:0;margin-top:18px;"><div class="feature-card"><h3>Öyrənilən sözlər</h3><p>${learnedThisMonth} / 300</p></div><div class="feature-card"><h3>Test faizi</h3><p id="testScore">Cavab gözlənilir</p></div><div class="feature-card"><h3>Status</h3><p>${level} aktivdir</p></div></div>
      </div></div>
    </section>
  </main>

  <script>
    const storageKey = "dailyEnglishDashboardState";
    const fallbackState = { streak: ${nextDayIndex}, correct: 0, total: 0, difficult: [] };
    let state = JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(fallbackState));
    state.streak = Math.max(state.streak || 0, ${nextDayIndex});

    function saveState() { localStorage.setItem(storageKey, JSON.stringify(state)); }
    function renderState() {
      document.getElementById("streakValue").textContent = state.streak + " gün";
      const difficult = document.getElementById("difficultWords");
      difficult.innerHTML = state.difficult.length ? state.difficult.map((word) => '<div class="word-chip">' + escapeHtml(word) + '</div>').join("") : '<div class="word-chip">Səhv cavab verilən sözlər burada görünəcək.</div>';
      const score = document.getElementById("testScore");
      if (score) score.textContent = state.total ? Math.round((state.correct / state.total) * 100) + "%" : "Cavab gözlənilir";
      saveState();
    }
    function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
    document.querySelectorAll(".flip-card").forEach((card) => {
      card.addEventListener("click", () => card.classList.toggle("is-flipped"));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); card.classList.toggle("is-flipped"); }
      });
    });
    document.querySelectorAll("[data-quiz]").forEach((quiz) => {
      const correct = quiz.dataset.correct;
      const word = quiz.dataset.word;
      const feedback = quiz.parentElement.querySelector(".answer-feedback");
      quiz.querySelectorAll(".option").forEach((button) => {
        button.addEventListener("click", () => {
          const answered = quiz.dataset.answered === "true";
          quiz.dataset.answered = "true";
          quiz.querySelectorAll(".option").forEach((option) => {
            option.classList.remove("correct", "wrong");
            if (option.dataset.choice === correct) option.classList.add("correct");
          });
          if (!answered) state.total += 1;
          if (button.dataset.choice === correct) {
            if (!answered) state.correct += 1;
            feedback.textContent = "Düzgün cavab! " + word + " - " + correct + ".";
            feedback.className = "answer-feedback success";
          } else {
            button.classList.add("wrong");
            if (!state.difficult.includes(word)) state.difficult.push(word);
            feedback.textContent = "Bu cavab səhvdir. Düzgün cavab yaşıl fonda göstərildi və söz Çətin Sözlər siyahısına əlavə edildi.";
            feedback.className = "answer-feedback retry";
          }
          renderState();
        });
      });
    });
    renderState();
  </script>
</body>
</html>`;
}

function renderReview(words) {
  const groups = groupByCategory(words);
  return Object.entries(groups).map(([category, items]) => `<div class="review-card"><h3>${escapeHtml(category)}</h3><ul class="review-list">${items.slice(0, 5).map((item) => `<li><strong>${escapeHtml(item.word)}</strong><span>${escapeHtml(item.translation)}</span></li>`).join("")}</ul></div>`).join("");
}

function renderCategory(category) {
  return `<section class="section"><div class="section-header"><h2>${escapeHtml(category.name)}</h2><span class="pill">${escapeHtml(category.theme || "focus")}</span></div><table><thead><tr><th>#</th><th>Söz</th><th>Tələffüz</th><th>Tərcümə</th><th>Nümunə cümlə</th></tr></thead><tbody>${category.words.map((item, index) => `<tr><td>${index + 1}</td><td><code>${escapeHtml(item.word)}</code></td><td>${escapeHtml(item.pronunciation)}</td><td>${escapeHtml(item.translation)}</td><td>${escapeHtml(item.sentence)}</td></tr>`).join("")}</tbody></table></section>`;
}

function renderFlipCard(item) {
  return `<div class="flip-card" role="button" tabindex="0" aria-label="${escapeHtml(item.word)} kartını çevir"><div class="flip-inner"><div class="flip-face"><strong>${escapeHtml(item.word)}</strong><span class="pronunciation">${escapeHtml(item.pronunciation)}</span><p class="note">Tərcüməni görmək üçün kliklə.</p></div><div class="flip-face flip-back"><strong>${escapeHtml(item.translation)}</strong><p>${escapeHtml(item.sentence)}</p></div></div></div>`;
}

function renderQuestion(item, index, pool) {
  const wrong = pool.filter((candidate) => candidate.translation !== item.translation).map((candidate) => candidate.translation);
  const options = shuffle(unique([item.translation, ...wrong]).slice(0, 4));
  while (options.length < 4) options.push(`Variant ${options.length + 1}`);
  return `<div class="question"><strong>${index + 1}. "${escapeHtml(item.word)}" nə deməkdir?</strong><p class="note">${escapeHtml(item.sentence)}</p><div class="options" data-quiz data-correct="${escapeHtml(item.translation)}" data-word="${escapeHtml(item.word)}">${options.map((option, optionIndex) => `<button class="option" type="button" data-choice="${escapeHtml(option)}">${["A", "B", "C", "D"][optionIndex]}. ${escapeHtml(option)}</button>`).join("")}</div><div class="answer-feedback" aria-live="polite"></div></div>`;
}

function validateLesson(lesson) {
  if (!lesson || !Array.isArray(lesson.categories) || lesson.categories.length !== 3) throw new Error("Lesson must include exactly 3 categories.");
  for (const category of lesson.categories) {
    if (!Array.isArray(category.words) || category.words.length !== 5) throw new Error(`Category ${category.name} must include exactly 5 words.`);
    for (const word of category.words) {
      for (const key of ["word", "translation", "pronunciation", "sentence"]) {
        if (!word[key]) throw new Error(`Missing ${key} in generated lesson.`);
      }
    }
  }
}

function validateHtml(html) {
  for (const marker of ["<!doctype html", "flip-card", "flip-inner", "localStorage", "data-correct", "apple-mobile-web-app-capable", "Monthly Vocabulary Certificate", "Çətin Sözlər"]) {
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueWords(words) {
  const seen = new Set();
  return words.filter((word) => {
    if (!word?.word || seen.has(word.word)) return false;
    seen.add(word.word);
    return true;
  });
}

function shuffle(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function formatBakuDate(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatDisplayDate(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function getBakuWeekday(date) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Baku", weekday: "short" }).format(date);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[label];
}

async function firstBusinessDayOfMonth(iso) {
  const [year, month] = iso.split("-").map(Number);
  for (let day = 1; day <= 7; day += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day, 8));
    const weekday = getBakuWeekday(candidate);
    if (weekday >= 1 && weekday <= 5) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return iso;
}

function monthName(iso) {
  const month = Number(iso.slice(5, 7));
  return ["Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun", "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"][month - 1];
}
