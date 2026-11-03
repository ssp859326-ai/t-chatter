# T-chatter

A mobile-first chat UI prototype with original T-chatter branding.

## Current status
This repository currently contains a **front-end demo only**. Sample chats and message bubbles are local UI examples. It does not send messages, register phone numbers, deliver OTPs, save conversations, record voice notes, or connect voice/video calls.

## Preview locally
Open `index.html` in a browser, or deploy the repository as a static site.

## Planned production phases
1. Phone-number registration with OTP using a trusted authentication/SMS provider.
2. Real-time chat, media/voice-note upload and delivery.
3. Voice/video calls using a WebRTC-compatible provider.
4. Admin dashboard limited to OTP delivery status and aggregate service health.

## Privacy principles
- Admins must not be able to read message content, voice notes, or call content.
- OTP codes must never be logged or shown in the admin dashboard.
- Use access controls, rate limits, secure transport, retention controls, and a documented privacy policy.
- Do not claim end-to-end encryption until implemented and independently reviewed.

## Brand
T-chatter is an independent project and is not affiliated with WhatsApp.
