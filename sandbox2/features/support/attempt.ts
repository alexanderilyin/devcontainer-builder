import { World } from './world.js';

// Shared by every "I attempt to define <Type> known as ..." negative-test
// step - catches into World.lastError instead of letting the scenario
// abort, so a paired "Then it should have failed with ..." step can assert
// on it. `fn` may be async (e.g. a poll step) - `await` on a non-Promise
// value resolves immediately, so this works uniformly for both; because it
// now returns a real Promise, every call site must `return attempt(...)`
// (not just call it) so cucumber-js actually waits for it.
export async function attempt(world: World, fn: () => void | Promise<void>): Promise<void> {
  world.lastError = undefined;
  try {
    await fn();
  } catch (error) {
    world.lastError = error as Error;
  }
}
