import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { GhostButton, GhostInput, GhostList, SectionHeader } from "@/components/ghost";
import { Ghost, Space } from "@/constants/theme";
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
      <GhostList>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <GhostInput value={name} onChangeText={setName} placeholder="e.g. qwen3:8b" autoCapitalize="none" autoCorrect={false} accessibilityLabel="The model's name" />
          </View>
          <GhostButton title="Download" variant="secondary" size="sm" onPress={() => void download()} disabled={busy || !name.trim()} loading={busy} />
        </View>
      </GhostList>
      {note ? <Text style={styles.note} accessibilityLiveRegion="polite">{note}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: Space.md, paddingVertical: Space.md, paddingHorizontal: Space.xl },
  note: { fontSize: 13, lineHeight: 18, color: Ghost.text.tertiary, textAlign: "center", marginTop: Space.sm, paddingHorizontal: Space.xl },
});
