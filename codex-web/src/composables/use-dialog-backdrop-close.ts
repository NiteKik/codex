export const closeDialogOnBackdropClick = (
  dialog: HTMLDialogElement | null,
  event: MouseEvent,
) => {
  if (!dialog) {
    return;
  }

  const rect = dialog.getBoundingClientRect();
  const isInsideDialog =
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width;

  if (!isInsideDialog) {
    dialog.close();
  }
};
