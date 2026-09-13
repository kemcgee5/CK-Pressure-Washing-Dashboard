// ============================================================
//  CK Pressure Washing — deployment settings
//  Fill this in ONCE. You never have to touch it again.
// ============================================================
//
//  This is the only file that knows about your Supabase project. The
//  dashboard itself (index.html) reads its settings from here, which means
//  every future version of the dashboard drops straight in without you
//  re-entering anything.
//
//  WHERE TO FIND THESE: Supabase → your project → Settings → API Keys
//  (or the "Connect" button at the top of the project). You want the
//  Project URL and the PUBLISHABLE key (older projects call it the "anon"
//  key — either works).
//
//  NEVER put the "secret" key (or the older "service_role" key) in this
//  file. That one bypasses all your security rules. The publishable/anon
//  key is designed to sit in a web page — Row Level Security in your
//  database is what actually protects your data — so it's safe to commit
//  this file to GitHub.

window.CK_CONFIG = {

  // Your Project URL — looks like https://abcdefghijklm.supabase.co
  supabaseUrl: 'https://uanghzuketepjencbebw.supabase.co',

  // Your publishable (or anon) key — a long string starting with
  // sb_publishable_ on newer projects, or eyJ... on older ones.
  supabaseKey: 'sb_publishable_kx-z6hgtOSgXEl6wzBm3kg_NJqfnZQI',

  // Which business this deployment is for. This matches the "slug" column
  // in your "tenants" table and is what keeps each client's data separate.
  // Change this (and nothing else) to point the same dashboard at a
  // different client.
  tenantSlug: 'ck-pressure-washing',

  // The Supabase Storage bucket holding job photos and logos.
  photoBucket: 'job-photos'

};
