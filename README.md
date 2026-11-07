# T-chatter

T-chatter is a mobile-first, installable web chat MVP built with static HTML/CSS/JavaScript, Supabase Auth, Postgres, RLS, and Realtime.

## Available in this MVP
- Email + password sign-up and sign-in through Supabase Auth.
- Password reset email.
- User profile creation after sign-in.
- One-to-one chat creation by the other user's registered email address.
- Private message storage in Supabase.
- Realtime incoming message updates.
- Downloadable T-chatter-only JSON chat backup.
- Same-account backup import as a read-only archive, with a restore-or-skip prompt after login.
- Responsive web app and PWA shell.

## Backup and restore
Use **Backup** while signed in to download a JSON archive of chats visible to your account. After login, choose a backup file or skip restoration. **Restore** validates that the file belongs to the same T-chatter account and displays its chats as a read-only archive on the current device. It does not overwrite live database messages or recreate messages attributed to other users. To restore on another device, securely transfer the backup file and select it there. Backup files contain private conversation contents; keep them secure.

## Not implemented yet
- Group chats and group administration.
- Voice notes, media uploads, and voice/video calls.
- Updates/Stories.
- End-to-end encryption.
- Admin dashboard.

Do not describe this MVP as end-to-end encrypted or as a replacement for a security-reviewed messenger.

## Supabase setup
The browser uses only the project's URL and publishable key from `supabase-config.js`. Never place a Supabase secret/service-role key in browser code.

Email/password authentication is handled by Supabase Auth. Hosted Supabase projects may require email confirmation; configure this in Supabase Dashboard > Authentication > Sign In / Providers > Email. Password reset emails use the configured Auth email templates and redirect URL allowlist.

## Database and privacy
The public tables are protected by Row Level Security. Chat members can read messages in their chats; users can insert messages only as themselves. The profile lookup currently uses registered email addresses to start a conversation, so use an email you are comfortable sharing with other signed-in T-chatter users.

## Deploy
The repository is connected to Vercel. Commits to `main` trigger production deployments.
