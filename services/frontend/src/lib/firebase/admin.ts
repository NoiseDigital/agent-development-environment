// Firebase Admin SDK (server-only). Used by the BFF to verify ID tokens, mint
// httpOnly session cookies, and verify those cookies on each request.
//
// Dev: FIREBASE_AUTH_EMULATOR_HOST (docker-network address of the emulator)
// makes the Admin SDK talk to the emulator and skip credential checks.
// Prod: Application Default Credentials (the App Hosting service account).
import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT;

// Optional explicit SA key (most prod setups use ADC instead).
const saKey = process.env.FIREBASE_ADMIN_CREDENTIALS;

const adminApp: App = getApps().length
  ? getApps()[0]
  : initializeApp(
      saKey ? { credential: cert(JSON.parse(saKey)), projectId } : { projectId },
    );

export const adminAuth: Auth = getAuth(adminApp);

// How long a session cookie stays valid (Firebase max is 14 days).
export const SESSION_COOKIE_NAME = "__session";
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 5; // 5 days
