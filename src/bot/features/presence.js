// 灵感来源于 AC0xRPFS001

import { ActivityType } from "discord.js";

const presenceArray = [
  { type: ActivityType.Playing },
  { type: ActivityType.Listening },
  { type: ActivityType.Watching },
];

function* infArray(arr) {
  let i = 0;
  while (true) {
    yield arr[i++];
    i %= arr.length;
  }
}

// rAnDoM cAsE
function randomUpper(text) {
  return text
    .split("")
    .map((x) => (Math.random() > 0.5 ? x : x.toUpperCase()))
    .join("");
}

// ｆｕｌｌｗｉｄｔｈ
function fullWidth(text) {
  return text
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 33 && code <= 126) return String.fromCharCode(code + 0xfee0);
      return c;
    })
    .join("");
}

// ʇxǝʇ uʍop ǝpısdn
function upsideDown(text) {
  const map = {
    a: "ɐ",
    b: "q",
    c: "ɔ",
    d: "p",
    e: "ǝ",
    f: "ɟ",
    g: "ƃ",
    h: "ɥ",
    i: "ı",
    j: "ɾ",
    k: "ʞ",
    l: "l",
    m: "ɯ",
    n: "u",
    o: "o",
    p: "d",
    q: "b",
    r: "ɹ",
    s: "s",
    t: "ʇ",
    u: "n",
    v: "ʌ",
    w: "ʍ",
    x: "x",
    y: "ʎ",
    z: "z",
    A: "∀",
    B: "ᗺ",
    C: "Ɔ",
    D: "ᗡ",
    E: "Ǝ",
    F: "Ⅎ",
    G: "פ",
    H: "H",
    I: "I",
    J: "ɾ",
    K: "ʞ",
    L: "˥",
    M: "W",
    N: "N",
    O: "O",
    P: "Ԁ",
    Q: "Q",
    R: "ɹ",
    S: "S",
    T: "┴",
    U: "∩",
    V: "Λ",
    W: "M",
    X: "X",
    Y: "⅄",
    Z: "Z",
  };
  return text
    .split("")
    .reverse()
    .map((c) => map[c] ?? c)
    .join("");
}

// 🅱🅾🆇🅴🅳 letters
function boxed(text) {
  const map = {
    a: "🅰",
    b: "🅱",
    c: "🅲",
    d: "🅳",
    e: "🅴",
    f: "🅵",
    g: "🅶",
    h: "🅷",
    i: "🅸",
    j: "🅹",
    k: "🅺",
    l: "🅻",
    m: "🅼",
    n: "🅽",
    o: "🅾",
    p: "🅿",
    q: "🆀",
    r: "🆁",
    s: "🆂",
    t: "🆃",
    u: "🆄",
    v: "🆅",
    w: "🆆",
    x: "🆇",
    y: "🆈",
    z: "🆉",
  };
  return text
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("");
}

// Z̴̧̡̛͙a̷̢͝l̵̡̛͝g̶̢̛͠o̷̧̕͝
function zalgo(text) {
  const above = [
    "̍",
    "̎",
    "̄",
    "̅",
    "̿",
    "̑",
    "̆",
    "̐",
    "͒",
    "͗",
    "͑",
    "̇",
    "̈",
    "̊",
    "͂",
    "̓",
    "̈́",
    "͊",
    "͋",
    "͌",
    "̃",
    "̂",
    "̌",
    "͐",
    "̀",
    "́",
    "̋",
    "̏",
    "̒",
    "̓",
    "̔",
    "̽",
    "̉",
    "ͅ",
    "͇",
    "͈",
    "͉",
    "͍",
    "͎",
    "̀",
    "́",
  ];
  const below = [
    "̖",
    "̗",
    "̘",
    "̙",
    "̜",
    "̝",
    "̞",
    "̟",
    "̠",
    "̤",
    "̥",
    "̦",
    "̩",
    "̪",
    "̫",
    "̬",
    "̭",
    "̮",
    "̯",
    "̰",
    "̱",
    "̲",
    "̳",
    "̹",
    "̺",
    "̻",
    "̼",
    "ͅ",
    "͇",
    "͈",
    "͉",
    "͍",
    "͎",
    "̣",
    "̤",
  ];
  return text
    .split("")
    .map((c) => {
      if (c === " ") return c;
      const numMarks = Math.floor(Math.random() * 3) + 1;
      let result = c;
      for (let i = 0; i < numMarks; i++)
        result += above[Math.floor(Math.random() * above.length)];
      for (let i = 0; i < numMarks; i++)
        result += below[Math.floor(Math.random() * below.length)];
      return result;
    })
    .join("");
}

// 𝓈𝒸𝓇𝒾𝓅𝓉 cursive
function cursive(text) {
  const map = {
    a: "𝒶",
    b: "𝒷",
    c: "𝒸",
    d: "𝒹",
    e: "𝑒",
    f: "𝒻",
    g: "𝑔",
    h: "𝒽",
    i: "𝒾",
    j: "𝒿",
    k: "𝓀",
    l: "𝓁",
    m: "𝓂",
    n: "𝓃",
    o: "𝑜",
    p: "𝓅",
    q: "𝓆",
    r: "𝓇",
    s: "𝓈",
    t: "𝓉",
    u: "𝓊",
    v: "𝓋",
    w: "𝓌",
    x: "𝓍",
    y: "𝓎",
    z: "𝓏",
    A: "𝒜",
    B: "ℬ",
    C: "𝒞",
    D: "𝒟",
    E: "ℰ",
    F: "ℱ",
    G: "𝒢",
    H: "ℋ",
    I: "ℐ",
    J: "𝒥",
    K: "𝒦",
    L: "ℒ",
    M: "ℳ",
    N: "𝒩",
    O: "𝒪",
    P: "𝒫",
    Q: "𝒬",
    R: "ℛ",
    S: "𝒮",
    T: "𝒯",
    U: "𝒰",
    V: "𝒱",
    W: "𝒲",
    X: "𝒳",
    Y: "𝒴",
    Z: "𝒵",
  };
  return text
    .split("")
    .map((c) => map[c] ?? c)
    .join("");
}

const transforms = [randomUpper, fullWidth, upsideDown, boxed, zalgo, cursive];

function* infArray2(arr) {
  let i = 0;
  while (true) {
    yield arr[i++];
    i %= arr.length;
  }
}

export default (client) => {
  const presence = infArray(presenceArray);
  const transform = infArray2(transforms);
  client.once("clientReady", () => {
    const setPresence = () => {
      if (client.user)
        client.user.setActivity(
          transform.next().value("LingLong"),
          presence.next().value,
        );
    };
    setPresence();
    setInterval(setPresence, 15_000);
  });
};
