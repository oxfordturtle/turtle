import { html, type HtmlResult } from "@merivale/womble";

export default (): HtmlResult => html`
  <h3>Arithmetical Operators</h3>
  <p>The four main arithmetical operators are represented as:</p>
  <table class="help-table">
    <tbody>
      <tr>
        <td>
          <code data-language="BASIC">+</code>
        </td>
        <td>addition (also used for string concatenation)</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">-</code>
        </td>
        <td>subtraction</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">*</code>
        </td>
        <td>multiplication</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">/</code>
        </td>
        <td>division</td>
      </tr>
    </tbody>
  </table>
  <p>
    <code data-language="BASIC">/</code> is <em>integer</em> division, with the
    remainder discarded (e.g. <code data-language="BASIC">14 / 3 = 4</code>).
    Remainders are given by:
  </p>
  <table class="help-table">
    <tbody>
      <tr>
        <td>
          <code data-language="BASIC">MOD</code>
        </td>
        <td>remainder</td>
      </tr>
    </tbody>
  </table>
  <p>
    (e.g. <code data-language="BASIC">14 MOD 3 = 2</code>;
    <code data-language="BASIC">67 MOD 10 = 7</code>).
  </p>

  <h3>Doing Fractional (e.g. Decimal) Arithmetic</h3>
  <p>
    The Turtle Machine is designed to handle memory simply and transparently for
    the learning of computer science, and so has no special type for
    representing fractional numbers; which is why
    <code data-language="BASIC">/</code> is integer division. But the Turtle
    System can handle fractional numbers by treating them explicitly as
    fractions, with both a numerator (above the line) and a denominator (below
    the line). A denominator of 1000000, for instance, allows decimal arithmetic
    to 6 decimal places.
  </p>
  <p>
    Thus to get the sine of 34.56 degrees to 6 decimal places, you could use
    <code data-language="BASIC">n% = SIN(3456, 100, 1000000)</code> – this makes
    <code data-language="BASIC">n%</code> equal to the sine of the angle
    3456/100, multiplied by 1000000 (and rounded).
    <code data-language="BASIC">WRITELN(QSTR$(n%, 1000000, 6))</code> will then
    print n%/1000000 to six decimal places, i.e.
    <code data-language="BASIC">"0.567269"</code>. For more illustrations of
    this sort of decimal arithmetic, see the example program ‘Mathematical
    functions’.
  </p>

  <h3>Boolean Operators</h3>
  <p>The four main boolean operators are represented in the standard way:</p>
  <table class="help-table">
    <tbody>
      <tr>
        <td>
          <code data-language="BASIC">NOT</code>
        </td>
        <td>negation</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">AND</code>
        </td>
        <td>conjunction</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">OR</code>
        </td>
        <td>disjunction (inclusive)</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">EOR</code>
        </td>
        <td>exclusive disjunction</td>
      </tr>
    </tbody>
  </table>
  <p>
    These are used between integers, where zero stands for false and any other
    number stands for true. <code data-language="BASIC">FALSE</code> stands for
    <code data-language="BASIC">0</code> and
    <code data-language="BASIC">TRUE</code> for
    <code data-language="BASIC">-1</code>. The Boolean operators can also be
    used in a bitwise fashion (i.e. each binary bit in the result is calculated
    as the result of the relevant boolean operation on the corresponding bits of
    the inputs, e.g. <code data-language="BASIC">21 AND 6 = 4</code> (binary
    <code data-language="BASIC">10101 AND 00110 = 100</code>);
    <code data-language="BASIC">21 OR 6 = 23</code> (<code data-language="BASIC"
      >10111</code
    >); <code data-language="BASIC">21 EOR 6 = 19</code> (<code
      data-language="BASIC"
      >10011</code
    >).
  </p>

  <h3>Comparison Operators</h3>
  <p>
    The six comparison operators are applicable to all types (with strings
    compared alphabetically):
  </p>
  <table class="help-table">
    <tbody>
      <tr>
        <td>
          <code data-language="BASIC">=</code>
        </td>
        <td>equality</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">&lt;&gt;</code>
        </td>
        <td>inequality</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">&lt;</code>
        </td>
        <td>less than</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">&lt;=</code>
        </td>
        <td>less than or equal</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">&gt;</code>
        </td>
        <td>greater than</td>
      </tr>
      <tr>
        <td>
          <code data-language="BASIC">&gt;=</code>
        </td>
        <td>greater than or equal</td>
      </tr>
    </tbody>
  </table>

  <h3>Bracketing</h3>
  <p>Complex expressions require brackets, e.g.</p>
  <pre><code data-language="BASIC">IF (n% &lt; 0) OR (n% &gt; 9) THEN n% = ((a% + 1) * (b% + 3) + c%) MOD 10</code></pre>
`;
