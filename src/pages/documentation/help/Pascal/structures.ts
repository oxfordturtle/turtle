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
    order within the program, separated by semicolons, e.g.:
  </p>
  <pre><code data-language="Pascal">colour(green); blot(100); pause(1000); colour(red); forward(450); &#123;etc.&#125;</code></pre>
  <p>(From the first example program in the Help menu.)</p>

  <h4>Conditional Selection of Commands</h4>
  <p>
    Suppose you want to draw a blot with a given radius (stored as the integer
    variable
    <code data-language="Pascal">radius</code>), but only if that value is less
    than 500; do it like this:
  </p>
  <pre><code data-language="Pascal">if radius &lt; 500 then blot(radius);</code></pre>
  <p>
    If you want to do something different when the condition is not met (e.g.
    drawing a blot with half the radius), extend the
    <code data-language="Pascal">if condition then</code> structure by adding
    <code data-language="Pascal">else</code> and then the new command:
  </p>
  <pre><code data-language="Pascal">if radius &lt; 500 then blot(radius) else blot(radius / 2);</code></pre>
  <p>
    Notice that this is a single complex command, so you must not put a
    semicolon before the
    <code data-language="Pascal">else</code> (if you do, Turtle will give you a
    warning).
  </p>

  <h4>Grouping of Commands</h4>
  <p>
    Sometimes you will want to do a sequence of commands within an
    <code data-language="Pascal"
      >if &#123;condition&#125; then &#123;command&#125; else</code
    >
    structure, in which case you can bracket them between
    <code data-language="Pascal">begin</code> and
    <code data-language="Pascal">end</code>, e.g.
  </p>
  <pre><code data-language="Pascal">if &#123;condition&#125; then begin &#123;sequence1&#125; end else begin &#123;sequence2&#125; end;</code></pre>
  <p>
    Any such bracketed sequence of commands is always treated as a single
    command. (Another possibility is to package them into a procedure.)
  </p>

  <h4>Spacing and Indenting</h4>
  <p>
    Unnecessary ‘white space’ is ignored by Pascal, so you can use line breaks
    and indenting to make the structure of your program easy to read.
  </p>

  <h4>Looping Structures</h4>
  <p>
    Pascal provides three different structures for looping (or ‘iterating’)
    commands. If you know in advance how many times you want to loop â€“ or you
    want to ‘loop over’ a particular range of values (e.g. from 1 to 200), then
    the simplest is a ‘<code data-language="Pascal">for</code>
    loop’ (or ‘counting loop’):
  </p>
  <pre><code data-language="Pascal">for count := 1 to 200 do begin forward(count / 3); right(5); &#123;etc.&#125; end;</code></pre>
  <p>
    (From the first <code data-language="Pascal">for</code> loop example program
    in the Help menu.)
  </p>
  <p>
    Again <code data-language="Pascal">begin &#123;commands&#125; end</code> is
    used to bracket together a number of commands, and indenting is used to show
    the structure.
  </p>
  <p>
    In a <code data-language="Pascal">for</code> loop, the ‘loop variable’ (here
    <code data-language="Pascal">count</code>) is given in turn each of the
    values in the range (here 1, 2, 3, …, 199, 200), and the loop instructions
    are performed each time. So in the example above, a spiral is drawn as the
    Turtle moves forward gradually more and more (as
    <code data-language="Pascal">count</code> increases).
  </p>
  <p>
    To count downwards, use <code data-language="Pascal">downto</code> instead
    of <code data-language="Pascal">to</code> (as in the ‘Procedure with
    parameter’ example program.
  </p>
  <p>
    If instead of looping a specific number of times, you want to loop through
    some sequence of commands until some particular condition becomes true, then
    you can use:
  </p>
  <pre><code data-language="Pascal">repeat &#123;command1;&#125; &#123;command2; (etc.)&#125; until &#123;condition&#125;</code></pre>
  <p>
    The ‘Simple procedure’ example program does this, looping until the Turtle
    is pointing directly north (i.e.,
    <code data-language="Pascal">turtd = 0</code>). Alternatively, you can loop
    through a sequence of commands while some condition is true (so that it
    stops when the condition becomes false):
  </p>
  <pre><code data-language="Pascal">while &#123;condition&#125; do begin &#123;sequence of commands&#125; end;</code></pre>
  <p>
    Things that can be done with a ‘<code data-language="Pascal">repeat</code>
    loop’ can equally be done with a ‘<code data-language="Pascal">while</code>
    loop’ (and vice-versa), but sometimes one is more natural than the other.
    Notice also that a <code data-language="Pascal">repeat</code> loop always
    executes the sequence of commands at least once, because it tests the
    condition at the end of the loop. But a
    <code data-language="Pascal">while</code> loop tests the condition
    <em>before</em> executing the sequence of commands, and so will not execute
    them even once if condition is false to start with. (For examples of the
    various loops, see the second set of example programs, ‘Further commands and
    structures’.
  </p>
`;
