// Public values only (the anon key is safe in the browser; data is protected by row-level security).
window.GOMI = {
  SUPABASE_URL: 'https://lsvcpblpycvqnagxfvlz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdmNwYmxweWN2cW5hZ3hmdmx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NTgyMTksImV4cCI6MjEwOTIzNDIxOX0.g7vEG9OAMEjPBGjpZh-PBknHQNReQL-RscXMaF7l1oI',
  STORE_NAME: 'Gomi Insulation',
  CURRENCY: '$',
  ANNOUNCEMENT: 'Use code WELCOME10 for 10% off your first order',
  // Set to true after deploying the Stripe edge functions (see README).
  PAYMENTS: false,
  // Competitor prices older than this many days are hidden from customers.
  COMPARE_MAX_DAYS: 30,
  // Default look for first-time visitors (admins change the live site style from the account menu, which is saved site-wide). e.g. { accent: 'blue', radius: 'pill' }
  DEFAULT_THEME: {},
};
