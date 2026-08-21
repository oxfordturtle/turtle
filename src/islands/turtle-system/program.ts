/// <reference lib="dom" />
import {
  analyse,
  type CommentLexeme,
  encode,
  type EncoderOptions,
  type Lexeme,
  lexify,
  parse,
  type Token,
  tokenize,
  type UsageCategory,
} from "@/core/compiler.ts";
import {
  exampleGroups,
  examples,
  extension,
  type Language,
} from "@/core/constants.ts";
import * as machine from "@/core/machine.ts";
import type { MachineOptions } from "@/core/machine.ts";
import canvas from "@/client/adapters/canvas.ts";
// `files` is this module's own file memory, so the filesystem port takes the
// longer name.
import fileSystem from "@/client/adapters/files.ts";
import output from "@/client/adapters/output.ts";
import timers from "@/client/adapters/timers.ts";
import { load, save } from "@/client/state/storage.ts";
import { showError, SystemError } from "@/client/tools/error.ts";
import { store } from "@merivale/womble";
import { syncLanguage } from "@/islands/settings.ts";
import { File, restoreFile, skeletons } from "./file.ts";

/**
 * The open files, and everything the compiler derives from the current one. See
 * src/README.md for how the three stores divide the state between them.
 *
 * **No side effects at import time**: @/islands/settings.ts imports this module
 * for the file-level half of a language change, and that store is read on every
 * page of the site, including the ones with no system on them. `initialise()`
 * is what reads `sessionStorage`, and the client entry calls it.
 *
 * The import goes both ways - this module calls `syncLanguage` when opening a
 * file changes the language under the settings, and that module calls
 * `applyLanguage` below when the user changes the language under the files.
 * Neither reaches the other while its own module is still evaluating, which is
 * the only thing a cycle between two side-effect-free modules can break.
 */

// ---------------------------------------------------------------- the state

type Program = {
  files: File[];
  currentFileIndex: number;
  tokens: Token[];
  // comments are lexemes too, and the Comments tab wants exactly the ones the
  // Syntax tab filters out, so both are kept in one array and split on the way
  // out
  allLexemes: Lexeme[];
  usage: UsageCategory[];
  pcode: number[][];
};

// The parsed AST is deliberately not kept: it is an intermediate of `compile`
// below, and nothing displays it - the Variables tab, which would, is still a
// placeholder.

// `initialise`'s re-entry guard is the store itself: `restore` always leaves at
// least one file, and nothing below ever empties the list again, so an empty
// list is exactly "not yet initialised". A module-level flag would say the same
// thing today, but would outlive a test harness's `resetStore` - the store
// resets, the flag doesn't, and `initialise` would refuse to restore what a
// fresh page load restores.

/**
 * Uncoalesced, unlike ./machine.ts's: the writers below are driven by the user,
 * so there is never a burst to batch.
 *
 * **Never seeded**: `storeSeeds()` serialises what was seeded rather than what a
 * store holds, so `pcode`, `tokens` and the `File` objects - a class with
 * getters, which is why `restoreFile` exists - never reach `JSON.stringify`.
 *
 * **Actions never call other actions.** Where two transitions share work, the
 * shared part is a helper below that returns a partial and both actions spread
 * it. An inner dispatch would notify twice for one user gesture, and - the one
 * that actually bites - would commit before the outer action returns, so the
 * outer's partial would silently clobber it.
 */
export const programStore = store("program", {
  state: {
    files: [],
    currentFileIndex: 0,
    tokens: [],
    allLexemes: [],
    usage: [],
    pcode: [],
  } as Program,
  actions: {
    /**
     * The file memory as `initialise` read it back out of `sessionStorage`,
     * resolved against what this page can actually show.
     */
    restore: (
      _state,
      { restored, storedIndex }: { restored: File[]; storedIndex: number },
    ) => {
      const language = currentLanguage();
      // clamped: the index and the list are separate storage entries, so
      // nothing guarantees the stored index still points at a file
      const files = [...restored];
      let currentFileIndex = Math.min(
        Math.max(storedIndex, 0),
        files.length - 1,
      );
      let derived: Partial<Program> = {};
      if (files.length === 0) {
        files.push(new File(language));
        currentFileIndex = 0;
      } else if (files.length === 1 && files[0].code === "") {
        files[0].language = language;
      } else {
        derived = { tokens: tokenize(files[currentFileIndex].code, language) };
      }
      // the session doesn't store compilation results, so a file compiled when
      // the page was last unloaded is compiled again here, in the *current*
      // language rather than its own
      return files[currentFileIndex]?.compiled
        ? {
            files,
            currentFileIndex,
            ...compile(files, currentFileIndex, language),
          }
        : { files, currentFileIndex, ...derived };
    },

    /** Replaces the current file's source, and re-tokenizes for the syntax highlighting. */
    setCode: (state, code: string) => {
      const file = state.files[state.currentFileIndex];
      if (!file) return undefined;
      file.code = code;
      file.edited = true;
      file.compiled = false;
      save("files", state.files);
      return {
        files: [...state.files],
        tokens: tokenize(code, currentLanguage()),
      };
    },

    rename: (state, name: string) => {
      const file = state.files[state.currentFileIndex];
      if (!file) return undefined;
      file.name = name;
      file.edited = true;
      save("files", state.files);
      return { files: [...state.files] };
    },

    /**
     * Switches to another open file and re-derives its displays. The language
     * comes off the file itself rather than out of storage, so no save has to
     * happen first.
     */
    select: (state, index: number) => {
      save("currentFileIndex", index);
      const file = state.files[index];
      const language = file?.language ?? currentLanguage();
      return {
        currentFileIndex: index,
        ...(file?.compiled
          ? compile(state.files, index, language)
          : derive(state.files, index, language)),
      };
    },

    /** Adds a file to the file memory, and makes it the current one. */
    add: (state, file: File) => {
      const placed = place(state, file);
      return {
        ...placed,
        ...derive(placed.files, placed.currentFileIndex, file.language),
      };
    },

    /**
     * The same, for a `.tmx`/`.tgx` export, whose compiled artifacts come out of
     * the file rather than being derived from it.
     */
    addExport: (
      state,
      {
        file,
        usage,
        pcode,
      }: {
        file: File;
        usage: UsageCategory[];
        pcode: number[][];
      },
    ) => {
      const placed = place(state, file);
      const tokens = tokenize(file.code, file.language);
      file.compiled = true;
      save("files", placed.files);
      return {
        ...placed,
        tokens,
        allLexemes: lexify(tokens, file.language),
        usage,
        pcode,
      };
    },

    /** Closes the current file; closing the last one leaves a fresh empty one in its place. */
    close: (state) => {
      const remaining = state.files
        .slice(0, state.currentFileIndex)
        .concat(state.files.slice(state.currentFileIndex + 1));
      if (remaining.length === 0) {
        const file = new File(currentLanguage());
        const files = [file];
        save("files", files);
        save("currentFileIndex", 0);
        return {
          files,
          currentFileIndex: 0,
          ...derive(files, 0, file.language),
        };
      }
      // even when the index doesn't move, everything downstream of it is now a
      // different file
      const index = Math.min(state.currentFileIndex, remaining.length - 1);
      const file = remaining[index];
      save("files", remaining);
      save("currentFileIndex", index);
      return {
        files: remaining,
        currentFileIndex: index,
        ...(file.compiled
          ? compile(remaining, index, file.language)
          : derive(remaining, index, file.language)),
      };
    },

    /** Compiles the current file, keeping whatever each stage produced for the tabs that display it. */
    compile: (state) => {
      const file = state.files[state.currentFileIndex];
      if (!file) return undefined;
      return {
        files: [...state.files],
        ...compile(state.files, state.currentFileIndex, currentLanguage()),
      };
    },

    /** The file-level half of a language change - see `applyLanguage` below. */
    adoptLanguage: (state, language: Language) => {
      const file = state.files[state.currentFileIndex];
      // deno-coverage-ignore-start -- unreachable: the only dispatcher is
      // `applyLanguage` below, which has already returned if there is no
      // current file. Kept because every other action carries the same guard.
      if (!file) return undefined;
      // deno-coverage-ignore-stop
      file.compiled = false;
      save("files", state.files);
      return {
        files: [...state.files],
        tokens: tokenize(file.code, language),
      };
    },

    backup: (state) => {
      const file = state.files[state.currentFileIndex];
      if (!file) return undefined;
      file.backup = file.code;
      save("files", state.files);
      return { files: [...state.files] };
    },
  },
});

/** Registers a listener, called after every change below. Returns an unsubscribe. */
export const subscribe = programStore.subscribe;

// ------------------------------------------------------------- the readers

export const getFiles = (): File[] => programStore.get("files");

export const getCurrentFileIndex = (): number =>
  programStore.get("currentFileIndex");

/** The open file. `undefined` only before `initialise()`, i.e. on a page with no system. */
export const getCurrentFile = (): File | undefined => {
  const files = programStore.get("files");
  const currentFileIndex = programStore.get("currentFileIndex");
  return files[currentFileIndex];
};

export const getCode = (): string => getCurrentFile()?.code ?? "";

export const getFilename = (): string => getCurrentFile()?.name ?? "";

export const getTokens = (): Token[] => programStore.get("tokens");

/** The program's lexemes, minus the comments - what the Syntax tab lists. */
export const getLexemes = (): Lexeme[] =>
  programStore.get("allLexemes").filter((x) => x.type !== "comment");

/** The comments, which are the lexemes the above drops - what the Comments tab lists. */
export const getComments = (): CommentLexeme[] =>
  programStore
    .get("allLexemes")
    .filter((x) => x.type === "comment") as CommentLexeme[];

export const getUsage = (): UsageCategory[] => programStore.get("usage");

export const getPcode = (): number[][] => programStore.get("pcode");

// ------------------------------------------------------------------ set-up

/** Reads the file memory back out of `sessionStorage`. Idempotent, and called once from the client entry. */
export const initialise = (): void => {
  if (programStore.get("files").length > 0) return;
  programStore.dispatch("restore", {
    restored: (load("files") as unknown[]).map(restoreFile),
    storedIndex: load("currentFileIndex") as number,
  });
};

// ------------------------------------------------------------ file memory
//
// Each of these is one dispatch, plus whatever part of the job isn't the
// store's: halting the machine, prompting for a file, telling the settings store
// which language the new file brought with it.

/** Replaces the current file's source, and re-tokenizes for the syntax highlighting. */
export const setCode = (code: string): void => {
  programStore.dispatch("setCode", code);
};

export const renameFile = (name: string): void => {
  programStore.dispatch("rename", name);
};

/** Switches to another open file, adopting its language and re-deriving its displays. */
export const selectFile = (index: number): void => {
  programStore.dispatch("select", index);
  adoptFileLanguage();
};

export const newFile = (skeleton = false): void => {
  const file = new File(currentLanguage());
  if (skeleton) file.code = skeletons[file.language];
  addFile(file);
};

export const closeCurrentFile = (): void => {
  machine.halt();
  programStore.dispatch("close");
  adoptFileLanguage();
};

/** Opens a file's content, working out which language it is from its extension. */
export const openFile = (
  filename: string,
  content: string,
  example: string | null = null,
): void => {
  const file = new File(currentLanguage(), example);
  const bits = filename.split(".");
  const ext = bits.pop();
  const name = bits.join(".");
  const language = languageOfExtension(ext);
  if (language) {
    file.language = language;
    file.name = name;
    file.code = content.trim().replace(/\r\n/g, "\n");
    addFile(file);
    return;
  }
  if (ext === "tmx" || ext === "tgx") {
    openExport(file, name, content);
    return;
  }
  // "tmj" (pcode as JSON) and "tmb" (pcode as binary) are both still TODO
  showError(new SystemError("Invalid file type."));
};

/** Prompts for a file from disk. */
export const openLocalFile = (): void => {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => openFile(file.name, reader.result as string);
    reader.readAsText(file);
  });
  fileInput.click();
};

export const openRemoteFile = (_url: string): void => {
  showError(new SystemError("Feature not yet available."));
};

// What the example loaders below call instead of the global `fetch`: the jsdom
// test layer has no network, so it installs a fetcher that serves
// `assets/examples/` from disk. A wrapper rather than a bare alias, so the real
// `fetch` keeps its own `this`.
let fetcher: typeof fetch = (input, init) => fetch(input, init);

/** Test seam: replaces the `fetch` the example loaders use. */
export const setFetcher = (replacement: typeof fetch): void => {
  fetcher = replacement;
};

export const openExampleFile = (exampleId: string): void => {
  const example = examples.find((x) => x.id === exampleId);
  if (!example) {
    showError(new SystemError(`Unknown example "${exampleId}".`));
    return;
  }
  const language = currentLanguage();
  const filename = `${example.id}.${extension[language]}`;
  const path = `/examples/${language}/${example.groupId}/${filename}`;
  fetcher(path).then((response) => {
    if (!response.ok) {
      showError(
        new SystemError(
          `Example "${exampleId}" is not available for Turtle ${language}.`,
        ),
      );
      return;
    }
    response
      .text()
      .then((content) => openFile(filename, content.trim(), exampleId));
  });
};

export const openExampleGroup = (groupId: string): void => {
  const group = exampleGroups.find((x) => x.id === groupId);
  if (!group) {
    showError(new SystemError(`Group ID ${groupId} not found.`));
    return;
  }
  for (const example of group.examples) openExampleFile(example.id);
};

export const saveLocalFile = (): void => {
  const file = getCurrentFile();
  if (!file) return;
  download(file.code, file.filename);
};

export const saveRemoteFile = (): void => {
  showError(new SystemError("Feature not yet available."));
};

// Notifies, because the backup is a field on a file the store owns: a mutation
// the commit path doesn't know about is a change nobody is told of.
export const backupCode = (): void => {
  programStore.dispatch("backup");
};

export const restoreCode = (): void => {
  const file = getCurrentFile();
  if (!file || file.code === file.backup) return;
  setCode(file.backup);
};

export const outputAllExamples = async (): Promise<void> => {
  const language = currentLanguage();
  let text = "";
  for (const example of examples) {
    const filename = `${example.id}.${extension[language]}`;
    const response = await fetcher(
      `/examples/${language}/${example.groupId}/${filename}`,
    );
    text += `Example ${example.id}:\n----------\n${await response.text()}\n\n\n`;
  }
  download(text, `${language}_examples.txt`);
};

// ------------------------------------------------------------- compilation

/** Compiles the current file, and keeps whatever each stage produced for the tabs that display it. */
export const compileCurrentFile = (): void => {
  programStore.dispatch("compile");
};

/**
 * The file-level half of a language change; the settings half belongs to
 * @/islands/settings.ts, which calls this from its own `setSetting`.
 */
export const applyLanguage = (language: Language): void => {
  const file = getCurrentFile();
  // there is no file yet when the language arrives from ?l= on first load
  if (!file) return;
  programStore.dispatch("adoptLanguage", language);
  if (file.example && load("loadCorrespondingExample")) {
    openExampleFile(file.example);
  }
};

// ----------------------------------------------------------- the machine

/**
 * RUN, and the play/pause half of the transport controls. `machine.run()` takes
 * the four outbound ports as arguments, which an isomorphic module can only pass
 * because the adapters take their elements from the components that render them
 * rather than querying for them at import.
 */
export const playPauseMachine = (): void => {
  if (machine.isRunning()) {
    machine.playOrPause();
    return;
  }
  const file = getCurrentFile();
  if (!file) return;
  if (!file.compiled) compileCurrentFile();
  // `getPcode()` rather than a value read before the dispatch: the compile that
  // may just have run is what produced it
  if (file.compiled) {
    machine.run(
      getPcode(),
      machineOptions(),
      timers,
      output,
      canvas,
      fileSystem,
    );
  }
};

// ------------------------------------------------------------- internals

const currentLanguage = (): Language => load("language") as Language;

// --- the two shared transitions, as partials rather than as commits ---------
//
// What "actions never call other actions" is bought with: `select`, `close` and
// `restore` each spread one of these into their own single commit.

/** What a file's displays derive from its own source, with nothing compiled yet. */
const derive = (
  files: File[],
  index: number,
  language: Language,
): Partial<Program> => ({
  tokens: tokenize(files[index]?.code ?? "", language),
  allLexemes: [],
  usage: [],
  pcode: [],
});

/**
 * The whole compile pipeline, as the fields it produces. Accumulated stage by
 * stage rather than returned at the end, so a failure keeps whatever the earlier
 * stages produced - a program that lexes and then fails to parse still updates
 * the syntax highlighting.
 */
const compile = (
  files: File[],
  index: number,
  language: Language,
): Partial<Program> => {
  const file = files[index];
  file.language = language;
  const next: Partial<Program> = {};
  try {
    next.tokens = tokenize(file.code, language);
    next.allLexemes = lexify(next.tokens, language);
    const program = parse(next.allLexemes, language);
    next.usage = analyse(next.allLexemes, program);
    next.pcode = encode(program, compilerOptions());
    file.compiled = true;
    save("files", files);
  } catch (error) {
    showError(error);
  }
  return next;
};

/**
 * Where a newly opened file goes: over an untouched empty placeholder if there
 * is one, on the end otherwise. Shared by `add` and `addExport`.
 */
const place = (
  state: Program,
  file: File,
): { files: File[]; currentFileIndex: number } => {
  const current = state.files[state.currentFileIndex];
  const replacing =
    current !== undefined && current.code === "" && current.edited === false;
  const files = replacing
    ? state.files.map((existing, index) =>
        index === state.currentFileIndex ? file : existing,
      )
    : [...state.files, file];
  const currentFileIndex = replacing
    ? state.currentFileIndex
    : files.length - 1;
  save("files", files);
  save("currentFileIndex", currentFileIndex);
  return { files, currentFileIndex };
};

// --- the halves of a transition that aren't the store's ---------------------

/**
 * Tells the settings store to adopt the language the file just moved to brought
 * with it, so the language `<select>` and the language-visibility pass follow.
 * Runs after the commit, and only when the language actually changes - which
 * also means `applyLanguage` can never be re-entered from here.
 */
const adoptFileLanguage = (): void => {
  const file = getCurrentFile();
  if (!file || file.language === currentLanguage()) return;
  save("language", file.language);
  syncLanguage();
};

/** Adds a file to the file memory, and makes it the current one. */
const addFile = (file: File): void => {
  machine.halt();
  programStore.dispatch("add", file);
  adoptFileLanguage();
};

/** The `.tmx` export format: source code, plus the usage and pcode it compiled to. */
const openExport = (file: File, name: string, content: string): void => {
  let json: {
    language?: Language;
    name?: string;
    code?: string;
    usage?: UsageCategory[];
    pcode?: number[][];
  };
  try {
    json = JSON.parse(content);
  } catch {
    showError(new SystemError("Invalid TMX file."));
    return;
  }
  if (!(json.language && json.name && json.code && json.usage && json.pcode)) {
    showError(new SystemError("Invalid TMX file."));
    return;
  }
  file.language = json.language;
  file.name = name;
  file.code = json.code.trim().replace(/\r\n/g, "\n");
  machine.halt();
  programStore.dispatch("addExport", {
    file,
    usage: json.usage,
    pcode: json.pcode,
  });
  adoptFileLanguage();
};

const languageOfExtension = (ext: string | undefined): Language | null => {
  switch (ext) {
    case "tbas": // fallthrough
    case "tgb": // support old file extension
      return "BASIC";
    case "tc":
      return "C";
    case "tjav":
      return "Java";
    case "tpas": // fallthrough
    case "tgp": // support old file extension
      return "Pascal";
    case "tpy": // fallthrough
    case "tgy": // support old file extension
      return "Python";
    case "tts":
      return "TypeScript";
    default:
      return null;
  }
};

const download = (content: string, filename: string): void => {
  const anchor = document.createElement("a");
  anchor.setAttribute(
    "href",
    URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    ),
  );
  anchor.setAttribute("download", filename);
  anchor.click();
};

// The two option bundles the machine and the encoder take. Both read the
// settings *storage* rather than the store, which keeps them independent of
// whether the store has been initialised yet.
const machineOptions = (): MachineOptions => ({
  showCanvasOnRun: load("showCanvasOnRun"),
  showOutputOnWrite: load("showOutputOnWrite"),
  showMemoryOnDump: load("showMemoryOnDump"),
  drawCountMax: load("drawCountMax"),
  codeCountMax: load("codeCountMax"),
  smallSize: load("smallSize"),
  stackSize: load("stackSize"),
  traceOnRun: load("traceOnRun"),
  activateHCLR: load("activateHCLR"),
  preventStackCollision: load("preventStackCollision"),
  rangeCheckArrays: load("rangeCheckArrays"),
});

const compilerOptions = (): EncoderOptions => ({
  canvasStartSize: load("canvasStartSize"),
  setupDefaultKeyBuffer: load("setupDefaultKeyBuffer"),
  turtleAttributesAsGlobals: load("turtleAttributesAsGlobals"),
  initialiseLocals: load("initialiseLocals"),
  allowCSTR: load("allowCSTR"),
  separateReturnStack: load("separateReturnStack"),
  separateMemoryControlStack: load("separateMemoryControlStack"),
  separateSubroutineRegisterStack: load("separateSubroutineRegisterStack"),
});
