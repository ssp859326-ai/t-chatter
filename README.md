# T-chatter

Mobile-first chat UI prototype and staged private messaging app.

## Google sign-in setup
1. Create a Firebase project and add a Web app.
2. In Firebase Authentication, enable Google sign-in.
3. Add the deployed Vercel domain under Authentication > Settings > Authorized domains.
4. Copy `firebase-config.js.example` to `firebase-config.js`, then paste your Firebase Web app config.
5. Deploy again.

The Google sign-in page now uses Firebase's real Google popup flow when configured. It intentionally does not claim chat is live after authentication.

## Current state
- UI prototype and installable PWA shell.
- Firebase Google authentication integration scaffold.
- Firestore rules starter denies all chat/message access until membership-based rules are implemented.
- Chat, voice notes, calls, and admin health panel still require backend implementation.

## Privacy principles
- Admins must not be able to read message content, voice notes, or call content.
- OTP codes must never be logged or shown in the admin dashboard.
- Use access controls, rate limits, secure transport, retention controls, and a documented privacy policy.
- Do not claim end-to-end encryption until implemented and independently reviewed.
