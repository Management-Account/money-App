// Paste your Supabase project values here (Supabase dashboard -> Project Settings -> API).
//
//  - SUPABASE_URL      looks like https://abcdxyz.supabase.co
//  - SUPABASE_ANON_KEY the "anon" / "publishable" key. It is meant to be public: your data is
//                      protected by the row-level security rules in supabase/schema.sql.
//                      NEVER put the "service_role" / "secret" key here.
//
// While these are empty the app runs in local-only mode (no accounts, no sync).
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Supabase only knows email logins, so the app turns a username like "alice" into a private
// address "alice@<domain>" behind the scenes. No email is ever sent, which is why "Confirm email"
// must be switched OFF in Supabase (see README). The domain only needs to look like a normal domain.
export const USERNAME_EMAIL_DOMAIN = 'pocketledger.app';
