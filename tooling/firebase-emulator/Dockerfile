# Firebase Local Emulator Suite — dev-only auth backend so the whole stack can
# run real Firebase Auth flows (sign-in, ID tokens, Admin-SDK verification)
# without touching a real Firebase project. The frontend (client SDK) signs in
# against it and the gateway (Admin SDK) verifies the resulting tokens; both
# point here via FIREBASE_AUTH_EMULATOR_HOST. Java is required by the emulators.
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jre-headless ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g firebase-tools@13

WORKDIR /firebase
# Auth emulator (9099) + emulator UI (4000).
EXPOSE 9099 4000

# firebase.json (emulator ports) is bind-mounted by docker-compose, which also
# overrides this CMD to drive --project from FIREBASE_PROJECT_ID. The value here
# is the standalone fallback; no real GCP creds are needed because the SDKs are
# pointed at the emulator (FIREBASE_AUTH_EMULATOR_HOST).
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "nd-agentspace-local"]
