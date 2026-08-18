import type { ExampleGroupId } from "./exampleGroups.ts";
import type { Language } from "./languages.ts";

export interface Example {
  readonly __: "Example";
  readonly groupId: ExampleGroupId;
  readonly id: string;
  readonly names: Partial<Record<Language, string | null>>;
}

const example = (
  groupId: ExampleGroupId,
  id: string,
  name: string,
  names: Partial<Record<Language, string | null>> = {},
): Example => ({
  __: "Example",
  groupId,
  id,
  names: {
    BASIC: name,
    C: name,
    Java: name,
    Pascal: name,
    Python: name,
    TypeScript: name,
    ...names,
  },
});

export const examples = [
  // examples 1 - Drawing
  example("Drawing", "DrawPause", "Simple drawing with pauses"),
  example("Drawing", "SmileyFace", "Smiley face [PENUP, ELLBLOT]"),
  example("Drawing", "ThePlough", "The plough [SETXY, POLYLINE]"),
  example("Drawing", "OlympicRings", "Olympic rings (uses a variable)"),
  example("Drawing", "ForLoop", "FOR loop (uses a counting variable)"),
  example("Drawing", "TriangleSpin", "Spinning triangle pattern [MOVEXY]"),
  example("Drawing", "Circles", "Circling circles"),
  example("Drawing", "NestedLoops", "Nested FOR loops [DIRECTION, RGB]"),
  example("Drawing", "CycleColours", "Multi-coloured spiral [RGB]"),
  example(
    "Drawing",
    "Recolouring",
    "Recolouring and filling shapes [RECOLOUR, FILL]",
    {
      C: null,
      Java: null,
      TypeScript: null,
    },
  ),
  example(
    "Drawing",
    "RandomLines",
    "Random lines pattern [IF, PIXCOL, RECOLOUR]",
  ),
  example("Drawing", "RandomEllipses", "Random ellipses pattern"),
  // examples 2 - Procedures
  example("Procedures", "ColourSpiral", "Spiral of colours [WHILE, RANDCOL]", {
    BASIC: "Spiral of colours [REPEAT, RNDCOL]",
    Pascal: "Spiral of colours [REPEAT, RANDCOL]",
    Python: "Spiral of colours [WHILE, RNDCOL]",
  }),
  example("Procedures", "SimpleProc", "Simple procedure [WHILE, TURTD]", {
    BASIC: "Simple procedure [REPEAT, TURTD]",
    Pascal: "Simple procedure [REPEAT, TURTD]",
  }),
  example("Procedures", "ParameterProc", "Function with parameter", {
    BASIC: "Procedure with parameter",
    Pascal: "Procedure with parameter",
  }),
  example(
    "Procedures",
    "ResizableFace",
    "Resizable face (hierarchical functions)",
    {
      BASIC: "Resizable face (hierarchical procedures)",
      Pascal: "Resizable face (nested procedures)",
    },
  ),
  example(
    "Procedures",
    "Polygons",
    "Polygons (uses 2 parameters) [POLYGON, POLYLINE]",
  ),
  example("Procedures", "Stars", "Stars [ANGLES, FORGET]"),
  example(
    "Procedures",
    "PolygonRings",
    "Polygon rings (uses 3 parameters) [MOD]",
  ),
  example("Procedures", "Triangle1", "Simple triangle"),
  example("Procedures", "Triangle2", "Triangle function", {
    BASIC: "Triangle procedure",
    Pascal: "Triangle procedure",
  }),
  example("Procedures", "Triangle3", "Triangle function with limit", {
    BASIC: "Triangle procedure with limit",
    Pascal: "Triangle procedure with limit",
  }),
  example("Procedures", "Triangles", "Recursive triangles"),
  example(
    "Procedures",
    "Factorials",
    "Recursive factorials [Function, OUTPUT]",
    {
      Pascal: "Recursive factorials [FUNCTION, OUTPUT]",
    },
  ),
  // examples 3 - Further
  example("Further", "YouAreHere", "Text and arrow [DISPLAY]"),
  example("Further", "Clock", "Analogue clock (nested WHILE loops)", {
    BASIC: "Analogue clock (nested REPEAT loops)",
    Pascal: "Analogue clock (nested REPEAT loops)",
  }),
  example("Further", "DigitalClock", "Digital clock [IF, WHILE]"),
  example("Further", "Flashlights", "Flashlights (using Booleans)"),
  example("Further", "RefParams", "Reference parameters", {
    BASIC: "Reference parameters (using RETURN)",
    Python: "Reference parameters [PEEK, POKE]",
  }),
  example("Further", "Balls3D", "3D colour effects"),
  example("Further", "StringFunctions", "Standard string functions"),
  example("Further", "UserStringFunctions", "User-defined string functions"),
  example("Further", "ListFunctions", "Python list functions", {
    BASIC: null,
    C: null,
    Java: null,
    Pascal: null,
    TypeScript: null,
  }),
  example("Further", "MathFunctions", "Mathematical functions"),
  example("Further", "TrigGraphs", "Trigonometric graphs"),
  // examples 4 - Movement
  example("Movement", "MovingBall", "Moving ball (using variables)"),
  example("Movement", "BouncingBall", "Bouncing ball (using variables)"),
  example("Movement", "TurtleMove", "Moving ball (using Turtle)"),
  example("Movement", "TurtleBounce", "Bouncing ball (using Turtle)"),
  example("Movement", "BouncingFace", "Bouncing face"),
  example("Movement", "MultiBounce", "Multiple bouncing balls"),
  example("Movement", "BouncingTriangle", "Bouncing triangle"),
  example("Movement", "BouncingShapes", "Multiple bouncing shapes"),
  example("Movement", "GravitySteps", "Movement under gravity"),
  example("Movement", "SolarSystem", "Solar system"),
  // these two examples aren't working properly :(
  // example("Movement", "BirdTree", "Bird and tree - student example", {
  //   BASIC: null,
  //   C: null,
  //   Java: null,
  //   Python: null,
  //   TypeScript: null,
  // }),
  // example("Movement", "ChickenCoop", "Chicken coop - student example", {
  //   BASIC: null,
  //   C: null,
  //   Java: null,
  //   Python: null,
  //   TypeScript: null,
  // }),
  // examples 5 - Interaction
  example("Interaction", "AskInput", "Asking for typed input"),
  example("Interaction", "QuickClick", "Mouse reaction game"),
  example("Interaction", "TypingTest", "Typing test (checking characters)"),
  example("Interaction", "TypingTestKeys", "Typing test (checking keys)"),
  example("Interaction", "IterationGame", "Iteration game (Collatz sequence)"),
  example("Interaction", "SpongeThrow", "Throwing sponges at a moving face"),
  example("Interaction", "Arcade", "Arcade shooting game"),
  example("Interaction", "ColourCells", "Colouring cells", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Interaction", "SnakeGame", "Snake (classic game)"),
  example("Interaction", "SimpleDraw", "Drawing to the mouse"),
  example("Interaction", "PaintApp", "Painting application"),
  example(
    "Interaction",
    "MultipleTurtles",
    "Multiple turtles and varying ANGLES",
    {
      Python: null,
    },
  ),
  // examples 6 - Files
  // example("Files", "WriteAndReadFile", "Writing and reading a text file"),
  // example("Files", "RenameAndDeleteFile", "Renaming and deleting a file"),
  // example("Files", "FileSearching", "File searching"),
  // example("Files", "SaveCSV", "Saving a CSV file"),
  // example("Files", "ReadCSV", "Reading a CSV file"),
  // example("Files", "RandomSentences", "Random sentences (using files)"),
  // example("Files", "FileCommands", "File commands"),
  // example("Files", "DirectoryCommands", "Directory commands"),
  // examples 7 - Cellular
  example("Cellular", "TippingPoint", "Tipping point (city epidemic)", {
    Java: null,
    TypeScript: null,
  }),
  example("Cellular", "Disease", "Spread of disease", {
    Java: null,
    TypeScript: null,
  }),
  example("Cellular", "GameOfLife", "Conway’s Game of Life", {
    Java: null,
    TypeScript: null,
  }),
  example("Cellular", "GameOfLifeSetup", "Game of Life with user setup", {
    Java: null,
    TypeScript: null,
  }),
  example("Cellular", "LifeArrays", "Game of Life, using arrays", {
    Java: null,
    Python: "Game of Life, using lists",
    TypeScript: null,
  }),
  example("Cellular", "Automata", "One-dimensional cellular automata", {
    Java: null,
    TypeScript: null,
  }),
  example("Cellular", "Diffusion", "Diffusion in a tapering tube", {
    Java: null,
    TypeScript: null,
  }),
  example("Cellular", "Dendrites", "Dendritic crystal growth", {
    Java: null,
    TypeScript: null,
  }),
  example("Cellular", "Schelling", "Schelling’s segregation model", {
    Java: null,
    TypeScript: null,
  }),
  example("Cellular", "IteratedPD", "Iterated Prisoner’s Dilemma", {
    Java: null,
    TypeScript: null,
  }),
  // examples 8 - Models
  example("Models", "AimCannon", "Firing a cannon (manual)", {
    Java: null,
    TypeScript: null,
  }),
  example("Models", "AutoCannon", "Firing a cannon (automatic)", {
    Java: null,
    TypeScript: null,
  }),
  example("Models", "Launch", "Launching a rocket into orbit", {
    Java: null,
    TypeScript: null,
  }),
  example("Models", "BrownianMotion", "Brownian motion", {
    Java: null,
    TypeScript: null,
  }),
  example("Models", "Cheetahs", "Cheetahs and gazelles", {
    Java: null,
    TypeScript: null,
  }),
  example("Models", "SexRatio", "Evolution of sex ratio", {
    Java: null,
    TypeScript: null,
  }),
  example("Models", "Flocking", "Flocking behaviour", {
    Java: null,
    TypeScript: null,
  }),
  example("Models", "Roads", "Town road simulation", {
    Java: null,
    TypeScript: null,
  }),
  example("Models", "Interference", "Wave interference tutor", {
    BASIC: null,
    Java: null,
    TypeScript: null,
  }),
  example("Models", "TwoSlits", "Interference from two slits", {
    BASIC: null,
    Java: null,
    TypeScript: null,
  }),
  example("Models", "WaveSuperposer", "Hugh Wallis's wave superposer", {
    BASIC: null,
    C: null,
    Java: null,
    Python: null,
    TypeScript: null,
  }),
  // examples 9 - Fractals
  example("Fractals", "RecursionFactory", "Recursion factory", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Fractals", "RecursiveTree", "Recursive tree", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Fractals", "KochSnowflake", "Koch snowflake", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Fractals", "SquareKoch", "Square Koch fractal curves", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Fractals", "Sierpinski", "Sierpinski triangle (by deletion)", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example(
    "Fractals",
    "SierpinskiDots",
    "Sierpinski triangle (by random dots)",
    {
      C: null,
      Java: null,
      TypeScript: null,
    },
  ),
  example(
    "Fractals",
    "IFSBackground",
    "Iterated function systems (IFS) background",
    {
      C: null,
      Java: null,
      TypeScript: null,
    },
  ),
  example("Fractals", "IFSColour", "IFS mappings on coloured background", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Fractals", "IFSDemonstrator", "IFS demonstrator program", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example(
    "Fractals",
    "SierpinskiIFS",
    "Sierpinski triangle (by iterated function system)",
    {
      BASIC: null,
      C: null,
      Java: null,
      Pascal: null,
      TypeScript: null,
    },
  ),
  example(
    "Fractals",
    "DragonIFS",
    "Dragon curve (by iterated function system)",
    {
      BASIC: null,
      C: null,
      Java: null,
      Pascal: null,
      TypeScript: null,
    },
  ),
  example("Fractals", "Logistic", "Logistic equation", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Fractals", "LogisticSpider", "Logistic spider", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Fractals", "MandelbrotDemo", "Mandelbrot multi-colour", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Fractals", "MandelbrotSpectrumDemo", "Mandelbrot spectral colours", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Fractals", "Quine", "Quine (self-replicating) program", {
    BASIC: null,
    C: null,
    Java: null,
    Python: null,
    TypeScript: null,
  }),
  // examples 10 - Logic&CS
  example("Logic&CS", "Hanoi", "Tower of Hanoi by recursion", {
    BASIC: null,
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Logic&CS", "BinarySearch", "Binary search guessing game", {
    BASIC: null,
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Logic&CS", "IterateRoot", "Square roots by iteration", {
    BASIC: null,
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example(
    "Logic&CS",
    "Fibonacci",
    "Fibonacci recursion and iteration (dynamic programming)",
    {
      C: null,
      Java: null,
      TypeScript: null,
    },
  ),
  example("Logic&CS", "Sorting", "Comparison of sorting methods", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example(
    "Logic&CS",
    "SortingStrings",
    "Comparison of sorting methods (strings)",
    {
      C: null,
      Java: null,
      TypeScript: null,
    },
  ),
  example("Logic&CS", "NoughtsAndCrosses", "Noughts and crosses", {
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Logic&CS", "NimLearn", "Nim learning program", {
    BASIC: null,
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Logic&CS", "MultiNim", "Nim with multiple piles", {
    C: null,
    Java: null,
    Python: null,
    TypeScript: null,
  }),
  example("Logic&CS", "KnightsTour", "Knight’s Tour program", {
    BASIC: null,
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Logic&CS", "TuringMachines", "Turing machine simulator", {
    BASIC: null,
    C: null,
    Java: null,
    TypeScript: null,
  }),
  example("Logic&CS", "Syllogisms", "Syllogism testing program", {
    BASIC: null,
    C: null,
    Java: null,
    Python: null,
    TypeScript: null,
  }),
] as const;
