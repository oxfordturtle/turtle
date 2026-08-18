import { html, type HtmlResult } from "@merivale/womble";

export default (): HtmlResult => html`
  <h3>Programs and Procedures: the Basics</h3>
  <p>The simplest Pascal programs take this form:</p>
  <pre><code data-language="Pascal">PROGRAM myprog; BEGIN &#123;program commands&#125; END.</code></pre>
  <p>
    The first couple of Turtle example programs (from the Help menu) are like
    this. But the ‘Olympic rings’ program introduces a global variable: it is
    called
    <code data-language="Pascal">ringsize</code> and specifies the size of the
    rings. Such variables are ‘declared’ at the beginning of the program, like
    this:
  </p>
  <pre><code data-language="Pascal">PROGRAM myprog; VAR global1: integer; global2, global3: integer; BEGIN &#123;program commands&#125; END.</code></pre>
  <p>
    Complicated programs are usually divided into subroutines, to separate the
    various tasks and make them easier to understand. Pascal has two types of
    subroutine, procedures (which are like mini-programs) and functions (which
    are designed to calculate some value). The ‘Simple procedure’ example
    program has a procedure to draw a ‘prong’ â€“ a line ending in a blot â€“
    and then return to the starting point. Procedures fit into a Pascal program
    after the global variables and before the
    <code data-language="Pascal">BEGIN</code> of the main program; they look
    like this:
  </p>
  <pre><code data-language="Pascal">Procedure myprocedure(par1: integer); Var local1, local2: integer; Begin &#123;procedure commands&#125; End;</code></pre>
  <p>
    A procedure can have its own local variables, declared much like global
    variables. But it can also have parameters (or ‘arguments’) that are values
    sent into the subroutine when it is called from the program, and given a
    name within the subroutine (e.g.
    <code data-language="Pascal">par1</code> above).
  </p>
  <h4>Reserved Words, Declarations, Types, and Variables</h4>
  <p>
    The words <code data-language="Pascal">PROGRAM</code>,
    <code data-language="Pascal">BEGIN</code> and
    <code data-language="Pascal">END</code> are often capitalized to emphasise
    the program structure, but Pascal actually takes no notice of capitalization
    (so you could write <code data-language="Pascal">program</code>,
    <code data-language="Pascal">Program</code> or even
    <code data-language="Pascal">PrOgRaM</code>!). These three words are also in
    red here â€“ this is to indicate that they are special ‘reserved’ words that
    cannot be used for other purposes (so you can’t call a procedure or variable
    ‘begin’). As well as variables, a program can use constants to give a
    convenient name to a particular value. Any constants must be ‘declared’ even
    before the variables, like this:
  </p>
  <pre><code data-language="Pascal">PROGRAM myprog; CONST limit = 4; VAR global1: integer; &#123;and so on&#125;</code></pre>
  <p>
    Notice that variable and constant declarations must all end with a semicolon
    â€“ Turtle will tell you if you forget! Notice also that while constants are
    given a value when declared (e.g.
    <code data-language="Pascal">limit</code> is given the value
    <code data-language="Pascal">4</code> above), variables are given a
    <em>type</em>, to indicate the sort of data that they can store. Turtle
    Pascal allows four main types of variables:
  </p>
  <table class="help-table">
    <tbody>
      <tr>
        <th>integer</th>
        <td>whole number</td>
      </tr>
      <tr>
        <th>boolean</th>
        <td>true or false</td>
      </tr>
      <tr>
        <th>char</th>
        <td>single character</td>
      </tr>
      <tr>
        <th>string</th>
        <td>sequence of character(s)</td>
      </tr>
    </tbody>
  </table>
  <p>
    Most of your variables are likely to be integer variables, like a
    transparent box that stores a number. You can look at the box to see which
    number it contains at any time, and you can change the number by assigning a
    new value, e.g.
  </p>
  <pre><code data-language="Pascal">VAR ringsize: integer;</code></pre>
  <p>
    is declared in the ‘Olympic rings’ example program, and
    <code data-language="Pascal">ringsize</code> is later assigned the value
    <code data-language="Pascal">130</code> using the command:
  </p>
  <pre><code data-language="Pascal">ringsize := 130;</code></pre>
  <p>
    Five special integer variables are ‘built in’ from the start, and these are
    called the Turtle’s fields:
  </p>
  <table class="help-table">
    <tbody>
      <tr>
        <th>
          <code data-language="Pascal">turtx</code>
        </th>
        <td>The Turtle’s x-coordinate</td>
      </tr>
      <tr>
        <th>
          <code data-language="Pascal">turty</code>
        </th>
        <td>The Turtle’s y-coordinate</td>
      </tr>
      <tr>
        <th>
          <code data-language="Pascal">turtd</code>
        </th>
        <td>The Turtle’s direction</td>
      </tr>
      <tr>
        <th>
          <code data-language="Pascal">turta</code>
        </th>
        <td>The Turtle’s angles</td>
      </tr>
      <tr>
        <th>
          <code data-language="Pascal">turtt</code>
        </th>
        <td>The Turtle’s pen thickness</td>
      </tr>
      <tr>
        <th>
          <code data-language="Pascal">turtc</code>
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
    For a use of <code data-language="Pascal">turtd</code>, see the ‘Simple
    procedure’ example.
  </p>
`;
