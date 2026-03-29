const normalizeUrl = (value, fallback) => (value || fallback).replace(/\/+$/, '');

export const BASE_URL = normalizeUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL
);

export const WS_URL = BASE_URL.replace(/^http/i, 'ws');

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
export const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

export const GOOGLE_SIGN_IN_READY = Boolean(
  GOOGLE_WEB_CLIENT_ID && (GOOGLE_ANDROID_CLIENT_ID || GOOGLE_IOS_CLIENT_ID)
);
