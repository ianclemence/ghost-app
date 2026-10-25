/**
 * The Vault's client-side vocabulary: the shapes the Pod returns, and the few
 * rules the phone can check before sending (a card number's Luhn digit, a
 * brand, an expiry). The Pod checks all of this again and is the authority;
 * this only saves the owner a round trip and lets the form show the card's
 * mark as they type.
 *
 * No secret is ever kept here. Passwords, card numbers and key values live in
 * the form's state until the Pod has them, and the Pod never sends one back.
 */

export type VaultKind = "login" | "card" | "contact" | "key";

export type VaultTab = "all" | "logins" | "cards" | "contacts" | "keys";

export interface VaultItem {
  id: string;
  kind: VaultKind;
  title: string;
  subtitle: string;
  notes?: string;

  host?: string;
  url?: string;
  username?: string;
  has_password?: boolean;

  brand?: string;
  holder?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  expired?: boolean;
  has_cvc?: boolean;

  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;

  service?: string;
  key_hint?: string;
  env_name?: string;
  use_in_commands?: boolean;

  updated_at?: string;
}

export interface VaultItemInput extends Partial<Omit<VaultItem, "kind" | "subtitle" | "last4" | "expired" | "has_password" | "has_cvc" | "key_hint" | "updated_at">> {
  kind: VaultKind;
  /** Sent on an edit; left off a new item. */
  id?: string;
  password?: string;
  number?: string;
  cvc?: string;
  value?: string;
  username_selector?: string;
  password_selector?: string;
  submit_selector?: string;
}

export interface VaultCounts {
  login?: number;
  card?: number;
  contact?: number;
  key?: number;
}

export const VAULT_TABS: { id: VaultTab; label: string; kind?: VaultKind }[] = [
  { id: "all", label: "All" },
  { id: "logins", label: "Logins", kind: "login" },
  { id: "cards", label: "Cards", kind: "card" },
  { id: "contacts", label: "Contacts", kind: "contact" },
  { id: "keys", label: "Keys", kind: "key" },
];

export function kindOfTab(tab: VaultTab): VaultKind | null {
  return VAULT_TABS.find((t) => t.id === tab)?.kind ?? null;
}

export function kindWord(kind: VaultKind): string {
  return { login: "Login", card: "Card", contact: "Contact", key: "Key" }[kind];
}

export function kindPlural(kind: VaultKind): string {
  return { login: "Logins", card: "Cards", contact: "Contacts", key: "Keys" }[kind];
}

/** The count a tab shows: the whole Vault for All, its kind otherwise. */
export function tabCount(tab: VaultTab, counts: VaultCounts): number {
  const k = kindOfTab(tab);
  if (!k) return (counts.login ?? 0) + (counts.card ?? 0) + (counts.contact ?? 0) + (counts.key ?? 0);
  return counts[k] ?? 0;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** LuhnValid is the same check the Pod makes: a mistyped digit fails it. */
export function luhnValid(digits: string): boolean {
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const c = digits.charCodeAt(i);
    if (c < 48 || c > 57) return false;
    let d = c - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * cardBrand mirrors pkg/credentials.CardBrand, in the same order: a number
 * that is one brand's is never read as an earlier one's.
 */
export function cardBrand(number: string): string {
  const n = digitsOnly(number);
  const has = (...prefixes: string[]) => prefixes.some((p) => n.startsWith(p));
  const inRange = (width: number, lo: number, hi: number) => {
    if (n.length < width) return false;
    const v = Number(n.slice(0, width));
    return v >= lo && v <= hi;
  };
  if (has("34", "37")) return "amex";
  if (has("4")) return "visa";
  if (inRange(2, 51, 55) || inRange(4, 2221, 2720)) return "mastercard";
  if (inRange(6, 506099, 506198) || inRange(6, 650002, 650027)) return "verve";
  if (has("6011", "65") || inRange(3, 644, 649) || inRange(6, 622126, 622925)) return "discover";
  if (has("62")) return "unionpay";
  if (has("36", "38", "39") || inRange(3, 300, 305)) return "diners";
  if (inRange(4, 3528, 3589)) return "jcb";
  if (has("50") || inRange(2, 56, 69)) return "maestro";
  return "";
}

const BRAND_NAMES: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  verve: "Verve",
  maestro: "Maestro",
};

export function brandLabel(brand: string | undefined): string {
  return BRAND_NAMES[(brand ?? "").toLowerCase()] ?? "Card";
}

/** "4242 4242 4242 4242" for a number as it is typed. */
export function groupCardNumber(value: string): string {
  const d = digitsOnly(value).slice(0, 19);
  return d.replace(/(.{4})/g, "$1 ").trim();
}

/** A card's expiry from two boxes, or "" when it is not complete. */
export function expiryShort(month?: number, year?: number): string {
  if (!month || !year) return "";
  return `${String(month).padStart(2, "0")}/${String(year % 100).padStart(2, "0")}`;
}

/** "8/28" or "08/2028" from what the owner typed. */
export function parseExpiry(value: string): { month: number; year: number } | null {
  const m = value.trim().match(/^(\d{1,2})\s*[/\-\s]\s*(\d{2,4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  let year = Number(m[2]);
  if (m[2].length <= 2) {
    year += 2000;
    // A card cannot outlive a couple of decades, so "8/99" is a typo, not 2099.
    if (year > new Date().getFullYear() + 20) return null;
  }
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { month, year };
}

/** The initials a contact's tile shows, or the first letter of an email. */
export function initialsFor(name: string | undefined, fallback?: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join("").toUpperCase();
  const f = (fallback ?? "").trim();
  return f ? Array.from(f)[0].toUpperCase() : "?";
}

/** The site under a login, without www: "ads.google.com". */
export function siteHost(value: string | undefined): string {
  let h = (value ?? "").trim().toLowerCase();
  if (!h) return "";
  try {
    h = new URL(h.includes("://") ? h : `https://${h}`).hostname;
  } catch {
    h = h.replace(/^https?:\/\//, "").split(/[/:?#]/)[0];
  }
  return h.replace(/^www\./, "");
}

/** The site's name for a row: its registrable label, "Google" for ads.google.com. */
export function siteName(host: string | undefined): string {
  const h = siteHost(host);
  if (!h) return "";
  const labels = h.split(".");
  const suffixLabels = labels.length >= 3 && SUFFIXES.has(labels.slice(-2).join(".")) ? 2 : 1;
  const index = labels.length - suffixLabels - 1;
  const label = index >= 0 ? labels[index] : labels[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// The suffixes the Pod also knows, so both shorten a host the same way.
const SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk",
  "com.au", "net.au", "org.au", "edu.au", "co.nz", "org.nz", "co.za", "org.za",
  "co.ke", "or.ke", "go.ke", "ac.ke", "co.tz", "co.ug", "com.ng", "com.gh",
  "co.in", "net.in", "org.in", "com.br", "com.mx", "com.ar", "com.co", "com.pe",
  "com.tr", "co.jp", "ne.jp", "or.jp", "com.cn", "com.hk", "com.sg", "com.my",
  "co.th", "in.th", "or.th", "com.ph", "com.vn", "co.id", "or.id", "com.pk",
  "com.bd", "com.eg", "com.sa",
  // Shared hosting and publishing platforms: without these, one tenant's
  // login could be typed on another tenant's site.
  "github.io", "gitlab.io", "pages.dev", "workers.dev", "netlify.app", "vercel.app",
  "web.app", "firebaseapp.com", "appspot.com", "azurewebsites.net", "herokuapp.com",
  "onrender.com", "fly.dev", "glitch.me", "repl.co", "surge.sh", "now.sh",
  "blogspot.com", "wordpress.com", "tumblr.com", "substack.com", "myshopify.com",
  "wixsite.com", "weebly.com", "notion.site", "trycloudflare.com", "ngrok.io", "ngrok-free.app",
]);

/** What needs a look in the Vault, in the owner's words, or null. */
export function vaultStatus(item: VaultItem): string | null {
  if (item.kind === "card") {
    if (item.expired) return "Expired";
    if (!item.exp_month || !item.exp_year) return null;
    const end = new Date(item.exp_year, item.exp_month, 1);
    const soon = new Date();
    soon.setMonth(soon.getMonth() + 2);
    if (end <= soon) return "Expires soon";
  }
  return null;
}

/**
 * The one line under a website form's title. It names the site the browser is
 * allowed to fill, which is the promise the form makes.
 */
export function credentialFootnote(host: string): string {
  return `Never shown to your Ghost. Only filled on ${siteHost(host)}.`;
}
