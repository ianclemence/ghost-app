import React, { useEffect, useRef, useState } from "react";
import { GhostSheet } from "@/components/ghost";
import { dialogShape, finishDialog, subscribeDialogs, type Dialog, type DialogButton } from "@/lib/dialog";

/**
 * Draws the dialog showDialog asked for, as the app's sheet. Mounted once at
 * the root. Every way of closing it (Cancel, a tap outside, a swipe down, the
 * back button) is the cancel choice, and a dialog settles exactly once: the
 * sheet calls onClose right after onConfirm, which must not also cancel.
 */
export function DialogHost() {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [visible, setVisible] = useState(false);
  const settled = useRef<number | null>(null);

  useEffect(
    () =>
      subscribeDialogs((d) => {
        setDialog(d);
        setVisible(!!d);
      }),
    [],
  );

  if (!dialog) return null;
  const shape = dialogShape(dialog.buttons);

  const settle = (button?: DialogButton) => {
    if (settled.current === dialog.id) return;
    settled.current = dialog.id;
    setVisible(false);
    // Let the sheet leave before the next one (or nothing) takes its place.
    const id = dialog.id;
    setTimeout(() => finishDialog(id), 240);
    void button?.onPress?.();
  };

  return (
    <GhostSheet
      visible={visible}
      title={dialog.title}
      message={dialog.message}
      confirmTitle={shape.confirm?.text ?? (shape.confirm ? "OK" : undefined)}
      onConfirm={shape.confirm ? () => settle(shape.confirm) : undefined}
      cancelTitle={shape.cancel.text}
      onClose={() => settle(shape.cancel)}
      variant={shape.destructive ? "destructive" : "default"}
    />
  );
}
