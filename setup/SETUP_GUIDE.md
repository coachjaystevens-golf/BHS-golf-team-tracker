# Golf Team Tracker: setting up a new school

Each school gets its **own database** (Supabase) and its **own website** (Netlify), both free. All schools run the same app code from this GitHub repo, so every update reaches every school automatically.

Plan on about 45 minutes. You'll need a computer, not a phone.

---

## 1. Create the database (Supabase)

1. Go to **supabase.com** and sign in (or create a free account).
   *Note: the free plan allows 2 projects per account. If that account already has 2, the new school's coach should create the project under their own account.*
2. Click **New project**. Name it like `gallatin-golf-team-tracker`, pick region **East US (North Virginia)**, and save the database password somewhere safe.
3. Wait ~2 minutes for it to finish setting up.
4. Open **SQL Editor → New query**, paste everything from **`1_setup_database.sql`**, and click **Run**. You should see *Success. No rows returned.*
   - If anything fails, nothing is saved. Fix the problem (or send the error to whoever helps you) and run the whole file again.
5. **Optional:** if the team plays Country Hills, Long Hollow, Fairview, Foxland, Bluegrass or Sevierville Highlands, run **`2_optional_area_courses.sql`** the same way. It adds those courses with par, mapped greens and hazards, so GPS yardages work on day one. Run it only once.
6. **Authentication settings** (left menu → Authentication):
   - **Sign In / Providers → Email:** leave Email on.
   - **URL Configuration → Site URL:** set it to the school's website address from step 2 (for example `https://ghs-golf.netlify.app`). Come back and fill this in after step 2 if you don't have it yet. Password-reset emails use it.
   - **Attack Protection (or Password Security) → Leaked password protection:** turn it **on**.
7. Copy two values from **Project Settings → API** (or **Connect**): the **Project URL** and the **publishable (anon) key**. You need them in step 2.

## 2. Create the website (Netlify)

1. Go to **netlify.com**, sign in with GitHub, and click **Add new site → Import an existing project → GitHub**.
2. Choose the repo **`coachjaystevens-golf/BHS-golf-team-tracker`**.
3. Settings (Netlify usually fills these in from the repo's `netlify.toml`; just check them):
   - **Base directory:** `vitejs-vite-spjaholm`
   - **Build command:** `npm run build`
   - **Publish directory:** `vitejs-vite-spjaholm/dist`
4. Under **Environment variables**, add (names must be exactly this, all capitals):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL from step 1.7 |
   | `VITE_SUPABASE_ANON_KEY` | publishable (anon) key from step 1.7 |
   | `VITE_APP_NAME` | School's app name, e.g. `GHS Golf` (shows under the home-screen icon) |
   | `VITE_THEME_PRIMARY` | School main color as hex, e.g. `#0C2340` (optional) |
   | `VITE_THEME_ACCENT` | School second color, e.g. `#E87722` (optional) |
   | `VITE_GOLF_API_KEY` | GolfCourseAPI key for "Add a course" (free at golfcourseapi.com; each school should use its own) |

5. Click **Deploy**. When it's done, open **Site configuration → Change site name** to get a friendly address like `ghs-golf.netlify.app`.
6. If a deploy ever gets skipped or stuck, use **Deploys → Trigger deploy → Clear cache and deploy site**.

## 3. Make the coach account

1. Open the new website on your phone, tap **Sign up**, and create the coach's account with their email.
2. Back in Supabase **SQL Editor**, open **`3_make_me_coach.sql`**, change the email and name to the coach's, and **Run**.
3. Sign out and back in. The coach screens (Coach, Live, Rounds, Practice, More) appear.

## 4. First things in the app (as the coach)

1. **Manage → Seasons:** add the season (e.g. "2027 Season", late May to late May) and make it active.
2. **Manage → Roster:** add players. Each player gets a 6-letter **join code**; players sign up on their own phone and enter the code to link to their name.
3. **Manage → Courses** or **+ Add a course:** add any courses not loaded in step 1.5.
4. Tell players to add the app to their home screen (the app shows them how).

## 5. Keep the free database awake

Free Supabase projects pause after **7 days** with no activity, including all summer. This repo pings each school every 3 days so that never happens.

Ask the repo owner to add the new school to **`.github/workflows/keep-alive.yml`**: copy one of the existing "Ping" steps and swap in the new Project URL and publishable key. It's free.

---

## Good to know

- **Updates:** changes merged into the repo rebuild every school's website automatically. If a change needs a database update, it comes with a SQL file to run in each school's SQL Editor.
- **Privacy:** players only see their own scores. Team averages shown to players are totals across the team, and are hidden when fewer than 3 players have rounds.
- **Starting the next season:** Manage → Seasons → **Start next season** carries returning players forward, archives graduates (their stats are kept), and switches the active season.
- **Regenerating `1_setup_database.sql`:** it is a snapshot of the Beech database. After database changes, ask for it to be regenerated so new schools start with everything.
