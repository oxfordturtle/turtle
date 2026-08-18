export enum PCode {
  // basic stack operations
  null = 0x00,
  drop = 0x01,
  dupl = 0x02,
  swap = 0x03,
  rota = 0x04,
  roll = 0x05,
  pick = 0x06,
  // operators on stack value
  incr = 0x07,
  decr = 0x08,
  neg = 0x09,
  abs = 0x0a,
  sign = 0x0b,
  // random numbers
  rand = 0x0c,
  seed = 0x0d,
  // maxInt
  mxin = 0x0e,
  // true value
  true = 0x0f,
  // Boolean (bitwise) operators
  shft = 0x10,
  not = 0x11,
  and = 0x12,
  or = 0x13,
  xor = 0x14,
  // lazy Boolean operators
  andl = 0x15,
  orl = 0x16,
  // binary integer operators
  plus = 0x17,
  subt = 0x18,
  mult = 0x19,
  divr = 0x1a,
  div = 0x1b,
  mod = 0x1c,
  // floored integer division
  divf = 0x1d,
  modf = 0x1e,
  // pseudo-real number operators
  divm = 0x20,
  lerp = 0x21,
  hyp = 0x22,
  root = 0x23,
  powr = 0x24,
  log = 0x25,
  alog = 0x26,
  ln = 0x27,
  exp = 0x28,
  sin = 0x29,
  cos = 0x2a,
  tan = 0x2b,
  asin = 0x2c,
  acos = 0x2d,
  atan = 0x2e,
  pi = 0x2f,
  // integer/Boolean comparison operators
  eqal = 0x30,
  noeq = 0x31,
  less = 0x32,
  more = 0x33,
  lseq = 0x34,
  mreq = 0x35,
  maxi = 0x36,
  mini = 0x37,
  // string comparison operators
  seql = 0x38,
  sneq = 0x39,
  sles = 0x3a,
  smor = 0x3b,
  sleq = 0x3c,
  smeq = 0x3d,
  smax = 0x3e,
  smin = 0x3f,
  // string operators
  case = 0x40,
  copy = 0x41,
  dels = 0x42,
  inss = 0x43,
  poss = 0x44,
  repl = 0x45,
  scat = 0x46,
  slen = 0x47,
  smul = 0x48,
  spad = 0x49,
  trim = 0x4a,
  // python string tests
  ctst = 0x4b,
  ernf = 0x4c,
  // string/array/list bound test
  test = 0x4d,
  // exception handling
  try = 0x4e,
  xcpt = 0x4f,
  // list operators
  lapp = 0x50,
  lcpy = 0x51,
  ldel = 0x52,
  lext = 0x53,
  lidx = 0x54,
  lins = 0x55,
  lmul = 0x56,
  lpop = 0x57,
  lprt = 0x58,
  lrem = 0x59,
  lrev = 0x5a,
  liad = 0x5b,
  lihp = 0x5c,
  // file processing
  chdr = 0x60,
  file = 0x61,
  diry = 0x62,
  open = 0x63,
  clos = 0x64,
  fbeg = 0x65,
  eof = 0x66,
  eoln = 0x67,
  frds = 0x68,
  frln = 0x69,
  fwrs = 0x6a,
  fwln = 0x6b,
  ffnd = 0x6c,
  fdir = 0x6d,
  fnxt = 0x6e,
  fmov = 0x6f,
  // type conversion operators
  ctos = 0x70,
  sasc = 0x71,
  itos = 0x72,
  hexs = 0x73,
  sval = 0x74,
  svdf = 0x75,
  qtos = 0x76,
  qval = 0x77,
  // debugging and tracing
  trac = 0x78,
  memw = 0x79,
  dump = 0x7a,
  pcoh = 0x7b,
  poke = 0x7c,
  // canvas state
  canv = 0x7d,
  reso = 0x7e,
  udat = 0x7f,
  // basic turtle settings
  home = 0x80,
  setx = 0x81,
  sety = 0x82,
  setd = 0x83,
  angl = 0x84,
  thik = 0x85,
  pen = 0x86,
  colr = 0x87,
  // turtle movement
  toxy = 0x88,
  mvxy = 0x89,
  drxy = 0x8a,
  fwrd = 0x8b,
  back = 0x8c,
  left = 0x8d,
  rght = 0x8e,
  turn = 0x8f,
  // fils and colours
  blnk = 0x90,
  rcol = 0x91,
  fill = 0x92,
  pixc = 0x93,
  pixs = 0x94,
  rgb = 0x95,
  mixc = 0x96,
  // drawing shapes
  rmbr = 0x97,
  frgt = 0x98,
  poly = 0x99,
  pfil = 0x9a,
  circ = 0x9b,
  blot = 0x9c,
  elps = 0x9d,
  eblt = 0x9e,
  box = 0x9f,
  // loading the (evaluation) stack
  ldin = 0xa0,
  ldvg = 0xa1,
  ldvv = 0xa2,
  ldvr = 0xa3,
  ldag = 0xa4,
  ldav = 0xa5,
  lstr = 0xa6,
  // storing from the (evaluation) stack
  stvg = 0xa7,
  stvv = 0xa8,
  stvr = 0xa9,
  // pointer and string/array operations
  lptr = 0xaa,
  sptr = 0xab,
  zptr = 0xac,
  cptr = 0xad,
  cstr = 0xae,
  hstr = 0xaf,
  // flow control
  jump = 0xb0,
  ifno = 0xb1,
  halt = 0xb2,
  subr = 0xb3,
  retn = 0xb4,
  pssr = 0xb5,
  plsr = 0xb6,
  psrj = 0xb7,
  plrj = 0xb8,
  // memory management
  ldmt = 0xb9,
  stmt = 0xba,
  memc = 0xbb,
  memr = 0xbc,
  hfix = 0xbd,
  hclr = 0xbe,
  hrst = 0xbf,
  // input
  stat = 0xc0,
  iclr = 0xc1,
  bufr = 0xc2,
  read = 0xc3,
  rdln = 0xc4,
  tdet = 0xc5,
  curs = 0xc6,
  // text output
  kech = 0xc7,
  outp = 0xc8,
  cons = 0xc9,
  disp = 0xca, // formerly prnt
  writ = 0xcb,
  newl = 0xcc,
  // timing
  time = 0xcd,
  tset = 0xce,
  wait = 0xcf,
  // dummy codes
  addr = 0xf0,
  dopr = 0xf1,
  fopr = 0xf2,
  ilin = 0xf3,
  lefs = 0xf4,
  newt = 0xf5,
  oldt = 0xf6,
  ord1 = 0xf7,
  rgts = 0xf8,
  rndc = 0xf9,
  svd0 = 0xfa,
  wrln = 0xfb,
}

export const pcodeArgs = (pcode: PCode): number => {
  switch (pcode) {
    case PCode.lstr:
      return -1; // varies; the next code specifies how many

    case PCode.pick: // fallthrough
    case PCode.true: // fallthrough
    case PCode.try: // fallthrough
    case PCode.lapp: // fallthrough
    case PCode.lcpy: // fallthrough
    case PCode.lext: // fallthrough
    case PCode.lidx: // fallthrough
    case PCode.lins: // fallthrough
    case PCode.lmul: // fallthrough
    case PCode.lpop: // fallthrough
    case PCode.lprt: // fallthrough
    case PCode.lrem: // fallthrough
    case PCode.lrev: // fallthrough
    case PCode.liad: // fallthrough
    case PCode.lihp: // fallthrough
    case PCode.ldel: // fallthrough
    case PCode.ldin: // fallthrough
    case PCode.ldvg: // fallthrough
    case PCode.ldag: // fallthrough
    case PCode.stvg: // fallthrough
    case PCode.jump: // fallthrough
    case PCode.ifno: // fallthrough
    case PCode.subr: // fallthrough
    case PCode.pssr: // fallthrough
    case PCode.memr:
      return 1;

    case PCode.ldvv: // fallthrough
    case PCode.ldvr: // fallthrough
    case PCode.ldav: // fallthrough
    case PCode.stvv: // fallthrough
    case PCode.stvr: // fallthrough
    case PCode.memc:
      return 2;

    default:
      return 0;
  }
};
