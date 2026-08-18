import type { RequestParams } from "./types.ts";
import page from "./_layout/page.ts";
import { htmlResponse } from "./utils/response.ts";
import { html } from "@merivale/womble";

export default (requestParams: RequestParams): Promise<Response> =>
  htmlResponse(page(requestParams, { header, main }));

const header = html`
  <h1>About the Turtle System</h1>
  <p>
    The <i>Turtle System</i> is based on <i>Turtle Graphics</i>, an idea
    invented by Seymour Papert, in which an imaginary turtle moves around the
    computer screen drawing as it goes, all under the control of instructions
    given by a computer program. This sort of programming, and the results it
    produces, are easy to understand because they are so immediately visual. But
    the <i>Turtle System</i> provided here shows that Papert&lsquo;s idea can go
    well beyond simple graphics, to provide a basis for fascinating and powerful
    programs that introduce fundamental concepts of software engineering and
    artificial intelligence.
  </p>
`;

const main = html`
  <h2>Turtle Graphics and Beyond</h2>
  <p>
    Computer programming can be tremendous fun, as well as educational. And the
    best way to start learning to program is indeed to have fun: to experience
    the pleasure of intellectual creativity as you capture your imaginative
    ideas in computer code. Unfortunately, the sophistication of many
    programming systems gets in the way here, with lots of new concepts and
    techniques required before the novice is able to apply any creative ideas.
    To get over this daunting hurdle, it is helpful to start programming in a
    system which is intuitively &ldquo;natural&rdquo;, and where technical
    complications are kept to a minimum. A wonderful way of achieving
    this&mdash;which has since been very widely copied&mdash;was invented by
    Seymour Papert with his idea of
    <i>Turtle Graphics</i>, based on the metaphor of a turtle moving around the
    computer screen and drawing as it goes, all under the control of
    instructions given by a computer program. This sort of programming, and the
    results it produces, are easy to understand because they are so immediately
    visual.
  </p>
  <p>
    For those who want to learn more about how computers work, the
    <i>Turtle System</i> provided here goes well beyond the basics of
    programming in Turtle Graphics, by including a facilities to &ldquo;see
    under the bonnet&rdquo; of a computer. The system incorporates a
    <i>visual compiler</i> which translates the written program into a form of
    &ldquo;machine code&rdquo; for a virtual <i>Turtle Machine</i> (when the
    program runs, it is this compiled &ldquo;machine code&rdquo; that is
    actually executed). Since the Turtle Machine supports parameterised
    procedures with full recursion, this gives an opportunity to learn about a
    fascinating topic which is usually confined to advanced university courses,
    but entirely accessible (though not easy) when presented in this way.
  </p>
  <h2>Further Reading</h2>
  <p>
    The principles behind the <i>Turtle System</i> were explained in Peter
    Millican&rsquo;s 2004 research thesis, which discusses much of the relevant
    pedagogical literature, as well as providing technical details and results
    from teaching experience:
  </p>
  <ul class="bullet list">
    <li>
      <a href="http://www.millican.org/papers/2004MSc.pdf"
        ><i>Turtle</i>: Innovative Software for the Learning of Computing
        Concepts</a
      >
    </li>
  </ul>
  <p>
    For a less technical introduction, see Peter Millican&rsquo;s articles in
    the Autumn 2014 and Spring 2015 editions of Computing at School&rsquo;s
    <a href="http://community.computingatschool.org.uk/resources/3127"
      ><i>SwitchedOn</i></a
    >
    magazine:
  </p>
  <ul class="bullet list">
    <li>
      <a href="/downloads/SwitchedOn_Issue15_Double.pdf"
        >The Turtle System: An Easy Way into Text-Based Programming and Computer
        Science</a
      >
    </li>
    <li>
      <a href="/downloads/SwitchedOn_Issue16_Double.pdf"
        >Using The Turtle System: An Easy Way to Start Text-Based Programming</a
      >
    </li>
    <li>
      <a href="/downloads/SwitchedOn_Issue21_Double.pdf"
        >Computing Concepts and Models: to Enrich the Entire School
        Curriculum</a
      >
    </li>
  </ul>
  <h2>Praise for the Turtle System</h2>
  <blockquote>
    <p>
      The <i>Turtle System</i> is a wonderful educational tool to develop young
      people&rsquo;s thinking, giving a vision of the beauty and joy of Computer
      Science by offering a very approachable introduction to programming and
      much more. It connects the commands children write with the underlying
      instructions given to the machine that executes them, to satisfy the
      inquiring mind that constantly asks &lsquo;how do they do that?&rsquo; The
      <i>Turtle System</i> makes real the connection between programming
      languages and machine code in a way that I have never seen in any other
      educational package, giving a more complete understanding of the processes
      involved, language translation and the fundamental notion of abstraction.
      It is deep stuff, that can be delved into at different levels with
      different ages, and I&rsquo;d love to see it more widely used.
    </p>
    <cite
      >Roger Davies, Editor of CAS magazine
      <a href="http://community.computingatschool.org.uk/resources/3127"
        ><i>SwitchedOn</i></a
      ></cite
    >
  </blockquote>
`;
