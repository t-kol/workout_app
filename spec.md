# Ironman Training Tracker — Build Spec for Claude Code

## Instructions to Claude Code

Build a single-user, mobile-friendly workout tracking web app per the spec below. This is a static site (no build step, no bundler) so it can be deployed directly to GitHub Pages. Use vanilla HTML/CSS/JS, Tailwind via CDN, Supabase JS client via CDN, PapaParse via CDN for CSV parsing.

Do **not** set up a Node build pipeline, bundler, or framework (no React/Vue/etc.) unless explicitly asked — the whole point is that `git push` is the entire deploy process.

Work through the "Implementation Phases" section in order, and treat each phase's checklist as its definition of done before moving to the next. Stop and ask if the Supabase URL/anon key placeholders aren't filled in yet — don't fabricate credentials.

---

## 1. Tech Stack (fixed — do not substitute)

- **Frontend:** Plain HTML + JS (ES modules OK), Tailwind CSS via CDN (`<script src="https://cdn.tailwindcss.com">`)
- **Backend:** Supabase (Postgres + Auth + JS client via CDN, e.g. `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`)
- **CSV parsing:** PapaParse via CDN
- **Hosting target:** GitHub Pages (static files served from repo root or `/docs`)

---

## 2. File Structure to Create

```
/
├── index.html          # Login page (redirects to app.html if already authed)
├── app.html            # Main app shell (Today / Calendar / Import tabs)
├── manifest.json        # PWA manifest for "add to home screen"
├── /css
│   └── style.css        # Any custom CSS beyond Tailwind utilities
├── /js
│   ├── supabaseClient.js  # Supabase init — SUPABASE_URL and SUPABASE_ANON_KEY as constants at top
│   ├── auth.js             # login/logout/session check
│   ├── today.js            # Today view logic (fetch, checklist render, day navigation)
│   ├── logging.js          # Quick-log sheet for marking a session complete + entering actuals
│   ├── calendar.js         # Calendar/History tab logic
│   ├── import.js           # CSV upload, parse, validate, preview, upsert
│   └── crud.js              # Shared add/edit/delete session helpers
├── /icons               # App icons for manifest (any placeholder sizes: 192x192, 512x512)
└── spec.md               # this file, kept in repo for reference
```

Put the Supabase URL and anon key as clearly-marked constants at the top of `supabaseClient.js`:

```js
const SUPABASE_URL = "REPLACE_ME";
const SUPABASE_ANON_KEY = "REPLACE_ME";
```

I will fill these in myself after creating the Supabase project — leave them as placeholders and don't block other work on them.

---

## 3. Data Model

Run this SQL in the Supabase SQL editor (I will do this manually — Claude Code should still know the schema to write correct queries against it):

```sql
create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  date date not null,
  discipline text not null check (discipline in ('swim','bike','run','brick','lift','mobility','other')),
  session_slot text not null default 'WO1',
  title text not null,
  description text,
  planned_duration_min integer,
  planned_distance_km numeric,
  planned_intensity text,
  notes text,
  created_at timestamptz default now()
);

alter table workouts enable row level security;

create policy "Users manage their own workouts"
  on workouts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) default auth.uid(),
  completed boolean not null default false,
  completed_at timestamptz,
  actual_duration_min integer,
  actual_distance_km numeric,
  actual_pace text,
  lift_detail jsonb,
  rpe integer check (rpe between 1 and 10),
  notes text,
  created_at timestamptz default now()
);

alter table workout_logs enable row level security;

create policy "Users manage their own logs"
  on workout_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_workouts_date on workouts(date);
create index idx_logs_workout_id on workout_logs(workout_id);
```

`lift_detail` example shape: `[{"exercise":"Back Squat","sets":4,"reps":6,"weight_kg":80}, {"exercise":"RDL","sets":3,"reps":8,"weight_kg":60}]`

---

## 4. CSV Import Format

Columns: `date` (YYYY-MM-DD), `discipline` (swim/bike/run/brick/lift/mobility/other), `session_slot` (optional, defaults `WO1`), `title`, `description` (optional), `planned_duration_min` (optional), `planned_distance_km` (optional), `planned_intensity` (optional), `notes` (optional).

Import behavior: **upsert** on `(date, discipline, session_slot)` — never duplicate rows, never touch existing `workout_logs`.

---

## 5. Functional Requirements

### Auth (index.html + auth.js)
- [ ] Email/password login form using Supabase Auth
- [ ] On successful login, redirect to `app.html`
- [ ] On load, check for existing session; skip login if already authenticated
- [ ] Logout button available somewhere in the app shell

### Today view (default tab on app load)
- [ ] Loads current date's `workouts` rows on page load, joined with any existing `workout_logs`
- [ ] Header shows the date in readable format with ◀ / ▶ arrows to move ±1 day, plus a "Today" button to jump back
- [ ] Sessions grouped/ordered by `session_slot`
- [ ] Each session is a checklist row: checkbox + title + discipline icon/color
- [ ] Tapping the checkbox opens a quick-log modal/sheet:
  - Endurance disciplines (swim/bike/run/brick): actual duration, distance, pace, RPE, notes
  - Lift discipline: repeatable exercise rows (name, sets, reps, weight), RPE, notes
  - Saving writes to `workout_logs` and marks checkbox complete
- [ ] Tapping the title (not checkbox) expands to show `description`/`notes` without marking complete
- [ ] "+" control to add an ad-hoc session for the visible day (writes a new `workouts` row directly)
- [ ] Edit/delete control on each session (deletes cascade to its log)

### Calendar / History tab
- [ ] Month grid, current month on load, prev/next month navigation
- [ ] Each day cell shows small indicator dots per discipline present that day, plus a checkmark/highlight if all sessions for that day are completed
- [ ] Tapping a day navigates to that day's detail (reuse Today view's rendering logic, just not defaulting to "today")

### Import tab
- [ ] File picker for `.csv`
- [ ] Parse client-side with PapaParse
- [ ] Show a preview table of parsed rows before committing
- [ ] Validate: required columns present, valid date format, discipline is one of the allowed enum values — flag bad rows in the preview, don't block importing the valid ones
- [ ] "Confirm Import" button performs the upsert described in Section 4

### Mobile / PWA
- [ ] Responsive single-column layout on narrow viewports, tap targets ≥ 44px
- [ ] `manifest.json` with app name, icons, theme color, `display: standalone`
- [ ] Link manifest + apple-touch-icon meta tags in `<head>` of both HTML files

---

## 6. Implementation Phases (build in this order)

**Phase 1 — Shell & Auth**
- `index.html` login page, `supabaseClient.js`, `auth.js`, session check/redirect logic
- Done when: I can log in with a Supabase account and land on an empty `app.html`

**Phase 2 — Today View (read-only first)**
- `app.html` tab shell (Today / Calendar / Import, Today active by default)
- `today.js`: fetch and render a day's sessions (checkbox display only, no write yet), day navigation arrows
- Done when: sessions for any date I navigate to display correctly, grouped by session_slot

**Phase 3 — Logging**
- `logging.js`: quick-log modal, writes to `workout_logs`, checkbox reflects completion state on reload
- Done when: I can check off a session, enter actuals appropriate to its discipline, and see it persist

**Phase 4 — Add/Edit/Delete**
- `crud.js`: add ad-hoc session, edit existing session, delete session (with log cascade)
- Done when: I can fully manage a day's sessions without touching the database directly

**Phase 5 — CSV Import**
- `import.js`: upload, parse, validate, preview, confirm/upsert
- Done when: a sample CSV (I'll provide one matching Section 4's format) imports correctly and re-importing it doesn't duplicate or wipe logs

**Phase 6 — Calendar/History**
- `calendar.js`: month grid, indicators, day drill-in
- Done when: navigating months and tapping a day both work correctly

**Phase 7 — Mobile Polish**
- `manifest.json`, icons, responsive audit, tap target sizing
- Done when: the app is usable one-handed on a phone and can be added to the home screen

---

## 7. Explicitly Out of Scope for v1
- Offline support / service worker caching
- Push notifications
- Adherence stats / charts
- Editing past plan data in bulk (only via re-import or per-session edit)
- Multi-user support of any kind
