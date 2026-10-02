import React, { createContext, useContext } from "react";
import { StyleSheet, Text as RNText, type TextProps } from "react-native";
import { Inter } from "@/constants/theme";

/**
 * Text in Inter. A custom font is a family per weight, so this reads the
 * weight from the style and picks the matching file. Text nested inside text
 * inherits its parent's face unless it sets a weight or family itself.
 */
const Nested = createContext(false);

function familyFor(weight: unknown): string {
  const w = weight === "normal" || weight == null ? 400 : weight === "bold" ? 700 : Number(weight);
  if (w <= 300) return Inter.light;
  if (w < 500) return Inter.regular;
  if (w < 600) return Inter.medium;
  return Inter.semibold;
}

export function Text({ style, ...rest }: TextProps) {
  const nested = useContext(Nested);
  const flat = StyleSheet.flatten(style) ?? {};
  const own = flat.fontFamily == null && (!nested || flat.fontWeight != null);
  const merged = own ? [{ fontFamily: familyFor(flat.fontWeight) }, style, { fontWeight: undefined }] : style;
  return (
    <Nested.Provider value={true}>
      <RNText {...rest} style={merged} />
    </Nested.Provider>
  );
}
