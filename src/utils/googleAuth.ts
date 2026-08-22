// Client-side "Continue with Google" via Google Identity Services' OAuth
// token client — designed for a custom-styled button (unlike the ID-token /
// One Tap flow, which requires Google's own rendered button).

export const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;

export function isGoogleSignInConfigured(): boolean {
  return !!GOOGLE_CLIENT_ID;
}

let scriptLoadingPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (scriptLoadingPromise) return scriptLoadingPromise;
  scriptLoadingPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In. Check your connection and try again.'));
    document.head.appendChild(script);
  });
  return scriptLoadingPromise;
}

// Opens Google's OAuth popup and resolves with a short-lived access token
// once the user picks an account and grants consent.
export async function requestGoogleAccessToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google sign-in is not configured yet.');
  }
  await loadGoogleScript();

  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      callback: (response: any) => {
        if (response?.error) {
          reject(new Error(response.error_description || 'Google sign-in was cancelled.'));
          return;
        }
        if (!response?.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }
        resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
}
