/** The Expo project the token belongs to. Needed to mint a push token. */
export function easProjectId(constants: {
  expoConfig?: { extra?: Record<string, unknown> } | null;
  easConfig?: { projectId?: string } | null;
}): string | null {
  const fromExtra = (constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromExtra || constants.easConfig?.projectId || null;
}
