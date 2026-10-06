# TaskMint — PRD

## Original Problem Statement
1. Import GitHub repo https://github.com/labs93world/TaskMint-1.0.11 (nothing missed).
2. (a) Home tab: remove "Open task link" button from offerwall task detail popup, keep only "Start task". (b) Profile tab: admin panel access password input must show text visibly while typing.
3. Explain (a) ads placement/working, (b) push notifications — tutor style.

## Architecture
- Expo (SDK 57) frontend, expo-router, React Query, Firebase JS SDK (Firestore) as the live datastore — all user/offerwall/payout data lives in user's Firebase project `taskmint-cfc5a`.
- FastAPI backend at /app/backend/server.py is the default template stub (no app logic there).
- Ads: react-native-google-mobile-ads (AdMob), wrapped in no-op for web/Expo Go (`src/ads/index.ts`).
- Notifications: 100% local (expo-notifications + expo-background-task), no FCM sender (`src/lib/notifications.ts`).

## Implemented (2026-10-06)
- Full repo import from GitHub → /app (rsync, preserved .env/.git/.emergent/node_modules; verified with diff — nothing missed).
- Removed "Open task link" button from `src/components/home/TaskDetailModal.tsx`.
- Removed `secureTextEntry` from admin key input in `app/(tabs)/profile.tsx` (text now visible while typing).
- **Remote push (FCM) — works when app is closed/never opened:**
  - Client: `src/lib/push.ts` grabs FCM device token, saves to `users/{deviceId}.fcmToken`; called from `app/_layout.tsx` after permission grant. `savePushToken()` added to `src/lib/firestore.ts`.
  - Sender: Firebase Cloud Functions in `/app/functions/index.js` (onPayoutUpdate, onSubmissionUpdate, onNewTask broadcast, dailyReminder 7PM IST). Deploy config `/app/firebase.json`, `/app/.firebaserc`, guide `/app/functions/README.md`.
  - Pure Firebase, no Emergent server. Requires Blaze plan + user runs `firebase deploy --only functions`. Push only works on a real native build.

## Deployment fix (2026-10-06)
- User's Emergent production deploy failed (BUILD FAILED: `git rev-parse` exit 128 in EAS workspace, `eas project:init failed`, no keystore).
- Root cause 1 (FIXED): imported repo's `.gitignore` had `.env`/`.env.*`/`*.env` → `frontend/.env` + `backend/.env` were never tracked, so the git-based deployment snapshot shipped with no env files. Removed patterns; committed both .env files.
- Root cause 2 (FIXED): `frontend/yarn.lock` missing → generated + committed (`--frozen-lockfile` builds).
- Verified by deployment_agent re-scan (dockerignore/yarn.lock blockers cleared) + testing_agent iteration_4 (all pass, no regressions).
- Remaining: deployment_agent policy flags Firebase-as-datastore (by design, kept). EAS keystore/git-root errors are pipeline-side — if they persist after redeploy, escalate to Emergent support.

## Credentials
- Admin panel access key: `TaskMint000` (long-press version text on Profile tab to open hidden popup).

## Backlog
- P1: Move ADMIN_KEY out of client code (currently readable in bundle).
- P2: Version Pressable touch target ~35px (<44px guideline) — acceptable for hidden affordance.
