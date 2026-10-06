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
- Testing agent iteration_3: both changes PASS, no regressions.

## Credentials
- Admin panel access key: `TaskMint000` (long-press version text on Profile tab to open hidden popup).

## Backlog
- P1: Move ADMIN_KEY out of client code (currently readable in bundle).
- P2: Version Pressable touch target ~35px (<44px guideline) — acceptable for hidden affordance.
