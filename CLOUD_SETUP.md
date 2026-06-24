# Cloud Daily Dashboard Setup

Bu quruluş kompüter bağlı olanda da dashboard-un yenilənməsi üçündür.

## Canlı Sayt

Sayt GitHub Pages üzərindən yayımlanacaq.

Link formatı belə olacaq:

```text
https://GITHUB_USERNAME.github.io/REPOSITORY_NAME/
```

Repository GitHub-a push ediləndən və ilk workflow uğurlu işləyəndən sonra dəqiq link `Actions -> Daily English Dashboard` run nəticəsində görünəcək.

## Lazım Olan Secret

GitHub repository `Settings -> Secrets and variables -> Actions -> Repository secrets` bölməsində yalnız bunu əlavə et:

- `OPENAI_API_KEY`: OpenAI API açarı. HTML dərsini AI bununla yeniləyir.

İstəyə bağlı GitHub variable:

- `OPENAI_MODEL`: məsələn `gpt-4.1-mini`. Boş qalsa workflow default modeldən istifadə edir.

## GitHub Pages Ayarı

Repository-də bunu aktiv et:

1. `Settings`
2. `Pages`
3. `Build and deployment`
4. `Source`: `GitHub Actions`

## İşləmə Qaydası

`.github/workflows/daily-dashboard.yml` hər gün `06:00 UTC` vaxtında işləyir. Bu, Bakı vaxtı ilə `10:00` deməkdir.

Workflow:

1. Repository-ni açır.
2. `scripts/generate-dashboard.mjs` ilə AI vasitəsilə dashboard-u yeniləyir.
3. `public/index.html`, `outputs/daily-english-dashboard.html` və `data/dashboard-state.json` fayllarını commit edir.
4. `public` qovluğunu GitHub Pages-ə deploy edir.
5. Canlı linkdə `flip-card`, `localStorage`, `data-correct` və iPhone web-app markerlərini yoxlayır.

## Xərc

- GitHub Pages: $0
- GitHub Actions: bu gündəlik kiçik workflow üçün adətən $0
- Netlify: istifadə olunmur
- OpenAI API: təxminən $2-5/ay, istifadə olunan model və token sayından asılıdır

## Manual Test

GitHub-da `Actions -> Daily English Dashboard -> Run workflow` seçərək gözləmədən test etmək olar.
