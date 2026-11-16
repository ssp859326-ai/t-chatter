# T-Chatter

T-Chatter is a mobile-first messaging web app using Supabase Auth, Postgres, Realtime, private Storage, and browser WebRTC.

## Features
- Username + password account creation and sign-in; no phone number, OTP, or email address is entered by the user.
- Unique usernames for finding other T-Chatter accounts.
- One-to-one private chats and realtime text messages.
- Voice notes recorded in the browser and stored in a private media bucket.
- Status updates with text, photos, or videos; updates expire after 24 hours and are visible to chat contacts.
- One-to-one voice and video calls using WebRTC, with microphone/camera permission prompts.
- Responsive web app and installable PWA shell.

## Account model
Supabase Auth's password provider requires an email or phone identity. T-Chatter creates an internal, non-routable email-shaped identifier from the username on the server, then uses Supabase's password authentication. Users only see and enter their username and password. No email address or phone number is collected for sign-in. Because there is no recovery contact, users must keep their password safe; password recovery is not currently available.

The username-auth Edge Function uses the server-side Supabase service key to create confirmed auth accounts. That key is never included in browser code. The browser uses only the project URL and publishable key from supabase-config.js.

## Privacy and security
- Public database tables have Row Level Security policies.
- Chat messages and chat media are scoped to chat participants.
- The media bucket is private; signed URLs are short-lived.
- Usernames are discoverable by signed-in T-Chatter users so they can start chats.
- Statuses are visible only to the owner and users who share a chat with them.
- Call signaling is limited to members of the associated chat.

T-Chatter is **not end-to-end encrypted** and should not be described as a security-reviewed replacement for a mature messenger. Supabase transport encryption and database access policies are not the same as end-to-end encryption.

## Calls
Calls use browser WebRTC with public STUN servers. HTTPS, a supported browser, and microphone/camera permissions are required. Some network combinations may need a TURN relay service for reliable connectivity; no TURN service is configured in this version. Calls require both users to have T-Chatter open and online.

## Database
The database schema includes profiles, chats, chat_members, messages, usernames, statuses, and call_signals. Storage uses the private t-chatter-media bucket. Realtime is enabled for messages, statuses, and call signaling.

## Deploy
The repository is connected to Vercel. Commits to main trigger production deployments.
