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
    <code data-language="Pascal">?mousex</code> and
    <code data-language="Pascal">?mousey</code> – these do not require the mouse
    to be clicked.
  </p>

  <h4>Mouse Click Detection</h4>
  <p>
    When a mouse click is performed, the x- and y-coordinates of the click
    position are remembered by the variables
    <code data-language="Pascal">?clickx</code> and
    <code data-language="Pascal">?clicky</code>. However to identify the type of
    click, use the variable <code data-language="Pascal">?click</code>, which is
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
        <td>if the shift key was held down while clicking</td>
      </tr>
      <tr>
        <td>16</td>
        <td>if the alt key was held down while clicking</td>
      </tr>
      <tr>
        <td>32</td>
        <td>if the ctrl key was held down while clicking</td>
      </tr>
      <tr>
        <td>64</td>
        <td>if it was a double-click</td>
      </tr>
    </tbody>
  </table>
  <p>
    So if <code data-language="Pascal">n := ?click</code> makes
    <code data-language="Pascal">n</code> equal to 137 (128 + 8 + 1), this
    indicates that a left-click is currently under way, with the
    <kbd>shift</kbd> key held down. When the click event is finished, the
    <code data-language="Pascal">?click</code> value will become negative. Thus
    if <code data-language="Pascal">?click</code> returns a value of -137, this
    indicates that the last click event – now finished – was shift+left; the
    coordinate position of that click can still be identified – until the next
    click takes place – as (<code data-language="Pascal">?clickx</code>,
    <code data-language="Pascal">?clicky</code>). On a left-click, the variable
    <code data-language="Pascal">?lmouse</code> records the relevant value (as
    calculated above); likewise <code data-language="Pascal">?rmouse</code> and
    <code data-language="Pascal">?mmouse</code> record any right-click or
    middle-click. Again, these are all made negative when the click is released,
    so an empty loop like:
  </p>
  <pre><code data-language="Pascal">repeat until ?lmouse &gt; 0;</code></pre>
  <p>
    waits for a left-click with the mouse. Afterwards,
    <code data-language="Pascal">?clickx</code> and
    <code data-language="Pascal">?clicky</code> indicate where that click event
    occurred, and <code data-language="Pascal">?click</code> can be queried
    using the bitwise <code data-language="Pascal">and</code> operator to
    discover which special keys were pressed (e.g.
    <code data-language="Pascal">if (abs(?click) and 8) &gt; 0</code> will test
    whether <kbd>shift</kbd> was being held down).
  </p>

  <h4>Key Press Detection</h4>
  <p>
    Detecting key presses (rather than typing in of characters) uses the
    variables
    <code data-language="Pascal">?key</code> and
    <code data-language="Pascal">?kshift</code>, and the function
    <code data-language="Pascal">keystatus</code>.
    <code data-language="Pascal">?key</code> gives the code of the last key to
    be pressed – these codes can be tested using the special keycode constants
    <code data-language="Pascal">\\\\alt</code>,
    <code data-language="Pascal">\\\\backspace</code>,
    <code data-language="Pascal">\\\\capslock</code>,
    <code data-language="Pascal">\\\\ctrl</code>,
    <code data-language="Pascal">\\\\delete</code>,
    <code data-language="Pascal">\\\\down</code>,
    <code data-language="Pascal">\\\\end</code>,
    <code data-language="Pascal">\\\\escape</code>,
    <code data-language="Pascal">\\\\home</code>,
    <code data-language="Pascal">\\\\insert</code>,
    <code data-language="Pascal">\\\\left</code>,
    <code data-language="Pascal">\\\\lwin</code>,
    <code data-language="Pascal">\\\\pgdn</code>,
    <code data-language="Pascal">\\\\pgup</code>,
    <code data-language="Pascal">\\\\return</code>,
    <code data-language="Pascal">\\\\right</code>,
    <code data-language="Pascal">\\\\rwin</code>,
    <code data-language="Pascal">\\\\shift</code>,
    <code data-language="Pascal">\\\\space</code>,
    <code data-language="Pascal">\\\\tab</code>, and
    <code data-language="Pascal">\\\\up</code>, as well as
    <code data-language="Pascal">\\\\a</code> to
    <code data-language="Pascal">\\\\z</code>,
    <code data-language="Pascal">\\\\0</code> to
    <code data-language="Pascal">\\\\9</code>,
    <code data-language="Pascal">\\\\hash</code>,
    <code data-language="Pascal">\\\\equals</code> etc. Keys on the numeric
    keypad have codes <code data-language="Pascal">\\\\#0</code>,
    <code data-language="Pascal">\\\\#1</code> etc., and function keys
    <code data-language="Pascal">\\\\f1</code>,
    <code data-language="Pascal">\\\\f2</code> etc. All these stand for numeric
    values (e.g. <code data-language="Pascal">\\\\return</code> is 13,
    <code data-language="Pascal">\\\\escape</code> is 27), but
    <code data-language="Pascal">if ?key = eturn</code> is easier to understand
    than <code data-language="Pascal">if ?key = 13</code>.
  </p>
  <p>
    Like the mouse-click functions,
    <code data-language="Pascal">?key</code> becomes negative after the key is
    released, so
    <code data-language="Pascal">repeat until ?key = -\\\\a</code> will wait
    until the <kbd>A</kbd> key has been released. If you want to identify the
    last key whether it is still pressed or not, use
    <code data-language="Pascal">abs</code> (e.g.
    <code data-language="Pascal"
      >if abs(?key) = \\\\a then &#123;commands&#125;</code
    >).
  </p>
  <p>
    Whenever a key is pressed, the variable
    <code data-language="Pascal">?kshift</code> gives its ‘shift-status’,
    calculated in the same way as
    <code data-language="Pascal">?click</code> (i.e. 128 plus 8 if
    <kbd>shift</kbd> was down, 16 for <kbd>alt</kbd>, 32 for <kbd>ctrl</kbd>,
    and turning negative after the key is released). So to test if
    <kbd>ctrl</kbd> was down on the last keypress, use
    <code data-language="Pascal">if (abs(?kshift) and 32) &gt; 0</code>, with
    <code data-language="Pascal">and</code> here acting as a bitwise boolean
    operator.
  </p>
  <p>
    To recover the shift-status for the last press of the <kbd>X</kbd> key
    (say), use <code data-language="Pascal">keystatus(\\\\x)</code>, which can
    tell you (a) whether <kbd>shift</kbd> / <kbd>alt</kbd> /
    <kbd>ctrl</kbd> were down; (b) whether the <kbd>X</kbd> is still pressed
    (since <code data-language="Pascal">keystatus</code> goes negative on
    release); (c) whether <kbd>X</kbd> has been pressed at all (since all of
    these input codes are set to -1 initially, and can be reset to -1 using
    <code data-language="Pascal">reset(\\\\x)</code> etc.).
  </p>

  <h4>Keyboard Input</h4>
  <p>
    The system provides a <em>keyboard buffer</em> to store typed characters.
    Initially this is set to store up to 32 characters, but can be extended
    using e.g. <code data-language="Pascal">keybuffer(50)</code>. To read from
    the buffer into a string, use e.g.
    <code data-language="Pascal">s := read(10)</code>, which reads up to 10
    characters (depending on how many are in the buffer).
    <code data-language="Pascal">keystatus(\\\\keybuffer)</code> returns the
    number of characters it contains, and
    <code data-language="Pascal">reset(\\\\keybuffer)</code> flushes it.
  </p>
  <p>
    <code data-language="Pascal">s := readln</code> reads a line of text,
    waiting until the <kbd>return</kbd> key is pressed and then making
    <code data-language="Pascal">s</code> equal to what has been typed into the
    buffer (discarding the <kbd>return</kbd> character).
  </p>
  <p>
    The function <code data-language="Pascal">detect</code> waits a given time
    for some input to be received (e.g. a specific key pressed), and returns
    <code data-language="Pascal">true</code> when that input is received, or
    <code data-language="Pascal">false</code> if it is not received in time.
    Thus
    <code data-language="Pascal"
      >if detect(\\\\escape, 5000) then &#123;command1&#125; else
      &#123;command2&#125;</code
    >
    gives 5 seconds to press the <kbd>escape</kbd> key (meanwhile continuing to
    collect any typed characters in the keyboard buffer). By default, text that
    goes into the keyboard buffer is also ‘echoed’ to the console (below the
    Canvas), along with text that is output (using
    <code data-language="Pascal">write</code> or
    <code data-language="Pascal">writeln</code>). This behaviour can be turned
    on and off with <code data-language="Pascal">keyecho(true)</code> and
    <code data-language="Pascal">keyecho(false)</code>.
  </p>
`;
