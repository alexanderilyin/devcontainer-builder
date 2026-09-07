import { World } from './world.js';

// Shared by every "I attempt to define <Type> known as ..." negative-test
// step - catches into World.lastError instead of letting the scenario
// abort, so a paired "Then it should have failed with ..." step can assert
// on it.
export function attempt(world: World, fn: () => void): void {
  world.lastError = undefined;
  try {
    fn();
  } catch (error) {
    world.lastError = error as Error;
  }
}
