/**
 * Ghost's own dialogs, in place of the system's grey Alert box. The call has
 * the same shape as Alert.alert (title, message, buttons), so a screen asks a
 * question the same way; DialogHost draws it as the app's sheet, the way the
 * console's modal looks on a phone.
 *
 * One dialog shows at a time. One asked while another is up (an error from a
 * confirmed action, say) waits its turn instead of being lost.
 */
export type DialogButton = {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void | Promise<void>;
};

export type Dialog = {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
};

/** What the sheet draws: one action at most, and the way out. */
export type DialogShape = {
  confirm?: DialogButton;
  cancel: DialogButton;
  destructive: boolean;
};

let seq = 0;
const queue: Dialog[] = [];
const listeners = new Set<(d: Dialog | null) => void>();

function emit() {
  const head = queue[0] ?? null;
  for (const fn of listeners) fn(head);
}

export function showDialog(title: string, message?: string, buttons?: DialogButton[]): void {
  queue.push({ id: ++seq, title, message: message || undefined, buttons: buttons ?? [] });
  if (queue.length === 1) emit();
}

/** The host calls this once the shown dialog has gone; the next one follows. */
export function finishDialog(id: number): void {
  if (queue[0]?.id !== id) return;
  queue.shift();
  emit();
}

export function subscribeDialogs(fn: (d: Dialog | null) => void): () => void {
  listeners.add(fn);
  fn(queue[0] ?? null);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Alert.alert's buttons, read the way the system reads them: the "cancel" one
 * is the way out, the last other one is the action. No buttons, or only one,
 * is a notice with a single button that closes it.
 */
export function dialogShape(buttons: DialogButton[]): DialogShape {
  const cancel = buttons.find((b) => b.style === "cancel");
  const others = buttons.filter((b) => b.style !== "cancel");
  if (!cancel && others.length <= 1) {
    return { cancel: { text: others[0]?.text ?? "OK", onPress: others[0]?.onPress }, destructive: false };
  }
  const confirm = others[others.length - 1];
  return {
    confirm,
    cancel: cancel ?? { text: "Cancel" },
    destructive: confirm?.style === "destructive",
  };
}
