import { html, type HtmlResult } from "@merivale/womble";

export default (): HtmlResult => html`
  <h3>Arithmetical Operators</h3>
  <p>The four main arithmetical operators are represented as:</p>
  <table class="help-table">
    <tbody>
      <tr>
        <td>
          <code data-language="Pascal">+</code>
        </td>
        <td>addition (also used for string concatenation)</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">-</code>
        </td>
        <td>subtraction</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">*</code>
        </td>
        <td>multiplication</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">/</code>
        </td>
        <td>division</td>
      </tr>
    </tbody>
  </table>
  <p>
    <code data-language="Pascal">/</code> is <em>integer</em> division, with the
    remainder discarded (e.g. <code data-language="Pascal">14 / 3 = 4</code>).
    Remainders are given by:
  </p>
  <table class="help-table">
    <tbody>
      <tr>
        <td>
          <code data-language="Pascal">mod</code>
        </td>
        <td>remainder</td>
      </tr>
    </tbody>
  </table>
  <p>
    (e.g. <code data-language="Pascal">14 mod 3 = 2</code>;
    <code data-language="Pascal">67 mod 10 = 7</code>).
  </p>

  <h3>Doing Fractional (e.g. Decimal) Arithmetic</h3>
  <p>
    The Turtle Machine is designed to handle memory simply and transparently for
    the learning of computer science, and so has no special type for
    representing fractional numbers; which is why
    <code data-language="Pascal">/</code> is integer division. But the Turtle
    System can handle fractional numbers by treating them explicitly as
    fractions, with both a numerator (above the line) and a denominator (below
    the line). A denominator of 1000000, for instance, allows decimal arithmetic
    to 6 decimal places.
  </p>
  <p>
    Thus to get the sine of 34.56 degrees to six decimal places, you could use
    <code data-language="Pascal">n := sin(3456, 100, 1000000)</code> â€“ this
    makes <code data-language="Pascal">n</code> equal to the sine of the angle
    3456/100, multiplied by 1000000 (and rounded).
    <code data-language="Pascal">writeln(qstr(n, 1000000, 6))</code> will then
    print n/1000000 to six decimal places, i.e.
    <code data-language="Pascal">"0.567269"</code>. For more illustrations of
    this sort of decimal arithmetic, see the example program ‘Mathematical
    functions’.
  </p>

  <h3>Boolean Operators</h3>
  <p>The four main boolean operators are represented in the standard way:</p>
  <table class="help-table">
    <tbody>
      <tr>
        <td>
          <code data-language="Pascal">not</code>
        </td>
        <td>negation</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">and</code>
        </td>
        <td>conjunction</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">or</code>
        </td>
        <td>disjunction (inclusive)</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">xor</code>
        </td>
        <td>exclusive disjunction</td>
      </tr>
    </tbody>
  </table>
  <p>
    These can also be used between integers, in a <em>bitwise</em> fashion (i.e.
    each binary bit in the result is calculated as the result of the relevant
    boolean operation on the corresponding bits of the inputs), e.g.
    <code data-language="Pascal">21 and 6 = 4</code> (binary
    <code data-language="Pascal">10101 and 00110 = 100</code>);
    <code data-language="Pascal">21 or 6 = 23</code> (<code
      data-language="Pascal"
      >10111</code
    >); <code data-language="Pascal">21 xor 6 = 19</code> (<code
      data-language="Pascal"
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
          <code data-language="Pascal">=</code>
        </td>
        <td>equality</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">&lt;&gt;</code>
        </td>
        <td>inequality</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">&lt;</code>
        </td>
        <td>less than</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">&lt;=</code>
        </td>
        <td>less than or equal</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">&gt;</code>
        </td>
        <td>greater than</td>
      </tr>
      <tr>
        <td>
          <code data-language="Pascal">&gt;=</code>
        </td>
        <td>greater than or equal</td>
      </tr>
    </tbody>
  </table>

  <h3>Bracketing</h3>
  <p>Complex expressions require brackets, e.g.</p>
  <pre><code data-language="Pascal">if (n &lt; 0) or (n &gt; 9) then n := ((a + 1) * (b + 3) + c) mod 10</code></pre>
`;
