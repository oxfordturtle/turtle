import { html, type HtmlResult } from "@merivale/womble";

export default (): HtmlResult => html`
  <h3>User Input</h3>
  <p>
    The facilities for user input – via keyboard or mouse – are designed to be
    as straightforward and comprehensible as possible, while operating strictly
    through simple processes that are consistent with the workings of the
    <em>Turtle Machine</em>.
  </p>

  <h4>Mouse Position Detection</h4>
  <p>
    The x- and y-coordinates of the mouse’s current position can be found at any
    time by using the special global variables
    <code data-language="BASIC">?mousex</code> and
    <code data-language="BASIC">?mousey</code> – these do not require the mouse
    to be clicked.
  </p>

  <h4>Mouse Click Detection</h4>
  <p>
    When a mouse click is performed, the x- and y-coordinates of the click
    position are remembered by the variables
    <code data-language="BASIC">?clickx</code> and
    <code data-language="BASIC">?clicky</code>. However to identify the type of
    click, use the variable <code data-language="BASIC">?click</code>, which is
    initially set to a value of -1, but after any click has taken place is set
    to a numerical value of 128 plus additions as follows:
  </p>
  <table class="help-table">
    <tbody>
      <tr>
        <td>1</td>
        <td>if the click was with the left mouse button</td>
      </tr>
      <tr>
        <td>2</td>
        <td>if the click was with the right mouse button</td>
      </tr>
      <tr>
        <td>4</td>
        <td>if the click was with the middle mouse button</td>
      </tr>
      <tr>
        <td>8</td>
        <td>if the <kbd>shift</kbd> key was held down while clicking</td>
      </tr>
      <tr>
        <td>16</td>
        <td>if the <kbd>alt</kbd> key was held down while clicking</td>
      </tr>
      <tr>
        <td>32</td>
        <td>if the <kbd>ctrl</kbd> key was held down while clicking</td>
      </tr>
      <tr>
        <td>64</td>
        <td>if it was a double-click</td>
      </tr>
    </tbody>
  </table>
  <p>
    So if <code data-language="BASIC">n% = ?click</code> makes
    <code data-language="BASIC">n%</code> equal to 137 (128+8+1), this indicates
    that a left-click is currently under way, with the <kbd>shift</kbd> key held
    down. When the click event is finished, the
    <code data-language="BASIC">?click</code> value will become negative. Thus
    if <code data-language="BASIC">?click</code> returns a value of -137, this
    indicates that the last click event – now finished – was
    <kbd>shift</kbd>+left; the coordinate position of that click can still be
    identified – until the next click takes place – as (<code
      data-language="BASIC"
      >?clickx</code
    >, <code data-language="BASIC">?clicky</code>). On a left-click, the
    variable <code data-language="BASIC">?lmouse</code> records the relevant
    value (as calculated above); likewise
    <code data-language="BASIC">?rmouse</code> and
    <code data-language="BASIC">?mmouse</code> record any right-click or
    middle-click. Again, these are all made negative when the click is released,
    so an empty loop like:
  </p>
  <pre><code data-language="BASIC">REPEAT UNTIL ?lmouse &gt; 0</code></pre>
  <p>
    waits for a left-click with the mouse. Afterwards,
    <code data-language="BASIC">?clickx</code> and
    <code data-language="BASIC">?clicky</code> indicate where that click event
    occurred, and <code data-language="BASIC">?click</code> can be queried using
    the bitwise <code data-language="BASIC">AND</code> operator to discover
    which special keys were pressed (e.g.
    <code data-language="BASIC">IF (ABS(?click) AND 8) &gt; 0</code> will test
    whether <kbd>shift</kbd> was being held down).
  </p>

  <h4>Key Press Detection</h4>
  <p>
    Detecting key presses (rather than typing in of characters) uses the
    variables
    <code data-language="BASIC">?key</code> and
    <code data-language="BASIC">?kshift</code>, and the function
    <code data-language="BASIC">KEYSTATUS</code>.
    <code data-language="BASIC">?key</code> gives the code of the last key to be
    pressed – these codes can be tested using the special keycode constants
    <code data-language="BASIC">\\\\alt</code>,
    <code data-language="BASIC">\\\\backspace</code>,
    <code data-language="BASIC">\\\\capslock</code>,
    <code data-language="BASIC">\\\\ctrl</code>,
    <code data-language="BASIC">\\\\delete</code>,
    <code data-language="BASIC">\\\\down</code>,
    <code data-language="BASIC">\\\\end</code>,
    <code data-language="BASIC">\\\\escape</code>,
    <code data-language="BASIC">\\\\home</code>,
    <code data-language="BASIC">\\\\insert</code>,
    <code data-language="BASIC">\\\\left</code>,
    <code data-language="BASIC">\\\\lwin</code>,
    <code data-language="BASIC">\\\\pgdn</code>,
    <code data-language="BASIC">\\\\pgup</code>,
    <code data-language="BASIC">\\\\return</code>,
    <code data-language="BASIC">\\\\right</code>,
    <code data-language="BASIC">\\\\rwin</code>,
    <code data-language="BASIC">\\\\shift</code>,
    <code data-language="BASIC">\\\\space</code>,
    <code data-language="BASIC">\\\\tab</code>, and
    <code data-language="BASIC">\\\\up</code>, as well as
    <code data-language="BASIC">\\\\a</code> to
    <code data-language="BASIC">\\\\z</code>,
    <code data-language="BASIC">\\\\0</code> to
    <code data-language="BASIC">\\\\9</code>,
    <code data-language="BASIC">\\\\hash</code>,
    <code data-language="BASIC">\\\\equals</code> etc. Keys on the numeric
    keypad have codes <code data-language="BASIC">\\\\#0</code>,
    <code data-language="BASIC">\\\\#1</code> etc., and function keys
    <code data-language="BASIC">\\\\f1</code>,
    <code data-language="BASIC">\\\\f2</code> etc. All these stand for numeric
    values (e.g. <code data-language="BASIC">\\\\return</code> is 13,
    <code data-language="BASIC">\\\\escape</code> is 27), but
    <code data-language="BASIC">IF ?key = \\\\return</code> is easier to
    understand than <code data-language="BASIC">IF ?key = 13</code>.
  </p>
  <p>
    Like the mouse-click variables,
    <code data-language="BASIC">?key</code> becomes negative after the key is
    released, so
    <code data-language="BASIC">REPEAT : UNTIL ?key = -\\\\a</code> will wait
    until the ‘A’ key has been released. If you want to identify the last key
    whether it is still pressed or not, use
    <code data-language="BASIC">ABS</code> (e.g.
    <code data-language="BASIC">IF ABS(?key) = \\\\a THEN</code>).
  </p>
  <p>
    Whenever a key is pressed, the variable
    <code data-language="BASIC">?kshift</code> gives its ‘shift-status’,
    calculated in the same way as
    <code data-language="BASIC">?click</code> (i.e. 128 plus 8 if
    <kbd>shift</kbd> was down, 16 for <kbd>alt</kbd>, 32 for <kbd>ctrl</kbd>,
    and turning negative after the key is released). So to test if
    <kbd>ctrl</kbd> was down on the last keypress, use
    <code data-language="BASIC">IF (ABS(?kshift) AND 32) &gt; 0</code>, with
    <code data-language="BASIC">AND</code> here acting as a bitwise boolean
    operator.
  </p>
  <p>
    To recover the shift-status for the last press of the <kbd>X</kbd> key
    (say), use <code data-language="BASIC">KEYSTATUS(\\\\x)</code>, which can
    tell you (a) whether <kbd>shift</kbd> / <kbd>alt</kbd> /
    <kbd>ctrl</kbd> were down; (b) whether the <kbd>X</kbd> is still pressed
    (since <code data-language="BASIC">KEYSTATUS</code> goes negative on
    release); (c) whether <kbd>X</kbd> has been pressed at all (since all of
    these input codes are set to -1 initially, and can be reset to -1 using
    <code data-language="BASIC">RESET(\\\\x)</code> etc.).
  </p>

  <h4>Keyboard Input</h4>
  <p>
    The system provides a <em>keyboard buffer</em> to store typed characters.
    Initially this is set to store up to 32 characters, but can be extended
    using e.g. <code data-language="BASIC">KEYBUFFER(50)</code>. To read from
    the buffer into a string, use e.g.
    <code data-language="BASIC">s$ = GET$(10)</code>, which reads up to 10
    characters (depending on how many are in the buffer).
    <code data-language="BASIC">KEYSTATUS(\\\\keybuffer)</code> returns the
    number of characters it contains, and
    <code data-language="BASIC">RESET(\\\\keybuffer)</code> flushes it.
  </p>

  <p>
    <code data-language="BASIC">s$ = GETLINE$</code> reads a line of text,
    waiting until the <kbd>return</kbd> key is pressed and then making
    <code data-language="BASIC">s$</code> equal to what has been typed into the
    buffer (discarding the <kbd>return</kbd> character).
  </p>

  <p>
    The function <code data-language="BASIC">DETECT</code> waits a given time
    for some input to be received (e.g. a specific key pressed), and returns
    <code data-language="BASIC">TRUE</code> when that input is received, or
    <code data-language="BASIC">FALSE</code> if it is not received in time. Thus
    <code data-language="BASIC">IF DETECT(\\\\escape, 5000) THEN - ELSE -</code>
    gives 5 seconds to press the <kbd>escape</kbd> key (meanwhile continuing to
    collect any typed characters in the keyboard buffer). By default, text that
    goes into the keyboard buffer is also ‘echoed’ to the console (below the
    Canvas), along with text that is output (using
    <code data-language="BASIC">WRITE</code> or
    <code data-language="BASIC">WRITELN</code>). This behaviour can be turned on
    and off with <code data-language="BASIC">KEYECHO(TRUE)</code> and
    <code data-language="BASIC">KEYECHO(FALSE)</code>.
  </p>
`;
