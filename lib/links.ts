/**
 * Opening external links from model-generated content.
 *
 * Validation lives in lib/link-policy.ts (pure, tested). This module adds
 * the one side effect: a validated http(s) URL opens in an in-app browser
 * sheet, so a link can never silently switch apps.
 */
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import { isSafeExternalUrl } from "./link-policy";

/**
 * Open an external URL after validation. Returns true when handled (so the
 * markdown renderer must not also open it), false when blocked.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (!isSafeExternalUrl(url)) return false;
  try {
    await WebBrowser.openBrowserAsync(url.trim(), {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
    return true;
  } catch {
    try {
      await Linking.openURL(url.trim());
      return true;
    } catch {
      return false;
    }
  }
}
