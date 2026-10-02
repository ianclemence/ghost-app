/**
 * How loud each choice is. The safest yes ("once") is the primary action; a
 * yes for the whole task is an outlined button; "always" is the broadest grant,
 * so it is the quietest; and no is soft red, easy to find and never the
 * loudest thing on the card. Choices the runtime names differently fall back to
 * what the server says: danger is no, everything else is a plain yes.
 */
export function approvalVariant(a: { id: string; style?: string }): "primary" | "secondary" | "ghost" | "danger" {
  if (a.style === "danger" || /deny|reject/i.test(a.id)) return "danger";
  if (/always/i.test(a.id)) return "ghost";
  if (/task|session|today/i.test(a.id)) return "secondary";
  if (a.style === "secondary") return "secondary";
  return "primary";
}
