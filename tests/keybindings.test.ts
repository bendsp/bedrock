import { strict as assert } from "assert";
import {
  defaultKeyBindings,
  KeyBindings,
} from "../src/renderer/settings";
import { findKeyBindingConflicts } from "../src/renderer/keybindings";

const runTest = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

runTest("keybinding conflicts are reported per action", () => {
  const bindings: KeyBindings = {
    ...defaultKeyBindings,
    bold: "mod+b",
    italic: "cmd+b",
  };

  const conflicts = findKeyBindingConflicts(bindings);

  assert.deepEqual(conflicts.bold, ["italic"]);
  assert.deepEqual(conflicts.italic, ["bold"]);
});

runTest("unique keybindings have no conflicts", () => {
  const conflicts = findKeyBindingConflicts(defaultKeyBindings);

  assert.deepEqual(conflicts, {});
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error("One or more tests failed.");
}
