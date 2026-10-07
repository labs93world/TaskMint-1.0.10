// Native AdMob manager. Wrapped in try/catch so the app still runs in Expo Go
// / web preview where the native module is absent (ads simply no-op there).
import React from "react";
import { AppState, AppStateStatus } from "react-native";

import { AD_UNITS } from "@/src/constants/ads";

let GMA: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  GMA = require("react-native-google-mobile-ads");
} catch {
  GMA = null;
}

const available = !!(GMA && GMA.default);

let initialized = false;

// --------------------------- App Open ad ------------------------------------
let appOpenAd: any = null;
let appOpenLoaded = false;
let appOpenShowing = false;
let appOpenShowOnLoad = false; // show as soon as it finishes loading

function loadAppOpen() {
  if (!available) return;
  try {
    const { AppOpenAd, AdEventType } = GMA;
    appOpenAd = AppOpenAd.createForAdRequest(AD_UNITS.appOpen);
    appOpenLoaded = false;
    appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
      appOpenLoaded = true;
      if (appOpenShowOnLoad) {
        appOpenShowOnLoad = false;
        showAppOpen();
      }
    });
    appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
      appOpenShowing = false;
      appOpenLoaded = false;
      loadAppOpen(); // preload the next one so every open can show it
    });
    appOpenAd.addAdEventListener(AdEventType.ERROR, () => {
      appOpenLoaded = false;
    });
    appOpenAd.load();
  } catch {
    // ignore
  }
}

// Shows the App Open ad on EVERY app open: immediately if it's loaded,
// otherwise it flags itself to show the moment loading completes.
function showAppOpen() {
  if (!available || appOpenShowing) return;
  if (!appOpenLoaded) {
    appOpenShowOnLoad = true;
    return;
  }
  try {
    appOpenShowing = true;
    appOpenAd.show();
  } catch {
    appOpenShowing = false;
  }
}

let appStateRef: AppStateStatus = "active";

// --------------------------- Rewarded Interstitial --------------------------
// Preloaded so it can be shown instantly when a reward is claimed. IMPORTANT:
// a rewarded-interstitial ad unit MUST use the RewardedInterstitialAd class —
// using RewardedAd here silently fails to load in production (the old bug that
// made the ad never appear after claiming a reward).
let riAd: any = null;
let riLoaded = false;
let riShowing = false;

function loadRewardedInterstitial() {
  if (!available) return;
  try {
    const { RewardedInterstitialAd, RewardedAdEventType, AdEventType } = GMA;
    riAd = RewardedInterstitialAd.createForAdRequest(AD_UNITS.rewardedInterstitial);
    riLoaded = false;
    riAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
      riLoaded = true;
    });
    riAd.addAdEventListener(AdEventType.CLOSED, () => {
      riShowing = false;
      riLoaded = false;
      loadRewardedInterstitial(); // preload the next one
    });
    riAd.addAdEventListener(AdEventType.ERROR, () => {
      riLoaded = false;
      riShowing = false;
    });
    riAd.load();
  } catch {
    // ignore
  }
}

export async function initAds() {
  if (!available || initialized) return;
  try {
    await GMA.default().initialize();
    initialized = true;
    loadAppOpen();
    loadRewardedInterstitial();
    // Cold start: show the App Open ad as soon as it is ready.
    showAppOpen();
    AppState.addEventListener("change", (next) => {
      const returning = /inactive|background/.test(appStateRef) && next === "active";
      appStateRef = next;
      if (returning) showAppOpen(); // show again on every return to foreground
    });
  } catch {
    // ignore
  }
}

// --------------------------- Rewarded (for chances) -------------------------
function showFullScreenRewarded(unitId: string): Promise<boolean> {
  if (!available) return Promise.resolve(true); // preview: grant immediately
  return new Promise((resolve) => {
    try {
      const { RewardedAd, RewardedAdEventType, AdEventType } = GMA;
      const ad = RewardedAd.createForAdRequest(unitId);
      let earned = false;
      let settled = false;
      const subs: (() => void)[] = [];
      const cleanup = () => subs.forEach((s) => s && s());
      const finish = (val: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(val);
      };
      subs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => ad.show()));
      subs.push(
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        }),
      );
      subs.push(ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned)));
      subs.push(ad.addAdEventListener(AdEventType.ERROR, () => finish(false)));
      ad.load();
      setTimeout(() => finish(earned), 30000);
    } catch {
      resolve(false);
    }
  });
}

export function showRewarded(): Promise<boolean> {
  return showFullScreenRewarded(AD_UNITS.rewarded);
}

// Shows the preloaded rewarded-interstitial if ready; otherwise kicks off a
// fresh load so the next claim shows it. Resolves true if it was shown.
export function showRewardedInterstitial(): Promise<boolean> {
  if (!available) return Promise.resolve(true);
  try {
    if (riLoaded && !riShowing) {
      riShowing = true;
      riAd.show();
      return Promise.resolve(true);
    }
    loadRewardedInterstitial();
    return Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }
}

export function AdBanner(): React.ReactElement | null {
  if (!available) return null;
  try {
    const { BannerAd, BannerAdSize } = GMA;
    return React.createElement(BannerAd, {
      unitId: AD_UNITS.banner,
      size: BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
    });
  } catch {
    return null;
  }
}

export const adsAvailable = available;
