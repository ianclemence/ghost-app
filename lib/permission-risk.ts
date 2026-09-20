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
