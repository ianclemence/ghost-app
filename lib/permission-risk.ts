// Owner-facing explanation of WHY an approval is being asked, derived from the
// broker's own risk class — the same value that made the decision. This keeps
// the trust language honest: the note always matches the actual stakes, and
// unknown risk yields no note rather than a vague warning.
export function riskNote(risk?: string): string | null {
  switch ((risk ?? "").toLowerCase()) {
    case "high_impact":
      return "This can be hard to undo, so Ghost stops for you every time.";
    case "consequential":
      return "This acts on your behalf, so Ghost asks before doing it.";
    case "low_risk":
      return "Ghost asks the first time; you can let it always do this.";
    default:
      return null;
  }
}

// Caution line for approvals the broker could not classify. Unknown stakes
// must look more careful than low risk, never identical to it.
export function riskCaution(risk?: string): string | null {
  const normalized = (risk ?? "").toLowerCase();
  if (
    normalized === "" ||
    (normalized !== "high_impact" &&
      normalized !== "consequential" &&
      normalized !== "low_risk")
  ) {
    return "Ghost couldn't classify this action, so it stopped. Review carefully before allowing.";
  }
  return null;
}
