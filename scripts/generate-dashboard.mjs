import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const publicPath = path.join(root, "public", "index.html");
const outputPath = path.join(root, "outputs", "daily-english-dashboard.html");
const statePath = path.join(root, "data", "dashboard-state.json");

const currentHtml = await fs.readFile(outputPath, "utf8");
assertFullTemplate(currentHtml);

const state = JSON.parse(await fs.readFile(statePath, "utf8"));
const todayIso = formatBakuDate(new Date());
const displayDate = formatDisplayDate(todayIso);
const dayIndex = Number(state.dayIndex || 0) + 1;
const previousWords = Array.isArray(state.currentWords) && state.currentWords.length
  ? state.currentWords
  : fallbackPreviousWords();

const lesson = pickLesson(state.usedWords || []);
const todayWords = lesson.categories.flatMap((category) =>
  category.words.map((word) => ({ ...word, category: category.name }))
);

const learnedThisWeek = Math.min(75, dayIndex * 15);
const learnedThisMonth = Math.min(300, dayIndex * 15);
const weeklyPercent = Math.round((learnedThisWeek / 75) * 100);
const monthlyPercent = Math.round((learnedThisMonth / 300) * 100);
const level = learnedThisMonth >= 300 ? "Advanced" : learnedThisMonth >= 150 ? "Intermediate" : "Beginner";
const weeklyTestActive = getWeekday(todayIso) === 5;
const monthlyExamActive = isFirstBusinessDay(todayIso);

let html = currentHtml;
html = replaceTitleAndHero(html, { dayIndex, displayDate });
html = replaceStatsAndProgress(html, { dayIndex, learnedThisWeek, learnedThisMonth, weeklyPercent, monthlyPercent, level });
html = replaceSection(html, /<section class="section">\s*<div class="section-header"><h2>Qısa Təkrar<\/h2>[\s\S]*?<\/section>/, renderReviewSection(previousWords));
html = replaceSection(html, /<section class="section blue">[\s\S]*?<\/section>/, renderCategorySection("blue", "Maliyyə Auditi", "Mavi fokus", todayWords.filter((item) => item.category === "Maliyyə auditi")));
html = replaceSection(html, /<section class="section teal">[\s\S]*?<\/section>/, renderCategorySection("teal", "IT", "Yaşıl fokus", todayWords.filter((item) => item.category === "IT")));
html = replaceSection(html, /<section class="section gold">[\s\S]*?<\/section>/, renderCategorySection("gold", "Gündəlik Danışıq", "Qızılı fokus", todayWords.filter((item) => item.category === "Gündəlik danışıq")));
html = replaceSection(html, /<section class="section">\s*<div class="section-header"><h2>Flip Card Rejimi<\/h2>[\s\S]*?<\/section>/, renderFlipSection(todayWords.slice(0, 6)));
html = replaceSection(html, /<section class="section">\s*<div class="section-header"><h2>Test Mərkəzi<\/h2>[\s\S]*?<\/section>/, renderTestCenterSection({ dayIndex, weeklyTestActive, monthlyExamActive }));
html = replaceSection(html, /<section class="section">\s*<div class="section-header"><h2>Aylıq Sertifikat Kartı<\/h2>[\s\S]*?<\/section>/, renderCertificateSection({ learnedThisMonth, level, displayDate }));
html = replaceJsArray(html, "todayWords", todayWords.map((item) => [item.word, item.translation, item.category]));
html = replaceJsArray(html, "reviewWords", previousWords.map((item) => [item.word, item.translation, item.category]));
html = replaceJsArray(html, "distractors", unique([...previousWords, ...todayWords].map((item) => item.translation)));
html = replaceQuestionBank(html, "todayQuestionBank", todayWords);
html = replaceQuestionBank(html, "reviewQuestionBank", previousWords);
html = html.replace(/const storageKey = "premiumVocabularyLab";\s*const state = JSON\.parse\(localStorage\.getItem\(storageKey\) \|\| '\{"streak":\d+,"correct":0,"total":0,"difficult":\[\],"customWords":\[\]\}'\);/, `const storageKey = "premiumVocabularyLab";\n    const state = JSON.parse(localStorage.getItem(storageKey) || '{"streak":${dayIndex},"correct":0,"total":0,"difficult":[],"customWords":[]}');`);
html = html.replace(/document\.getElementById\("streakValue"\)\.textContent = `\$\{state\.streak \|\| \d+\} gün`;/, `document.getElementById("streakValue").textContent = \`\${state.streak || ${dayIndex}} gün\`;`);

validateHtml(html);

const history = Array.isArray(state.history) ? state.history : [];
history.push({
  dayIndex,
  date: todayIso,
  words: todayWords
});

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
  history: history.slice(-31),
  notes: "Dashboard local generator ilə yenilənir; premium HTML şablonu saxlanılır."
};

await fs.writeFile(outputPath, html, "utf8");
await fs.writeFile(publicPath, html, "utf8");
await fs.writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");

console.log(`Dashboard updated for ${todayIso} as Gün ${dayIndex}.`);
console.log(todayWords.map((item) => item.word).join(", "));

function pickLesson(usedWords) {
  const used = new Set((usedWords || []).map((item) => item.toLowerCase()));
  const candidate = getLessonBank().find((lesson) => lesson.categories.every((category) =>
    category.words.every((word) => !used.has(word.word.toLowerCase()))
  ));
  if (!candidate) {
    throw new Error("No unique lesson left in the local lesson bank.");
  }
  return candidate;
}

function replaceTitleAndHero(html, data) {
  const { dayIndex, displayDate } = data;
  let next = html;
  next = next.replace(/<title>Premium English Vocabulary Lab - Gün \d+<\/title>/, `<title>Premium English Vocabulary Lab - Gün ${dayIndex}</title>`);
  next = next.replace(/Bugünkü dashboard Gün \d+ üçün yeniləndi\./g, `Bugünkü dashboard Gün ${dayIndex} üçün yeniləndi.`);
  next = next.replace(/<span>Gün \d+<\/span>\s*<strong>\d{2}\.\d{2}\.\d{4}<\/strong>/, `<span>Gün ${dayIndex}</span>\n          <strong>${displayDate}</strong>`);
  return next;
}

function replaceStatsAndProgress(html, data) {
  const { dayIndex, learnedThisWeek, learnedThisMonth, weeklyPercent, monthlyPercent, level } = data;
  let next = html;
  next = next.replace(/<div class="stat"><span>Həftəlik sözlər<\/span><strong>\d+<\/strong><\/div>/, `<div class="stat"><span>Həftəlik sözlər</span><strong>${learnedThisWeek}</strong></div>`);
  next = next.replace(/<div class="stat"><span>Aylıq sözlər<\/span><strong>\d+<\/strong><\/div>/, `<div class="stat"><span>Aylıq sözlər</span><strong>${learnedThisMonth}</strong></div>`);
  next = next.replace(/<div class="stat"><span>Streak<\/span><strong id="streakValue">\d+ gün<\/strong><\/div>/, `<div class="stat"><span>Streak</span><strong id="streakValue">${dayIndex} gün</strong></div>`);
  next = next.replace(/<div class="feature-card"><h3>Həftəlik progress<\/h3><p>Hədəf: 75 söz\. Hazırda: \d+ söz\.<\/p><div class="progress-track"><div class="progress-fill" style="--value:\d+%"><\/div><\/div><\/div>/, `<div class="feature-card"><h3>Həftəlik progress</h3><p>Hədəf: 75 söz. Hazırda: ${learnedThisWeek} söz.</p><div class="progress-track"><div class="progress-fill" style="--value:${weeklyPercent}%"></div></div></div>`);
  next = next.replace(/<div class="feature-card"><h3>Aylıq progress<\/h3><p>Hədəf: 300 söz\. Hazırda: \d+ söz\.<\/p><div class="progress-track"><div class="progress-fill" style="--value:\d+%"><\/div><\/div><\/div>/, `<div class="feature-card"><h3>Aylıq progress</h3><p>Hədəf: 300 söz. Hazırda: ${learnedThisMonth} söz.</p><div class="progress-track"><div class="progress-fill" style="--value:${monthlyPercent}%"></div></div></div>`);
  next = next.replace(/İndiki mərhələ: (Beginner|Intermediate|Advanced)\./, `İndiki mərhələ: ${level}.`);
  next = next.replace(/<span class="level(?: active)?">Beginner<\/span><span class="level(?: active)?">Intermediate<\/span><span class="level(?: active)?">Advanced<\/span>/, ["Beginner", "Intermediate", "Advanced"].map((item) => `<span class="level${item === level ? " active" : ""}">${item}</span>`).join(""));
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
      <div class="practice">
        <p class="note">Bugünkü dərsdən əvvəl əvvəlki 15 sözə qısa baxış et. Təkrar blokundakı sözlər test mərkəzində ayrıca 4 variantlı interaktiv formatda saxlanılır.</p>
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

function renderTestCenterSection({ dayIndex, weeklyTestActive, monthlyExamActive }) {
  return `<section class="section">
      <div class="section-header"><h2>Test Mərkəzi</h2><span class="pill" style="background:#fff1f3;color:var(--rose);">4 variantlı practice</span></div>
      <div class="module-grid">
        <div class="module-card">
          <h3>Bugünkü 15 söz testi</h3>
          <p class="note">Gün ${dayIndex} sözləri üzrə interaktiv suallar ayrıca pəncərədə açılır. Düzgün cavab yaşıl, səhv cavab qırmızı/çəhrayı görünür.</p>
          <button class="primary-action" type="button" data-open-tests data-test-mode="today">Bugünkü testi aç</button>
        </div>
        <div class="module-card">
          <h3>Əvvəlki dərsin təkrar testi</h3>
          <p class="note">Dünən öyrədilən 15 söz üçün qısa təkrar testi açılır. Səhv cavab verilən sözlər localStorage ilə Çətin Sözlər bölməsinə düşür.</p>
          <button class="primary-action" type="button" data-open-tests data-test-mode="review">Təkrar testini aç</button>
        </div>
        <div class="module-card">
          <h3>Həftəlik test statusu</h3>
          <p class="note">${weeklyTestActive ? "Bu gün cümədir; həftənin 75 sözü üzrə ayrıca 4 variantlı test aktivləşdirilməlidir." : "Bu gün cümə deyil; həftəlik 75 söz testi növbəti cümə günü əlavə olunacaq."}</p>
        </div>
        <div class="module-card">
          <h3>Aylıq imtahan statusu</h3>
          <p class="note">${monthlyExamActive ? "Bu gün ayın ilk iş günüdür; aylıq 300 söz imtahanı aktivləşdirilməlidir." : "Ayın ilk iş günü olmadığı üçün aylıq imtahan bölməsi bu gün yalnız status kartı kimi saxlanılır."}</p>
        </div>
      </div>
    </section>`;
}

function renderCertificateSection({ learnedThisMonth, level, displayDate }) {
  return `<section class="section">
      <div class="section-header"><h2>Monthly Vocabulary Certificate</h2><span class="pill" style="background:#fff7df;color:var(--gold);">Monthly report</span></div>
      <div class="certificate"><div class="certificate-card">
        <p class="eyebrow" style="color:#8a5a16;opacity:1;">Premium Vocabulary Certificate</p>
        <h3>İyun 2026 nəticə kartı</h3>
        <p class="note">Son yeniləmə: ${displayDate}. Ay sonunda burada öyrənilən söz sayı, test faizi, streak və level yekunu göstərilir.</p>
        <div class="dashboard-grid" style="padding:0;margin-top:18px;"><div class="feature-card"><h3>Öyrənilən sözlər</h3><p>${learnedThisMonth} / 300</p></div><div class="feature-card"><h3>Test nəticəsi</h3><p id="testScore">Cavab gözlənilir</p></div><div class="feature-card"><h3>Status</h3><p>${level} mərhələsi aktivdir</p></div></div>
      </div></div>
    </section>`;
}

function replaceSection(html, pattern, replacement) {
  if (!pattern.test(html)) {
    throw new Error(`Section pattern not found: ${pattern}`);
  }
  return html.replace(pattern, replacement);
}

function replaceJsArray(html, name, values) {
  const serialized = values.map((value) => `      ${JSON.stringify(value)}`).join(",\n");
  const pattern = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n    \\];`);
  if (!pattern.test(html)) {
    throw new Error(`Array not found: ${name}`);
  }
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
    options: buildWordOptions(item.word, words.map((word) => word.word), index)
  }));
  const serialized = questions.map((item) => `      ${JSON.stringify(item)}`).join(",\n");
  const pattern = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n    \\];`);
  if (!pattern.test(html)) {
    throw new Error(`Question bank not found: ${name}`);
  }
  return html.replace(pattern, `const ${name} = [\n${serialized}\n    ];`);
}

function buildWordOptions(correctWord, allWords, index) {
  const options = [correctWord];
  const pool = allWords.filter((word) => word !== correctWord);
  for (let step = 0; options.length < 4 && step < pool.length + 6; step += 1) {
    const candidate = pool[(index * 2 + step) % pool.length];
    if (candidate && !options.includes(candidate)) {
      options.push(candidate);
    }
  }
  return options;
}

function sentenceWithBlank(sentence, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");
  return regex.test(sentence) ? sentence.replace(regex, "______") : `${sentence} (${word}: ______)`;
}

function assertFullTemplate(html) {
  const required = [
    "apple-mobile-web-app-capable",
    "flip-card",
    "flip-inner",
    "data-correct",
    "localStorage",
    "dictionaryModal",
    "bindTooltipWords"
  ];
  for (const marker of required) {
    if (!html.includes(marker)) {
      throw new Error(`Missing required template marker: ${marker}`);
    }
  }
}

function validateHtml(html) {
  const required = [
    "flip-card",
    "localStorage",
    "data-correct",
    "apple-mobile-web-app-capable",
    "Monthly Vocabulary Certificate",
    "data-open-tests",
    "bindTooltipWords"
  ];
  for (const marker of required) {
    if (!html.includes(marker)) {
      throw new Error(`Generated HTML is missing marker: ${marker}`);
    }
  }
}

function groupByCategory(words) {
  return words.reduce((acc, item) => {
    const category = item.category || "Təkrar";
    acc[category] ||= [];
    acc[category].push(item);
    return acc;
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
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatBakuDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDisplayDate(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function getWeekday(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isFirstBusinessDay(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  for (let current = 1; current <= 7; current += 1) {
    const weekday = new Date(Date.UTC(year, month - 1, current)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      return day === current;
    }
  }
  return false;
}

function fallbackPreviousWords() {
  return [
    { word: "Compliance audit", translation: "Uyğunluq auditi", pronunciation: "kəmˈplaɪəns ˈɔːdɪt", sentence: "The compliance audit ensures the organization follows legal standards.", category: "Maliyyə auditi" },
    { word: "Risk assessment", translation: "Risk qiymətləndirilməsi", pronunciation: "rɪsk əˈsesmənt", sentence: "We performed a risk assessment before the financial audit.", category: "Maliyyə auditi" },
    { word: "Internal control testing", translation: "Daxili nəzarət testləri", pronunciation: "ɪnˈtɜrnəl kənˈtroʊl ˈtestɪŋ", sentence: "Internal control testing helps identify potential weaknesses.", category: "Maliyyə auditi" },
    { word: "Two-factor authentication", translation: "İki faktorlu identifikasiya", pronunciation: "tuː ˈfæktər ɔːˌθentɪˈkeɪʃən", sentence: "Two-factor authentication increases security for user accounts.", category: "IT" },
    { word: "Data mining", translation: "Veri mədənçiliyi", pronunciation: "ˈdeɪtə ˈmaɪnɪŋ", sentence: "Data mining helps discover patterns in large datasets.", category: "IT" },
    { word: "Hit the road", translation: "Yola çıxmaq", pronunciation: "hɪt ðə roʊd", sentence: "We decided to hit the road early to avoid traffic.", category: "Gündəlik danışıq" }
  ];
}

function getLessonBank() {
  return [
  {
    categories: [
      {
        name: "Maliyyə auditi",
        words: [
          { word: "Substantive procedure", translation: "Mahiyyət üzrə audit proseduru", pronunciation: "səbˈstæntɪv prəˈsiːdʒər", sentence: "The auditor designed a substantive procedure for revenue testing." },
          { word: "Working papers", translation: "İşçi sənədlər", pronunciation: "ˈwɜːrkɪŋ ˈpeɪpərz", sentence: "All findings were documented in the working papers." },
          { word: "Going concern", translation: "Fəaliyyətin davamlılığı", pronunciation: "ˌɡoʊɪŋ kənˈsɜːrn", sentence: "The team evaluated whether the company remains a going concern." },
          { word: "Cutoff test", translation: "Dövrə aid etmə testi", pronunciation: "ˈkʌtɔf test", sentence: "We performed a cutoff test on year-end sales transactions." },
          { word: "Analytical review", translation: "Analitik baxış", pronunciation: "ˌænəˈlɪtɪkəl rɪˈvjuː", sentence: "Analytical review highlighted unusual expense trends." }
        ]
      },
      {
        name: "IT",
        words: [
          { word: "Uptime", translation: "Sistemin fasiləsiz işləmə vaxtı", pronunciation: "ˈʌptaɪm", sentence: "The dashboard tracks server uptime every hour." },
          { word: "Access token", translation: "Giriş tokeni", pronunciation: "ˈækses ˈtoʊkən", sentence: "The mobile app refreshes the access token automatically." },
          { word: "Version control", translation: "Versiya nəzarəti", pronunciation: "ˈvɜːrʒən kənˈtroʊl", sentence: "Version control helps the team review code changes safely." },
          { word: "Containerization", translation: "Konteynerləşdirmə", pronunciation: "kənˌteɪnərəˈzeɪʃən", sentence: "Containerization made the deployment pipeline more consistent." },
          { word: "Failover", translation: "Ehtiyat keçid mexanizmi", pronunciation: "ˈfeɪloʊvər", sentence: "Failover keeps the service online during a primary outage." }
        ]
      },
      {
        name: "Gündəlik danışıq",
        words: [
          { word: "Wrap up", translation: "Yekunlaşdırmaq", pronunciation: "ræp ʌp", sentence: "Let’s wrap up the meeting before lunch." },
          { word: "No worries", translation: "Problem deyil", pronunciation: "noʊ ˈwɜːriz", sentence: "No worries, I can send the file again." },
          { word: "Keep in touch", translation: "Əlaqədə qalmaq", pronunciation: "kiːp ɪn tʌtʃ", sentence: "We should keep in touch after the training ends." },
          { word: "Run late", translation: "Gecikmək", pronunciation: "rʌn leɪt", sentence: "I might run late because of traffic this evening." },
          { word: "Check in", translation: "Yoxlamaq, xəbər almaq", pronunciation: "tʃek ɪn", sentence: "I will check in with you after the client call." }
        ]
      }
    ]
  }
  ];
}
