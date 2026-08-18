import { html, type HtmlResult } from "@merivale/womble";

export default (): HtmlResult => html`
  <h3>Programs and Functions: the Basics</h3>
  <p>
    A Turtle Python program is a sequence of statements, separated either by a
    semicolon, or by being placed on a new line. For example, the following two
    programs are equivalent:
  </p>
  <pre>
      <code data-language="Python">
        colour(green); blot(200); colour(red); blot(100)
      </code>
    </pre>
  <pre>
      <code data-language="Python">
        colour(green) blot(200) colour(red) blot(100)
      </code>
    </pre>
  <p>
    Statements are either simple or compound. Compound statements are discussed
    later. Simple statements, first, are either function calls, variable
    declarations/assignments,
    <code data-language="Python">return</code> statements, or
    <code data-language="Python">global</code>/
    <code data-language="Python">nonlocal</code> statements.
  </p>

  <h4>Function calls</h4>
  <p>
    A function is like a separate program you can use within your main program.
    Later you will see how to create your own functions, but you can also use
    any of the Turtle System’s built-in commands. To call a function, type its
    name followed by opening and closing brackets. If the function takes any
    arguments, type these in between the brackets, separated by commas. For
    example:
  </p>
  <pre>
      <code data-language="Python">
        home() colour(red) circle(50) ellipse(50, 80)
      </code>
    </pre>
  <p>
    A full list of built-in commands is available from the ‘Commands’ tab of
    this Language Guide.
  </p>
  <p>
    Some functions return a value, like the
    <code data-language="Python">max(a, b)</code> function, which returns the
    highest of the two numbers <code data-language="Python">a</code> and
    <code data-language="Python">b</code>. You can use these anywhere you would
    use a named value. For example:
  </p>
  <pre>
      <code data-language="Python">blot(max(100, 200))</code>
    </pre>

  <h4>Variable declarations/assignments</h4>
  <p>
    Variables are like boxes where you can store one value at a time. There are
    three types of variables in Turtle Python: integers, Booleans, and strings.
    You must declare a variable (specify its type) before you can assign it a
    value. Variables in Turtle Python are declared like this:
  </p>
  <pre>
      <code data-language="Python">ringsize: int draw: bool name: str</code>
    </pre>
  <p>
    After they have been declared, variables can be assigned a value like this:
  </p>
  <pre>
      <code data-language="Python">
        ringsize = 130 draw = True name = 'Turtle Python'
      </code>
    </pre>
  <p>
    Once you have given your variable a value, you can recall that value at any
    time by typing the variable’s name.
  </p>
  <p>
    Variable declarations and initial assignments can also be combined into a
    single statement, like this:
  </p>
  <pre>
      <code data-language="Python">
        ringsize: int = 130 draw: bool = True name: str = 'Turtle Python'
      </code>
    </pre>
  <p>
    Five special integer variables are built in to your program from the start,
    and these are called the Turtle’s fields:
  </p>
  <table class="help-table">
    <tbody>
      <tr>
        <th>
          <code data-language="Python">turtx</code>
        </th>
        <td>The Turtle’s x-coordinate</td>
      </tr>
      <tr>
        <th>
          <code data-language="Python">turty</code>
        </th>
        <td>The Turtle’s y-coordinate</td>
      </tr>
      <tr>
        <th>
          <code data-language="Python">turtd</code>
        </th>
        <td>The Turtle’s direction</td>
      </tr>
      <tr>
        <th>
          <code data-language="Python">turta</code>
        </th>
        <td>The Turtle’s angles</td>
      </tr>
      <tr>
        <th>
          <code data-language="Python">turtt</code>
        </th>
        <td>The Turtle’s pen thickness</td>
      </tr>
      <tr>
        <th>
          <code data-language="Python">turtc</code>
        </th>
        <td>The Turtle’s colour setting</td>
      </tr>
    </tbody>
  </table>
  <p>
    These automatically change to keep track of the Turtle’s state, and are
    shown above the Canvas.
  </p>

  <h4>Python vs Turtle Python</h4>
  <p>
    In Python itself, specifying the type of your variables is called
    <em>type hinting</em>, and it is optional. Also, Python itself is a
    <em>dynamically typed</em> language, which means that you can change the
    types of your variables midway through a program. Turtle Python, however, is
    a <em>statically typed</em> language, which means that you cannot change the
    types of your variables (so if you try to assign a string value to an
    integer variable, for example, you will get an error). The type hinting that
    is optional in Python itself is compulsory in Turtle Python.
  </p>

  <h4>User-defined functions and return statements</h4>
  <p>
    Compound statements are groups of statements that cover several lines. Most
    compound statements are command structures, described on the
    &amp;lsquoStructures’ tab of his Language Guide. One kind of compound
    statement, however, is a custom function definition. Function definitions
    begin with the keyword <code data-language="Python">def</code>, followed by
    the function’s name, opening and closing brackets, and a colon. The
    function’s commands then follow on a newline, indented with one or more
    spaces at the start. For example:
  </p>
  <pre>
      <code data-language="Python">
        def prong(): forward(400) blot(20) back(400)
      </code>
    </pre>
  <p>
    Following a definition like this, you can then call your function in the
    same way you would call any built-in command:
    <code data-language="Python">prong()</code>
  </p>
  <p>
    Functions can also be given parameters, which are specified inside the
    brackets after the function name. These are like variables for the function
    that are assinged a value each time the function is called. For example:
  </p>
  <pre>
      <code data-language="Python">
        def prong(size: int): forward(size) blot(20) back(size)
      </code>
    </pre>
  <p>
    Values for these parameters must then be specified each time the function is
    called:
    <code data-language="Python">prong(100)</code>
  </p>
  <p>
    If you want your function to return a value, you must specify the type of
    value after the function’s closing brackets, and end the function’s commands
    with a
    <code data-language="Python">return</code> statement specifying which value
    to return. For example:
  </p>
  <pre>
      <code data-language="Python">
        def double(a: int) -&gt; int: return a * 2
      </code>
    </pre>

  <h4>
    <code data-language="Python">global</code>/
    <code data-language="Python">nonlocal</code> statements
  </h4>
  <p>
    Variables declared inside your main program are called
    <em>global</em> variables. Variables declared inside a custom function are
    called <em>local</em> variables. Local variables are only visible inside the
    function where they are declared; the main program, and any other custom
    function, will not be able to do anything with these variables. Global
    variables, in contrast, are visible throughout your program, including
    inside any custom functions. For example, the following program will draw a
    circle of radius 100 on the canvas:
  </p>
  <pre>
      <code data-language="Python">
        x: int def drawCircle(): circle(x) x = 100 drawCircle()
      </code>
    </pre>
  <p>
    The following example, however, will generate an error, because the variable
    <code data-language="Python">x</code> is not visible within the main
    program:
  </p>
  <pre>
      <code data-language="Python">
        def declarex(): x: int = 100 declarex() circle(x)
      </code>
    </pre>
  <p>
    Although global variables are <em>visible</em> inside custom functions,
    meaning that you can access their current value, by default you cannot
    assign them a new value within a function. If you want to assign them a new
    value within a function, you must declare them in a
    <code data-language="Python">global</code> statement at the start of your
    function definition. Thus:
  </p>
  <pre>
      <code data-language="Python">
        x: int = 100 # x is now a global variable def foo(): x = 200 # this is
        an error; # the global x cannot be assigned a value here # and no local
        x has been declared def bar(): global x x = 200 # this is fine, and will
        set the value of the global x
      </code>
    </pre>
  <p>
    Custom functions can be defined inside other custom functions. A function’s
    local variables are all visible within any of its subfunctions (and any of
    <em>their</em> subfunctions, etc.), but cannot be assigned new values there.
    In these cases, <code data-language="Python">nonlocal</code> statements
    operate exactly like <code data-language="Python">global</code> statements,
    and are used to make it possible to assign a value to a local variable from
    a function higher up in the tree.
  </p>
`;
