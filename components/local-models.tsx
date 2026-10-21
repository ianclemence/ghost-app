import React, { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/text";
import { GhostButton, SectionHeader } from "@/components/ghost";
import { Ghost, Inter, Space } from "@/constants/theme";
import { pullOllamaModel, type GhostConfig } from "@/lib/ghostApi";

/**
 * Downloading a model that runs on the Pod itself, private and working
 * without the internet. What is downloaded is listed with the other models
 * (as Local), where it is chosen like any other.
 */
export function LocalModels({ config, onChanged }: { config: GhostConfig; onChanged?: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const download = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await pullOllamaModel(config, n);
      setNote(`Downloading ${n} to your Pod. When it's ready it appears under Local, above.`);
      setName("");
      onChanged?.();
    } catch {
      setNote("Couldn't start that download. Check the model's name.");
    }
    setBusy(false);
  };

  return (
    <>
      <SectionHeader title="Add a local model" subtitle="It runs on your Pod: nothing you say leaves it, and it works without the internet, though slower than cloud models. Once downloaded, it is under Local above." />
      <View style={styles.row}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. qwen3:8b"
          placeholderTextColor={Ghost.text.tertiary}
          style={[styles.input, { flex: 1 }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void download()}
          accessibilityLabel="The model's name"
          selectionColor={Ghost.accent.primary}
        />
        <GhostButton title="Download" variant="secondary" size="sm" style={{ alignSelf: "center" }} onPress={() => void download()} disabled={busy || !name.trim()} loading={busy} />
      </View>
      {note ? <Text style={styles.note} accessibilityLiveRegion="polite">{note}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: Space.sm, marginHorizontal: Space.lg },
  input: { height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, color: Ghost.text.primary, fontFamily: Inter.regular, fontSize: 15 },
  note: { fontSize: 13, lineHeight: 18, color: Ghost.text.tertiary, textAlign: "center", marginTop: Space.sm, paddingHorizontal: Space.xl },
});
