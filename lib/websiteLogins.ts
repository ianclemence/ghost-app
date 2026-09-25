/** Website logins: sign-ins Ghost can use in its browser without the model
 * ever seeing a password. The phone saves them here; the Pod seals them. */

export interface WebsiteLoginInput {
  url: string;
  username: string;
  password: string;
}

/** validateWebsiteLogin returns a human message, or null when the input is
 * ready to save. Kept pure so it is testable without a device. */
export function validateWebsiteLogin(url: string, username: string, password: string): string | null {
  if (!url.trim() || !username.trim() || !password) {
    return "URL, username, and password are required.";
  }
  if (!/^https?:\/\//i.test(url.trim())) {
    return "URL must start with http:// or https://";
  }
  return null;
}

/** displayUsername shows the masked username the API returns, with a fallback
 * for entries saved without one. */
export function displayUsername(username: string | undefined): string {
  const u = (username ?? "").trim();
  return u || "saved";
}
