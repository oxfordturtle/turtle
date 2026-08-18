import { html, type HtmlResult } from "@merivale/womble";

export default (): HtmlResult => html`
  <h3>Programs and Procedures: the Basics</h3>
  <p>The simplest BASIC programs take this form:</p>
  <pre><code data-language="BASIC">REM [program commands] END</code></pre>
  <p>
    The first couple of Turtle example programs (from the Examples menu) are
    like this. But the ‘Olympic rings’ program introduces a global variable: it
    is called
    <code data-language="BASIC">ringsize%</code> and specifies the size of the
    rings. Such variables are ‘declared’ by assigning a value, like this:
  </p>
  <pre><code data-language="BASIC">ringsize% = 130 REM [other program commands] END</code></pre>
  <p>
    Complicated programs are usually divided into subroutines, to separate the
    various tasks and make them easier to understand. BASIC has two types of
    subroutine, procedures (which are like mini-programs) and functions (which
    are designed to calculate some value).
  </p>
  <p>
    The ‘Simple procedure’ example program has a procedure to draw a ‘prong’ – a
    line ending in a blot – and then return to the starting point. Procedures
    fit into a BASIC program after the end of the main program, indicated by
    <code data-language="BASIC">END</code>. They look like this:
  </p>
  <pre><code data-language="BASIC">DEF PROCmyprocedure(par1%) LOCAL local1%, local2$ REM [procedure commands] ENDPROC</code></pre>
  <p>
    All procedure names must begin with ‘PROC’, e.g.
    <code data-language="BASIC">PROCmyprocedure</code>. A procedure can have its
    own local variables, declared using
    <code data-language="BASIC">LOCAL</code>. A
    <code data-language="BASIC">PRIVATE</code> variable is declared the same
    way, but unlike a <code data-language="BASIC">LOCAL</code> variable, it
    retains its value between procedure calls. A procedure can also have
    parameters (or ‘arguments’) that are values sent into the subroutine when it
    is called from the program, and given a name within the subroutine (e.g.
    <code data-language="BASIC">par1%</code> above).
  </p>
  <p>
    A function is similar to a procedure, with the addition that it returns a
    value. Also a function name must begin with ‘FN’, for example:
  </p>
  <pre><code data-language="BASIC">DEF FNmyfunction$(par1%) REM [procedure commands] = "output"</code></pre>
  <p>
    The last statement of a function always begins with
    <code data-language="BASIC">=</code> and the
    <code data-language="BASIC">"output"</code> provides the return value for
    the function. If a function returns a string (as above), then its name must
    end with <code data-language="BASIC">$</code>; otherwise an integer return
    type will be assumed.
  </p>

  <h4>Reserved Words, Declarations, Types, and Variables</h4>
  <p>
    The words <code data-language="BASIC">REM</code>,
    <code data-language="BASIC">END</code>,
    <code data-language="BASIC">DEF</code>, etc. are all capitalized to
    emphasise the program structure. BASIC takes notice of capitalization. These
    three words are also in red here (or gray for comments) – this is to
    indicate that they are special ‘reserved’ words that cannot be used for
    other purposes (so you can’t call a procedure or variable ‘END’).
  </p>
  <p>
    Variables all end with either a ‘%’ or a ‘$’ – Turtle will tell you if you
    forget! Turtle BASIC allows two types of variables:
  </p>
  <table class="help-table">
    <tbody>
      <tr>
        <th>integer</th>
        <td>whole number (name ends in ‘%’)</td>
      </tr>
      <tr>
        <th>string</th>
        <td>sequence of characters (name ends in ‘$’)</td>
      </tr>
    </tbody>
  </table>
  <p>
    Most of your variables are likely to be integer variables, like a
    transparent box that stores a number. You can look at the box to see which
    number it contains at any time, and you can change the number by assigning a
    new value. In the ‘Olympic rings’ example program,
    <code data-language="BASIC">ringsize%</code> is declared by assigning the
    value <code data-language="BASIC">130</code> using the command:
  </p>
  <pre><code data-language="BASIC">ringsize% = 130</code></pre>
  <p>
    Six special integer variables are ‘built in’ from the start, and these are
    called the Turtle’s fields:
  </p>
  <table class="help-table">
    <tbody>
      <tr>
        <th>
          <code data-language="BASIC">turtx%</code>
        </th>
        <td>The Turtle’s x-coordinate</td>
      </tr>
      <tr>
        <th>
          <code data-language="BASIC">turty%</code>
        </th>
        <td>The Turtle’s y-coordinate</td>
      </tr>
      <tr>
        <th>
          <code data-language="BASIC">turtd%</code>
        </th>
        <td>The Turtle’s direction</td>
      </tr>
      <tr>
        <th>
          <code data-language="BASIC">turta%</code>
        </th>
        <td>The Turtle’s angles</td>
      </tr>
      <tr>
        <th>
          <code data-language="BASIC">turtt%</code>
        </th>
        <td>The Turtle’s pen thickness</td>
      </tr>
      <tr>
        <th>
          <code data-language="BASIC">turtc%</code>
        </th>
        <td>The Turtle’s colour setting</td>
      </tr>
    </tbody>
  </table>
  <p>
    These automatically change to keep track of the Turtle’s state, and are
    shown above the Canvas.
  </p>
  <p>
    For a use of <code data-language="BASIC">turtd%</code>, see the ‘Simple
    procedure’ example.
  </p>
`;
