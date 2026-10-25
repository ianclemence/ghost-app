import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Eye, EyeOff, KeyRound } from "lucide-react-native";
import { Text } from "@/components/text";
import { GhostButton, GhostInput, GhostToggle } from "@/components/ghost";
import { CardBrandPreview } from "@/components/vault-icon";
import { Field } from "@/components/life-ui";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";
import { saveVaultItem } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import {
  brandLabel,
  cardBrand,
  digitsOnly,
  expiryShort,
  kindWord,
  luhnValid,
  parseExpiry,
  siteHost,
  type VaultItem,
  type VaultItemInput,
  type VaultKind,
} from "@/lib/vault";

type Draft = {
  title: string;
  site: string;
  username: string;
  password: string;
  number: string;
  holder: string;
  expiry: string;
  cvc: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  region: string;
  postal: string;
  country: string;
  service: string;
  value: string;
  envName: string;
  useInCommands: boolean;
  notes: string;
};

const KINDS: VaultKind[] = ["login", "card", "contact", "key"];

function draftOf(item: VaultItem | null): Draft {
  return {
    title: item?.title ?? "",
    site: item?.host ?? item?.url ?? "",
    username: item?.username ?? "",
    password: "",
    number: "",
    holder: item?.holder ?? "",
    expiry: expiryShort(item?.exp_month, item?.exp_year),
    cvc: "",
    name: item?.name ?? "",
    company: item?.company ?? "",
    email: item?.email ?? "",
    phone: item?.phone ?? "",
    street: item?.street ?? "",
    city: item?.city ?? "",
    region: item?.region ?? "",
    postal: item?.postal ?? "",
    country: item?.country ?? "",
    service: item?.service ?? "",
    value: "",
    envName: item?.env_name ?? "",
    useInCommands: item?.use_in_commands ?? false,
    notes: item?.notes ?? "",
  };
}

/**
 * The form that puts something in the Vault. It holds a secret only until the
 * Pod has taken it, then clears it. Editing sends the old item's id; a blank
 * password, card number or key value means "keep the one already saved", so a
 * nickname can be changed without asking for the secret again.
 */
export function VaultForm({
  editing,
  initialKind = "login",
  onSaved,
  onCancel,
}: {
  editing: VaultItem | null;
  initialKind?: VaultKind;
  onSaved: (item: VaultItem) => void;
  onCancel: () => void;
}) {
  const config = useGhostStore((s) => s.config);
  const [kind, setKind] = useState<VaultKind>(editing?.kind ?? initialKind);
  const [d, setD] = useState<Draft>(() => draftOf(editing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const numberDigits = digitsOnly(d.number);
  const numberComplete = numberDigits.length >= 12;
  const brand = numberDigits ? cardBrand(numberDigits) : (editing?.brand ?? "");
  const changingKind = !editing;

  const save = async () => {
    if (!config || busy) return;
    const problem = validate(kind, d, Boolean(editing));
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const input = buildInput(kind, d, editing);
    try {
      const saved = await saveVaultItem(config, input);
      // The secret is the Pod's now. Drop it from this component's state.
      setD((prev) => ({ ...prev, password: "", cvc: "", value: "", number: "" }));
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    }
    setBusy(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{editing ? `Edit ${kindWord(kind).toLowerCase()}` : "Add to the Vault"}</Text>
      <Text style={styles.subheading}>
        {editing ? "Leave a secret empty to keep the one already saved." : "Sealed on your Pod before it is stored. Ghost only sees what it needs."}
      </Text>

      {changingKind ? (
        <View style={styles.seg} accessibilityRole="tablist">
          {KINDS.map((k) => {
            const on = k === kind;
            return (
              <Pressable
                key={k}
                onPress={() => {
                  setKind(k);
                  setError(null);
                }}
                style={[styles.segBtn, on && styles.segOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{kindWord(k)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.kindTag}>
          <Text style={styles.kindTagText}>{kindWord(kind)}</Text>
        </View>
      )}

      {kind === "login" ? (
        <LoginFields d={d} set={set} editing={Boolean(editing)} />
      ) : kind === "card" ? (
        <CardFields d={d} set={set} editing={Boolean(editing)} brand={brand} numberComplete={numberComplete} numberValid={luhnValid(numberDigits)} />
      ) : kind === "contact" ? (
        <ContactFields d={d} set={set} />
      ) : (
        <KeyFields d={d} set={set} editing={Boolean(editing)} />
      )}

      <Field label="Notes (optional)" value={d.notes} onChange={(v) => set("notes", v)} placeholder="Anything worth remembering" multiline hint="Ghost can read notes. Never put a password or card number here." />

      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}

      <View style={styles.actions}>
        <GhostButton title={busy ? "Saving…" : "Save securely"} loading={busy} disabled={busy} onPress={() => void save()} />
        <GhostButton title="Cancel" variant="secondary" disabled={busy} onPress={onCancel} />
      </View>
    </View>
  );
}

type Setter = <K extends keyof Draft>(k: K, v: Draft[K]) => void;

function LoginFields({ d, set, editing }: { d: Draft; set: Setter; editing: boolean }) {
  return (
    <View style={styles.fields}>
      <Field
        label="Site"
        value={d.site}
        onChange={(v) => set("site", v)}
        placeholder="https://ads.google.com"
        keyboard="url"
        editable={!editing}
        hint={editing ? "The site a login is for can't change. Add a new login for another site." : "The address where Ghost signs in."}
      />
      <Field
        label="Email address or username"
        value={d.username}
        onChange={(v) => set("username", v)}
        placeholder="you@example.com"
        keyboard="email-address"
      />
      <SecretField
        label="Password"
        value={d.password}
        onChange={(v) => set("password", v)}
        placeholder={editing ? "Leave empty to keep it" : "Your password"}
        hint={editing ? "Only you and the Pod know it. Blank keeps the saved one." : "Ghost can use it to sign in. It never sees the password."}
      />
      <Field label="Name (optional)" value={d.title} onChange={(v) => set("title", v)} placeholder="Google Ads Manager" />
    </View>
  );
}

function CardFields({
  d,
  set,
  editing,
  brand,
  numberComplete,
  numberValid,
}: {
  d: Draft;
  set: Setter;
  editing: boolean;
  brand: string;
  numberComplete: boolean;
  numberValid: boolean;
}) {
  return (
    <View style={styles.fields}>
      <View style={styles.brandRow}>
        <CardBrandPreview number={d.number} brand={brand} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.brandName}>{brandLabel(brand)}</Text>
          <Text style={styles.brandHint}>The mark follows the number you type.</Text>
        </View>
      </View>
      <SecretField
        label="Card number"
        value={d.number}
        onChange={(v) => set("number", v)}
        placeholder={editing ? "Leave empty to keep it" : "4242 4242 4242 4242"}
        keyboard="numeric"
        hint={
          editing
            ? "Blank keeps the saved number. Ghost never sees it."
            : numberComplete
              ? numberValid
                ? "That looks like a real card number."
                : "That number doesn't pass the card check. Look for a mistyped digit."
              : "Ghost never sees this number or the security code."
        }
        error={numberComplete && !numberValid}
      />
      <Field label="Name on card" value={d.holder} onChange={(v) => set("holder", v)} placeholder="IAN CLEMENCE" />
      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <Field label="Expiry" value={d.expiry} onChange={(v) => set("expiry", v)} placeholder="MM/YY" />
        </View>
        <View style={styles.pairItem}>
          <SecretField
            label="Security code"
            value={d.cvc}
            onChange={(v) => set("cvc", v)}
            placeholder={editing ? "Keep" : "123"}
            keyboard="numeric"
            hint="Only to fill a checkout."
          />
        </View>
      </View>
      <Field label="Nickname (optional)" value={d.title} onChange={(v) => set("title", v)} placeholder="Personal Visa" />
    </View>
  );
}

function ContactFields({ d, set }: { d: Draft; set: Setter }) {
  return (
    <View style={styles.fields}>
      <Field label="Name" value={d.name} onChange={(v) => set("name", v)} placeholder="Amina Hassan" />
      <Field label="Company (optional)" value={d.company} onChange={(v) => set("company", v)} placeholder="Acme Ltd" />
      <Field label="Email" value={d.email} onChange={(v) => set("email", v)} placeholder="amina@example.com" keyboard="email-address" />
      <Field label="Phone" value={d.phone} onChange={(v) => set("phone", v)} placeholder="+254 700 000000" keyboard="phone-pad" />
      <Field label="Street" value={d.street} onChange={(v) => set("street", v)} placeholder="12 Ngong Road" />
      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <Field label="City" value={d.city} onChange={(v) => set("city", v)} placeholder="Nairobi" />
        </View>
        <View style={styles.pairItem}>
          <Field label="Region" value={d.region} onChange={(v) => set("region", v)} placeholder="Nairobi County" />
        </View>
      </View>
      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <Field label="Postal code" value={d.postal} onChange={(v) => set("postal", v)} placeholder="00100" />
        </View>
        <View style={styles.pairItem}>
          <Field label="Country" value={d.country} onChange={(v) => set("country", v)} placeholder="Kenya" />
        </View>
      </View>
      <Text style={styles.note}>Ghost can see contact details so it can type them into a form for you.</Text>
    </View>
  );
}

function KeyFields({ d, set, editing }: { d: Draft; set: Setter; editing: boolean }) {
  return (
    <View style={styles.fields}>
      <Field label="Name" value={d.title} onChange={(v) => set("title", v)} placeholder="Stripe" />
      <Field label="Service (optional)" value={d.service} onChange={(v) => set("service", v)} placeholder="Stripe" />
      <SecretField
        label="Key or token"
        value={d.value}
        onChange={(v) => set("value", v)}
        placeholder={editing ? "Leave empty to keep it" : "sk_live_…"}
        hint={editing ? "Blank keeps the saved key." : "Ghost never sees this value."}
      />
      <Field
        label="Variable name (optional)"
        value={d.envName}
        onChange={(v) => set("envName", v.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
        placeholder="STRIPE_KEY"
        hint="The name a command reads it from, such as $STRIPE_KEY."
      />
      <View style={styles.toggleRow}>
        <View style={styles.toggleIcon}>
          <KeyRound size={16} color={Ghost.ember} strokeWidth={1.8} />
        </View>
        <View style={styles.toggleText}>
          <Text style={styles.toggleTitle}>Let commands use this key</Text>
          <Text style={styles.toggleHint}>Only a command that names $VARIABLE gets it, and only after your OK.</Text>
        </View>
        <GhostToggle value={d.useInCommands} onValueChange={(v) => set("useInCommands", v)} accessibilityLabel="Let commands use this key" />
      </View>
    </View>
  );
}

function SecretField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  keyboard,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  keyboard?: "numeric";
  error?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.field}>
      <View style={styles.secretLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {error ? <Text style={styles.fieldError}>check the number</Text> : null}
      </View>
      <View style={styles.secretWrap}>
        <GhostInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          secureTextEntry={!show}
          keyboardType={keyboard}
          style={styles.secretInput}
          accessibilityLabel={label}
        />
        <Pressable
          onPress={() => setShow((v) => !v)}
          hitSlop={10}
          style={styles.eye}
          accessibilityRole="button"
          accessibilityLabel={show ? `Hide the ${label.toLowerCase()}` : `Show the ${label.toLowerCase()}`}
        >
          {show ? <EyeOff size={17} color={Ghost.text.tertiary} strokeWidth={1.8} /> : <Eye size={17} color={Ghost.text.tertiary} strokeWidth={1.8} />}
        </Pressable>
      </View>
      {hint ? <Text style={[styles.hint, error && { color: Ghost.status.warning }]}>{hint}</Text> : null}
    </View>
  );
}

function validate(kind: VaultKind, d: Draft, editing: boolean): string | null {
  switch (kind) {
    case "login": {
      if (!siteHost(d.site)) return "Enter the site this login is for.";
      if (!/\./.test(siteHost(d.site))) return "That doesn't look like a site address.";
      if (!d.username.trim()) return "Enter the username or email address.";
      if (!editing && !d.password) return "Enter the password.";
      return null;
    }
    case "card": {
      const digits = digitsOnly(d.number);
      if (!editing || digits) {
        if (!luhnValid(digits)) return "That card number doesn't look right. Check the digits.";
      }
      const exp = parseExpiry(d.expiry);
      if (!exp) return "Enter the expiry as MM/YY.";
      if (d.cvc && !/^\d{3,4}$/.test(d.cvc)) return "A security code is 3 or 4 digits.";
      return null;
    }
    case "contact": {
      if (!d.name.trim() && !d.company.trim()) return "A contact needs a name.";
      if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return "That email address doesn't look right.";
      if (d.phone.trim() && !/^[0-9+()\-.\s]{3,32}$/.test(d.phone.trim())) return "A phone number has digits, spaces and + ( ) - only.";
      return null;
    }
    case "key": {
      if (!d.title.trim() && !d.service.trim()) return "Give the key a name.";
      if (!editing && !d.value.trim()) return "Paste the key.";
      if (d.useInCommands && !/^[A-Z][A-Z0-9_]{2,63}$/.test(d.envName.trim())) {
        return "Give the variable a name of capital letters, digits and _, starting with a letter.";
      }
      return null;
    }
  }
}

function buildInput(kind: VaultKind, d: Draft, editing: VaultItem | null): VaultItemInput {
  const notes = d.notes.trim() || undefined;
  const id = editing?.id;
  switch (kind) {
    case "login": {
      const host = siteHost(d.site);
      const typed = d.site.trim();
      const url = /^https?:\/\//i.test(typed) ? typed : `https://${host}`;
      return {
        kind,
        id: editing ? id : undefined,
        host,
        url,
        username: d.username.trim(),
        password: d.password || undefined,
        title: d.title.trim() || undefined,
        notes,
      };
    }
    case "card": {
      const digits = digitsOnly(d.number);
      const exp = parseExpiry(d.expiry)!;
      const last4 = editing?.last4 && !digits ? editing.last4 : digits.slice(-4);
      return {
        kind,
        id: editing ? id : undefined,
        number: digits || undefined,
        holder: d.holder.trim() || undefined,
        exp_month: exp.month,
        exp_year: exp.year,
        cvc: d.cvc || undefined,
        title: d.title.trim() || `${brandLabel(cardBrand(digits || editing?.brand || ""))} ending ${last4}`,
        notes,
      };
    }
    case "contact":
      return {
        kind,
        id: editing ? id : undefined,
        name: d.name.trim() || undefined,
        company: d.company.trim() || undefined,
        email: d.email.trim() || undefined,
        phone: d.phone.trim() || undefined,
        street: d.street.trim() || undefined,
        city: d.city.trim() || undefined,
        region: d.region.trim() || undefined,
        postal: d.postal.trim() || undefined,
        country: d.country.trim() || undefined,
        title: d.name.trim() || d.company.trim() || undefined,
        notes,
      };
    case "key": {
      const title = d.title.trim() || d.service.trim();
      return {
        kind,
        id: editing ? id : undefined,
        title,
        service: d.service.trim() || title,
        value: d.value || undefined,
        env_name: d.envName.trim() || undefined,
        use_in_commands: d.useInCommands,
        notes,
      };
    }
  }
}

const styles = StyleSheet.create({
  wrap: { gap: Space.md },
  heading: { fontFamily: Fonts.voice, fontSize: 30, lineHeight: 36, letterSpacing: -0.5, color: Ghost.text.primary },
  subheading: { fontSize: 14, lineHeight: 20, fontWeight: "300", color: Ghost.text.secondary, marginTop: -4 },
  seg: {
    flexDirection: "row",
    gap: 2,
    padding: 3,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  segBtn: { flex: 1, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 15 },
  segOn: { backgroundColor: Ghost.glass.fillStrong },
  segText: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.secondary },
  segTextOn: { color: Ghost.text.primary },
  kindTag: { alignSelf: "flex-start", height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  kindTagText: { fontSize: 12, fontWeight: "500", color: Ghost.text.secondary },
  fields: { gap: Space.md },
  pair: { flexDirection: "row", gap: Space.md },
  pairItem: { flex: 1 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginLeft: 2 },
  fieldError: { fontSize: 11.5, color: Ghost.status.warning },
  secretLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  secretWrap: { justifyContent: "center" },
  secretInput: { paddingRight: 46 },
  eye: { position: "absolute", right: 12, width: 32, height: 44, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 12.5, lineHeight: 17, color: Ghost.text.tertiary, marginLeft: 2 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandName: { fontSize: 15, lineHeight: 20, fontWeight: "500", color: Ghost.text.primary },
  brandHint: { fontSize: 12.5, lineHeight: 17, color: Ghost.text.tertiary },
  note: { fontSize: 12.5, lineHeight: 18, color: Ghost.text.tertiary, marginLeft: 2 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  toggleIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderCurve: "continuous",
    backgroundColor: alpha(Ghost.ember, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(Ghost.ember, 0.28),
    alignItems: "center",
    justifyContent: "center",
  },
  toggleText: { flex: 1, minWidth: 0, gap: 1 },
  toggleTitle: { fontSize: 13.5, lineHeight: 18, fontWeight: "500", color: Ghost.text.primary },
  toggleHint: { fontSize: 12, lineHeight: 16, color: Ghost.text.tertiary },
  error: { fontSize: 13.5, lineHeight: 19, color: Ghost.status.error },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, marginTop: Space.xs },
});
