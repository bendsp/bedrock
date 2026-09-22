import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const lockEffect = StateEffect.define<boolean>();
const locked = StateField.define<boolean>({
  create: () => false,
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(lockEffect)) value = effect.value;
    }
    return value;
  },
});

export const editingLock = [
  locked,
  EditorState.readOnly.from(locked),
  EditorView.editable.from(locked, (value) => !value),
  // Also block formatting commands that dispatch their own transactions.
  EditorState.transactionFilter.of((transaction) =>
    transaction.docChanged && transaction.startState.field(locked) ? [] : transaction
  ),
];

export const setEditingLocked = (view: EditorView | null, value: boolean): void => {
  view?.dispatch({ effects: lockEffect.of(value) });
};
