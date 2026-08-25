// deno-coverage-ignore-file -- the bundle entry runs `init()` at import time,
// so no test can load it without starting the app over; everything it does is
// covered through index.ts's `init`, which test/ui/lib/setup.ts calls per mount.

// The bundle entry: evaluate the client module (which registers every island)
// and run the startup. Kept to these two lines so that everything testable
// lives in index.ts's `init`, which test/ui/lib/setup.ts calls the same way.
import { init } from "./index.ts";

init();
