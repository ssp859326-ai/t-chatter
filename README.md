# T-chatter

T-chatter is a mobile-first, installable web chat MVP built with static HTML/CSS/JavaScript, Supabase Auth, Postgres, RLS, and Realtime.

## Available in this MVP
- Google sign-in through Supabase Auth (requires provider credentials to be configured).
- User profile creation after sign-in.
- One-to-one chat creation by the other user's registered email address.
- Private message storage in Supabase.
- Realtime incoming message updates.
- Responsive web app and PWA shell.

## Not implemented yet
- Group chats and group administration.
- Voice notes, media uploads, and voice/video calls.
- Updates/Stories.
- End-to-end encryption.
- Admin dashboard.

Do not describe this MVP as end-to-end encrypted or as a replacement for a security-reviewed messenger.

## Supabase setup
The browser uses only the project's URL and publishable key from `supabase-config.js`. Never place a Supabase secret/service-role key in browser code.

Google sign-in must be configured separately:
1. In Google Cloud Console, create an OAuth Client ID with application type **Web application**.
2. Add the deployed app origin (for example `https://t-chatter.vercel.app`) to **Authorized JavaScript origins**.
3. Add the Supabase project's Auth callback URL shown in Supabase Dashboard > Authentication > Sign In / Providers > Google to **Authorized redirect URIs** in Google Cloud.
4. Copy the Google Client ID and Client Secret into Supabase Dashboard > Authentication > Sign In / Providers > Google and enable the provider.
5. In Supabase Authentication URL Configuration, set the Site URL to `https://t-chatter.vercel.app` and allow `https://t-chatter.vercel.app/**` as a redirect URL.

## Database and privacy
The public tables are protected by Row Level Security. Chat members can read messages in their chats; users can insert messages only as themselves. The profile lookup currently uses registered email addresses to start a conversation, so use an email you are comfortable sharing with other signed-in T-chatter users.

## Deploy
The repository is connected to Vercel. Commits to `main` trigger production deployments.
