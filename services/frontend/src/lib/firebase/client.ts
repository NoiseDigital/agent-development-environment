// Firebase client SDK (browser). Initialised once; in dev it points at the
// local Auth emulator so sign-in flows run without touching a real project.
//
// The web API key / project id are public by design (identifiers, not secrets).
// In prod they come from apphosting.yaml (= terraform output firebase_web_config).
"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const firebaseApp: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(firebaseApp);

// Dev: route all auth traffic to the local emulator. The host is the
// *browser-reachable* address (published port on localhost). Guard so HMR
// re-imports don't reconnect (which throws).
const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
if (
  emulatorHost &&
  typeof window !== "undefined" &&
  !(window as unknown as { __authEmulatorWired?: boolean }).__authEmulatorWired
) {
  connectAuthEmulator(auth, emulatorHost, { disableWarnings: true });
  (window as unknown as { __authEmulatorWired?: boolean }).__authEmulatorWired =
    true;
}

export const googleProvider = new GoogleAuthProvider();
