# Turtle

Turtle is a web application intended to teach programming. It is inspired by the
Logo programming language, and includes a turtle that can be moved around the
canvas to draw shapes and patterns. It supports variants of six languages:

- BASIC
- C
- Java
- Pascal
- Python
- TypeScript

Each language includes a core set of commands implementing the turtle graphics
metaphor, as well as a library of mathematical functions. These follow the
conventions of the respective languages as far as possible, but with some
diversion for the sake of overall consistency and owing to the constraints of
the system (for example, the system only supports integers, not floating point
numbers).

## The Virtual Machine

Turtle works by first compiling the source code into an intermediate
representation, which is then executed by a virtual machine. This serves two
educational purposes in this context:

- For beginners, it allows for very clear and targetted error messages from code
  errors.
- For more advanced students, it supports teaching about advanced programming
  concepts such as compilers, machine code, virtual machines, and memory
  management. Every aspect of the virtual machine is inspectable by the user
  (behind a UI toggle for advanced mode).

## Getting started

The codebase is written in TypeScript, and managed and run by Deno.

```
deno task start    # development server, with file watching
deno task test     # the fast test suites (~8s)
deno task build    # bundle the frontend JavaScript and CSS into assets/build/
deno task fmt      # format everything with Prettier
```

`deno task build` must have run at least once before the app is served, since
the pages reference `assets/build/index.js` and `assets/build/screen.css`.

## Where things are

| Path       | What's in it                                                      |
| ---------- | ----------------------------------------------------------------- |
| `src/`     | all the application code — **see [src/README.md](src/README.md)** |
| `test/`    | the test suite — **see [test/README.md](test/README.md)**         |
| `style/`   | the CSS                                                           |
| `assets/`  | images, example programs, and the built JavaScript and CSS        |
| `app.ts`   | the server entry point                                            |
| `build.ts` | the build script                                                  |

[src/README.md](src/README.md) is the entry point for reading the source: how
the compiler, the virtual machine and the UI are laid out, and the decisions
that shape each of them. [test/README.md](test/README.md) covers the four test
suites, when to run each, and the conventions for writing new tests.
