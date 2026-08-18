import type { RequestParams } from "./types.ts";
import page from "./_layout/page.ts";
import { htmlResponse } from "./utils/response.ts";
import { html } from "@merivale/womble";

export default (requestParams: RequestParams): Promise<Response> =>
  htmlResponse(page(requestParams, { header, main }));

const header = html`
  <h1>Contact Us</h1>
  <p>
    If you have any questions about the <i>Turtle System</i>, its use in the
    National Curriculum, or if you have any requests or suggestions for how it
    could be improved, please get in touch. We particularly welcome input from
    teachers in the UK, for whom the software is primarily intended.
  </p>
`;

const main = html`
  <h2>Prof. Peter Millican</h2>
  <div class="mugshot">
    <img src="/images/millican.jpg" alt="Peter Millican" />
  </div>
  <p><b>Project Chair, Developer of the Turtle System</b></p>
  <p>Hertford College, University of Oxford</p>
  <p><a href="http://www.millican.org/" target="blank">www.millican.org</a></p>
  <p>
    <a
      href="&#109;&#97;&#105;&#108;&#116;&#111;&#58;&#112;&#101;&#116;&#101;&#114;&#46;&#109;&#105;&#108;&#108;&#105;&#99;&#97;&#110;&#64;&#104;&#101;&#114;&#116;&#102;&#111;&#114;&#100;&#46;&#111;&#120;&#46;&#97;&#99;&#46;&#117;&#107;"
      >&#112;&#101;&#116;&#101;&#114;&#46;&#109;&#105;&#108;&#108;&#105;&#99;&#97;&#110;&#64;&#104;&#101;&#114;&#116;&#102;&#111;&#114;&#100;&#46;&#111;&#120;&#46;&#97;&#99;&#46;&#117;&#107;</a
    >
  </p>
  <h2>Dr Amyas Merivale</h2>
  <div class="mugshot">
    <img src="/images/merivale.jpg" alt="Amyas Merivale" />
  </div>
  <p><b>Project Coordinator, Web Developer</b></p>
  <p>Faculty of Philosophy, University of Oxford</p>
  <p><a href="http://www.merivale.uk/" target="blank">www.merivale.uk</a></p>
  <p>
    <a
      href="&#109;&#97;&#105;&#108;&#116;&#111;&#58;&#97;&#109;&#121;&#97;&#115;&#46;&#109;&#101;&#114;&#105;&#118;&#97;&#108;&#101;&#64;&#112;&#104;&#105;&#108;&#111;&#115;&#111;&#112;&#104;&#121;&#46;&#111;&#120;&#46;&#97;&#99;&#46;&#117;&#107;"
      >&#97;&#109;&#121;&#97;&#115;&#46;&#109;&#101;&#114;&#105;&#118;&#97;&#108;&#101;&#64;&#112;&#104;&#105;&#108;&#111;&#115;&#111;&#112;&#104;&#121;&#46;&#111;&#120;&#46;&#97;&#99;&#46;&#117;&#107;</a
    >
  </p>
`;
