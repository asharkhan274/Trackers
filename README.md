# ProTrack

Real-time production tracking built with Next.js App Router, Tailwind CSS, and Firebase Cloud Firestore.

## Structure

```text
app/page.tsx       Client Dashboard and live timer controls
app/globals.css    Glassmorphism theme and responsive layout
app/layout.tsx     Poppins font and application metadata
lib/firebase.ts    Environment-aware Firebase initialization
lib/types.ts       Firestore production document types
.env.example       Required Firebase environment variables
```

## Firebase setup

1. Create a Firebase project and enable Cloud Firestore.
2. Copy `.env.example` to `.env.local`.
3. Replace the placeholder values with the web app configuration from Firebase Console.
4. Add Firestore rules appropriate for your authenticated users before deployment.

When configured, the Dashboard subscribes to the `productions` collection with `onSnapshot` and persists timer actions as Firestore documents. Without configuration, it renders an in-memory preview and never writes browser storage.

## Development

```bash
npm run dev
```

Open `http://localhost:3000`.