# CK Pressure Washing — Business Dashboard

This replaces the old Google Sheets / Apps Script "Driveway Dashboard" with
a live, web-based dashboard: jobs & invoicing, before/after job photos, and
Stonewood Creek neighborhood targeting — all in one page.

The full setup — exact SQL, the photo storage bucket, GitHub, and Vercel —
is in the "Shipping CK Pressure Washing" guide Claude published as an
Artifact. Short version:

1. Set up a Supabase project: run the SQL from the guide to create the
   `jobs`, `job_photos`, and `leads` tables, then create a **public**
   Storage bucket named `job-photos` and add the two upload/read policies
   from the guide.
2. Open `index-supabase.html`, paste in your Project URL and anon key
   (Project Settings → Integrations → Data API, and → API Keys), save, and
   rename it to `index.html`.
3. Push it to a new GitHub repo (e.g. `ck-pressure-washing-dashboard`) and
   import that repo into Vercel, same as the Fieldline setup.

Until Supabase is connected, this file shows sample data automatically and
is safe to deploy as-is — the badge next to "CK Pressure Washing" reads
"Demo · Sample Data" until real credentials are filled in, then flips to
"Live · Supabase."

**Sign-in is now built in.** `index-supabase.html` includes a login screen
and only shows data to accounts granted access via the `memberships` table
— see the "Adding Real Sign-In" guide Claude published for the exact SQL.
Run that guide's migration in the same Supabase project as Fieldline
*before* following the setup steps above — the table-creation SQL below is
superseded by the tenant-scoped version in that guide.
