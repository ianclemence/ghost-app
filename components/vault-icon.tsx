import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { CreditCard, KeyRound, UserRound } from "lucide-react-native";
import { Text } from "@/components/text";
import { alpha, Ghost } from "@/constants/theme";
import { fetchVaultIcon } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import { brandLabel, cardBrand, initialsFor, siteHost, siteName, type VaultItem } from "@/lib/vault";

/**
 * The mark before a Vault row: a site's own icon for a login, a brand's mark
 * for a card, a person's initials for a contact, a key for a key. The site
 * icon is fetched by the Pod (never a third-party icon service, which would
 * learn which sites the owner has logins for) and cached here in memory.
 */

const TILE = 44;
const INNER = 32;

// One fetch per site per app run. A null is a real answer ("no icon"), kept so
// a screen of rows does not ask again.
const icons = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function loadIcon(cfg: Parameters<typeof fetchVaultIcon>[0], host: string): Promise<string | null> {
  if (icons.has(host)) return Promise.resolve(icons.get(host) ?? null);
  const running = inFlight.get(host);
  if (running) return running;
  const p = fetchVaultIcon(cfg, host)
    .then((uri) => {
      icons.set(host, uri);
      return uri;
    })
    .catch(() => {
      // Offline is not "no icon": leave it uncached so a later screen retries.
      return null;
    })
    .finally(() => inFlight.delete(host));
  inFlight.set(host, p);
  return p;
}

/** The site's icon, or its initial when the site has none. */
export function SiteIcon({ host }: { host: string }) {
  const config = useGhostStore((s) => s.config);
  const [uri, setUri] = useState<string | null>(() => icons.get(siteHost(host)) ?? null);
  const h = siteHost(host);
  useEffect(() => {
    let live = true;
    if (!config || !h) return;
    void loadIcon(config, h).then((u) => {
      if (live) setUri(u);
    });
    return () => {
      live = false;
    };
  }, [config, h]);

  if (uri) {
    return (
      <View style={styles.siteTile} accessibilityLabel={`${siteName(h)} icon`}>
        <Image source={{ uri }} style={styles.siteImage} resizeMode="contain" />
      </View>
    );
  }
  const letter = (siteName(h) || h || "?").slice(0, 1).toUpperCase();
  return (
    <View style={[styles.tile, { backgroundColor: alpha(Ghost.accent.primary, 0.12), borderColor: alpha(Ghost.accent.primary, 0.26) }]}>
      <Text style={[styles.tileWord, { color: Ghost.accent.primary }]}>{letter}</Text>
    </View>
  );
}

const BRAND: Record<string, { bg: string; fg: string; word: string }> = {
  visa: { bg: "#1A1F71", fg: "#FFFFFF", word: "VISA" },
  amex: { bg: "#006FCF", fg: "#FFFFFF", word: "AMEX" },
  discover: { bg: "#FF6000", fg: "#FFFFFF", word: "DISC" },
  diners: { bg: "#004A97", fg: "#FFFFFF", word: "DC" },
  jcb: { bg: "#0E4C96", fg: "#FFFFFF", word: "JCB" },
  unionpay: { bg: "#E21836", fg: "#FFFFFF", word: "UP" },
  verve: { bg: "#00875A", fg: "#FFFFFF", word: "Verve" },
};

function BrandMark({ brand }: { brand: string | undefined }) {
  const b = (brand ?? "").toLowerCase();
  const known = BRAND[b];
  if (b === "mastercard" || b === "maestro") {
    const [a, c] = b === "maestro" ? ["#0A5CAB", "#E21836"] : ["#EB001B", "#F79E1B"];
    return (
      <View style={[styles.tile, { backgroundColor: "#141418", borderColor: Ghost.glass.border }]} accessibilityLabel={brandLabel(b)}>
        <Svg width={INNER} height={20} viewBox="0 0 32 20">
          <Circle cx={12} cy={10} r={8} fill={a} />
          <Circle cx={20} cy={10} r={8} fill={c} fillOpacity={0.92} />
        </Svg>
      </View>
    );
  }
  if (!known) {
    return (
      <View style={[styles.tile, { backgroundColor: alpha(Ghost.text.primary, 0.07), borderColor: Ghost.glass.border }]} accessibilityLabel="Card">
        <CreditCard size={19} color={Ghost.text.secondary} strokeWidth={1.7} />
      </View>
    );
  }
  return (
    <View style={[styles.tile, { backgroundColor: known.bg, borderColor: alpha("#FFFFFF", 0.16) }]} accessibilityLabel={brandLabel(b)}>
      <Text style={[styles.brandWord, { color: known.fg, fontStyle: b === "visa" ? "italic" : undefined, fontSize: known.word.length > 3 ? 9 : 11 }]}>
        {known.word}
      </Text>
    </View>
  );
}

export function ContactMark({ name, fallback }: { name: string | undefined; fallback?: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: alpha(Ghost.status.info, 0.12), borderColor: alpha(Ghost.status.info, 0.28) }]} accessibilityLabel={name ? `${name} contact` : "Contact"}>
      <Text style={[styles.tileWord, { color: Ghost.status.info }]}>{initialsFor(name, fallback)}</Text>
    </View>
  );
}

export function KeyMark() {
  return (
    <View style={[styles.tile, { backgroundColor: alpha(Ghost.ember, 0.12), borderColor: alpha(Ghost.ember, 0.3) }]} accessibilityLabel="Key">
      <KeyRound size={19} color={Ghost.ember} strokeWidth={1.8} />
    </View>
  );
}

export function PersonMark() {
  return (
    <View style={[styles.tile, { backgroundColor: alpha(Ghost.status.info, 0.12), borderColor: alpha(Ghost.status.info, 0.28) }]}>
      <UserRound size={19} color={Ghost.status.info} strokeWidth={1.8} />
    </View>
  );
}

/** The mark for any Vault item. */
export function VaultMark({ item }: { item: VaultItem }) {
  switch (item.kind) {
    case "login":
      return <SiteIcon host={item.host ?? item.url ?? ""} />;
    case "card":
      return <BrandMark brand={item.brand} />;
    case "contact":
      return <ContactMark name={item.name ?? item.company ?? item.title} fallback={item.email} />;
    case "key":
      return <KeyMark />;
    default:
      return <PersonMark />;
  }
}

/** A brand mark shown in the card form while the number is typed. */
export function CardBrandPreview({ number, brand }: { number: string; brand?: string }) {
  return <BrandMark brand={number.trim() ? cardBrand(number) : brand} />;
}

const styles = StyleSheet.create({
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  siteTile: {
    width: TILE,
    height: TILE,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  siteImage: { width: INNER, height: INNER, borderRadius: 7 },
  tileWord: { fontSize: 15, fontWeight: "600", letterSpacing: 0.2 },
  brandWord: { fontWeight: "700", letterSpacing: 0.5 },
});
