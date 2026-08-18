import { html, type HtmlResult } from "@merivale/womble";

export default (): HtmlResult => html`
  <h3>Command Structures</h3>
  <p>
    Selection and ordering of commands is done by <em>sequencing</em>,
    <em>conditional selection</em>, and <em>looping</em>.
  </p>

  <h4>Sequencing of Commands</h4>
  <p>
    Commands to be performed in sequence are usually placed in the appropriate
    order within the program, e.g.:
  </p>
  <pre><code data-language="BASIC">COLOUR(GREEN) BLOT(100) PAUSE(1000) COLOUR(RED) FORWARD(450) REM etc.</code></pre>
  <p>(From the first example program in the Help menu.)</p>

  <h4>Conditional Selection of Commands</h4>
  <p>
    Suppose you want to draw a blot with a given radius (stored as the integer
    variable
    <code data-language="BASIC">radius%</code>), but only if that value is less
    than 500; do it like this:
  </p>
  <pre><code data-language="BASIC">IF radius% &lt; 500 THEN BLOT(radius%) ENDIF</code></pre>
  <p>
    If you want to do something different when the condition is not met (e.g.
    drawing a blot with half the radius), extend the
    <code data-language="BASIC">IF - THEN</code> structure by adding
    <code data-language="BASIC">ELSE</code> and then the new command:
  </p>
  <pre><code data-language="BASIC">IF radius% &lt; 500 THEN BLOT(radius%) ELSE BLOT(radius% / 2) ENDIF</code></pre>

  <h4>Grouping of Commands</h4>
  <p>
    A sequence of commands within an
    <code data-language="BASIC">IF - THEN - ELSE - ENDIF</code> structure is
    always treated as a single command. The
    <code data-language="BASIC">ELSE</code> and
    <code data-language="BASIC">ENDIF</code> words bracket off the sequence of
    commands. (Another possibility is to package them into a procedure.) You can
    also write these on a single line without the
    <code data-language="BASIC">ENDIF</code>, like this:
  </p>
  <pre><code data-language="BASIC">IF radius% &lt; 500 THEN BLOT(radius%)</code></pre>

  <h4>Spacing and Indenting</h4>
  <p>
    Unnecessary ‘white space’ is ignored by BASIC, so you can use line breaks
    and indenting to make the structure of your program easy to read. However,
    each statement must be on its own line, unless separated by a colon ‘:’.
  </p>

  <h4>Looping Structures</h4>
  <p>
    BASIC provides three different structures for looping (or ‘iterating’)
    commands. If you know in advance how many times you want to loop – or you
    want to ‘loop over’ a particular range of values (e.g. from 1 to 200), then
    the simplest is a ‘<code data-language="BASIC">FOR</code>
    loop’ (or ‘counting loop’):
  </p>
  <pre><code data-language="BASIC">FOR count% = 1 TO 200 FORWARD(count% / 3) RIGHT(5) REM etc. NEXT</code></pre>
  <p>
    (From the first <code data-language="BASIC">FOR</code> loop example program
    in the Help menu.)
  </p>
  <p>
    Here, <code data-language="BASIC">NEXT</code> is used to bracket together a
    number of commands, and indenting is used to show the structure.
  </p>
  <p>
    To count downwards, use <code data-language="BASIC">STEP -1</code> at then
    end (as in the ‘Procedure with parameter’ example program).
  </p>
  <p>
    In a <code data-language="BASIC">FOR</code> loop, the ‘loop variable’ (here
    <code data-language="BASIC">count%</code>) is given in turn each of the
    values in the range (here 1, 2, 3, …, 199, 200), and the loop instructions
    are performed each time. So in the example above, a spiral is drawn as the
    Turtle moves forward gradually more and more (as
    <code data-language="BASIC">count%</code> increases).
  </p>
  <p>
    If instead of looping a specific number of times, you want to loop through
    some sequence of commands until some particular condition becomes true, then
    you can use:
  </p>
  <pre><code data-language="BASIC">REPEAT REM command1 REM command2 (etc.) UNTIL REM condition</code></pre>
  <p>
    The ‘Simple procedure’ example program does this, looping until the Turtle
    is pointing directly north (i.e.,
    <code data-language="BASIC">TURTD% = 0</code>).
  </p>
  <p>
    Alternatively, you can loop through a sequence of commands while some
    condition is true (so that it stops when the condition becomes false):
  </p>
  <pre><code data-language="BASIC">WHILE REM condition REM sequence of commands ENDWHILE</code></pre>
  <p>
    Things that can be done with a
    <code data-language="BASIC">REPEAT</code> loop can equally be done with a
    <code data-language="BASIC">WHILE</code> loop (and vice-versa), but
    sometimes one is more natural than the other. Notice also that a
    <code data-language="BASIC">REPEAT</code> loop always executes the sequence
    of commands at least once, because it tests the condition at the end of the
    loop. But a <code data-language="BASIC">WHILE</code> loop tests the
    condition <em>before</em> executing the sequence of commands, and so will
    not execute them even once if condition is false to start with. (For
    examples of the various loops, see the second set of example programs,
    ‘Further commands and structures’.)
  </p>
`;
