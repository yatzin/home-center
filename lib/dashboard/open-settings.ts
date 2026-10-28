// Edit mode: double-clicking (or double-tapping) a card opens its settings,
// the same as its gear. The decisions are here, apart from the DOM, so they
// can be tested.

/** What counts as one of the card's own controls (or content a person can use): those keep their behaviour. */
const CONTROL_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "label",
  "[contenteditable='true']",
  "[role='button']",
  "[role='menuitem']",
  "[role='checkbox']",
  "[role='switch']",
  "[data-gear]",
  "[data-grip]",
].join(", ")

/** Just the part of an element this needs. */
export type ClosestTarget = { closest(selector: string): unknown }

/**
 * Should a double-click on `target`, inside a card in edit mode, open the
 * card's settings? Only for a card that has settings, while its controls are
 * enabled, and not when the click landed on a control (gear, grip, remove,
 * resize handle, adjust menu, or any button, link or field).
 */
export function shouldOpenSettings({
  target,
  hasSettings,
  disabled,
}: {
  target: ClosestTarget | null
  hasSettings: boolean
  disabled: boolean
}): boolean {
  if (!target || !hasSettings || disabled) return false
  return target.closest(CONTROL_SELECTOR) === null
}
