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
    order within the program, with the same indent, e.g.:
  </p>
  <pre>
      <code data-language="Python">
        colour(green) blot(100) pause(1000) # etc.
      </code>
    </pre>
  <p>(From the first example program in the Help menu.)</p>

  <h4>Conditional Selection of Commands</h4>
  <p>
    Suppose you want to draw a blot with a given radius (stored as the integer
    variable
    <code data-language="Python">radius</code>), but only if that value is less
    than 500; do it like this:
  </p>
  <pre>
      <code data-language="Python">if radius &lt; 500: blot(radius)</code>
    </pre>
  <p>
    If you want to do something different when the condition is not met (e.g.
    drawing a blot with half the radius), extend the
    <code data-language="Python">if</code> structure by adding
    <code data-language="Python">else</code> and then the new command:
  </p>
  <pre>
      <code data-language="Python">
        if radius &lt; 500: blot(radius) else: blot(radius // 2)
      </code>
    </pre>
  <p>
    Notice that this is a single complex command, so the
    <code data-language="Python">else</code> must have the same indent as
    <code data-language="Python">if</code> and the sub-commands must be further
    indented (if you do not indent correctly, Turtle will give you a warning).
  </p>

  <h4>Grouping of Commands</h4>
  <p>
    Sometimes you will want to do a sequence of commands within an
    <code data-language="Python">if - else</code> structure, in which case you
    can group them by indenting them all by the same amount. Any such indented
    sequence of commands is treated as a single command. (Another possibility is
    to package them into a function.)
  </p>
  <p>
    Note that indents must be consistent, so the following will generate several
    errors:
  </p>
  <pre>
      <code data-language="Python">
        if radius &lt; 500: blot(radius) blot(radius // 3) # too many indents
        else: # should match the if line blot(radius // 2) # needs indent after
        else
      </code>
    </pre>

  <h4>Looping Structures</h4>
  <p>
    Python provides two different structures for looping (or ‘iterating’)
    commands. If you know in advance how many times you want to loop – or you
    want to ‘loop over’ a particular range of values (e.g. from 1 to 200), then
    the simplest is a ‘<code data-language="Python">for</code>
    loop’ (or ‘counting loop’):
  </p>
  <pre>
      <code data-language="Python">
        for count in range(1, 201, 1): forward(count // 3) right(5) # etc.
      </code>
    </pre>
  <p>
    (From the first <code data-language="Python">for</code> loop example program
    in the Help menu.)
  </p>
  <p>Again indenting is used to group together a number of commands.</p>
  <p>
    In a <code data-language="Python">for</code> loop, the ‘loop variable’ (here
    <code data-language="Python">count</code>) is given in turn each of the
    values in the range (here 1, 2, 3, …, 199, 200), and the loop instructions
    are performed each time. So in the example above, a spiral is drawn as the
    Turtle moves forward gradually more and more (as
    <code data-language="Python">count</code> increases).
  </p>
  <p>
    The <code data-language="Python">range</code> function specifies the values
    that the loop variable will take as follows:
  </p>
  <pre>
      <code data-language="Python">
        range(firstValue, lastValue + 1, increment)
      </code>
    </pre>
  <p>
    The increment can be either 1 or -1. To count down through a loop, use an
    increment of -1.
  </p>
  <p>
    If instead of looping a specific number of times, you want to loop through
    some sequence of commands while some condition is true (so that it stops
    when the condition becomes false), then you can use:
  </p>
  <pre>
      <code data-language="Python">
        while condition: # sequence of commands
      </code>
    </pre>
  <p>
    A <code data-language="Python">while</code> loop tests the condition
    <em>before</em> executing the sequence of commands, and so will not execute
    them even once if condition is false to start with. (For examples of the
    various loops, see the second set of example programs, ‘Further commands and
    structures’.)
  </p>
`;
