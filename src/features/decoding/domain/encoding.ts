/**
 * The lab's character-encoding primitives — deliberately just the classroom
 * ASCII subset (space, digits, A-Z). Payloads only generate inside this set so
 * the printed character table students learned in class is always sufficient.
 */

export function encodeText(text: string): number[] {
  return [...text].map((ch) => ch.charCodeAt(0));
}

export function decodeText(codes: readonly number[]): string {
  return codes.map((c) => String.fromCharCode(c)).join("");
}

export function byteToBits(byte: number): string {
  return byte.toString(2).padStart(8, "0");
}

export function bitsToByte(bits: string): number {
  return Number.parseInt(bits, 2);
}

export function bytesToBitGroups(bytes: readonly number[]): string[] {
  return bytes.map(byteToBits);
}

/** Rows for the lookup-table panel: space, 0-9, A-Z — same coverage as class. */
export const CHAR_TABLE: { char: string; code: number }[] = [
  { char: "␣", code: 32 },
  ...Array.from({ length: 10 }, (_, i) => ({ char: String(i), code: 48 + i })),
  ...Array.from({ length: 26 }, (_, i) => ({ char: String.fromCharCode(65 + i), code: 65 + i })),
];

/** The stage-1 word list — short enough to hand-decode a few letters. */
export const WORDS: readonly string[] = [
  "SIGNAL",
  "DECODE",
  "CIPHER",
  "SECRET",
  "VECTOR",
  "KERNEL",
  "MODEM",
  "PACKET",
  "LASER",
  "ROBOT",
  "CURSOR",
  "BINARY",
  "PIXEL",
  "SOCKET",
  "MEMORY",
  "SCREEN",
  "SERVER",
  "CLIENT",
  "ROUTER",
  "SWITCH",
  "BRIDGE",
  "SENSOR",
  "CAMERA",
  "PRINTER",
  "SCANNER",
  "NETWORK",
  "SYSTEM",
  "WINDOW",
  "BUTTON",
  "FOLDER",
  "DRIVER",
  "TABLET",
  "MOBILE",
  "LAPTOP",
  "MARBLE",
  "ROCKET",
  "PLANET",
  "COMET",
  "ORBIT",
  "TUNNEL",
];

/**
 * Stage-2 sentences (A-Z + space only, ≤ 20 chars). Long enough that decoding
 * by hand one bit-group at a time is genuinely tedious — the loop wins.
 */
export const SENTENCES: readonly string[] = [
  "DATA NEEDS RULES",
  "BITS TELL SECRETS",
  "BYTES ARE NOT MAGIC",
  "SAME BITS NEW LOOK",
  "RULES MAKE MEANING",
  "MEANING NEEDS RULES",
  "READ THE HEADER",
  "FILES TALK TOO",
  "DECODE ME PLEASE",
  "NUMBERS BECOME WORDS",
  "HELLO DECODER",
  "PIXELS ARE NUMBERS",
  "A BYTE IS EIGHT BITS",
  "CONTEXT IS THE KEY",
  "INTERPRET NOT GUESS",
  "FORMAT IS A PROMISE",
  "MAGIC IS JUST RULES",
  "LOOK BEFORE DECODING",
  "BYTES IN ORDER",
  "CHARS ARE JUST CODES",
  "TABLES ARE CONTRACTS",
  "FILES HAVE HEADERS",
  "SIGNATURE SAYS TYPE",
  "THE DECODER DECIDES",
  "RAW DATA IS SILENT",
  "RULES HOLD MEANING",
  "NUMBERS NEED A KEY",
  "A CODE IS A BRIDGE",
  "READING IS DECODING",
  "SAME BYTES TWO LIVES",
  "NO RULES NO MESSAGE",
  "THE TABLE IS THE KEY",
  "DATA PLUS DECODER",
  "INTERPRET WITH CARE",
  "BYTES CARRY NO LABEL",
  "HEADERS SHOW THE WAY",
  "A FILE SPEAKS IN CODE",
  "CODES BECOME LETTERS",
  "EACH BYTE HAS A ROLE",
  "TRUST THE DECODER",
];

/** X1 hidden messages (≤ 24 chars — must fit the R-channel channel budget). */
export const HIDDEN_MESSAGES: readonly string[] = [
  "MEET AT THE LAB",
  "THE CODE IS SAFE",
  "PIGEON HAS LANDED",
  "LOOK INSIDE PIXELS",
  "CHANNEL R SPEAKS",
  "EVERY SECOND R",
  "COLORS KEEP SECRETS",
  "THE IMAGE TALKS",
  "HIDDEN IN RED",
  "RED CHANNEL TALKS",
  "PIXELS CAN WHISPER",
  "NOT JUST COLORS",
  "A SECRET IN RED",
  "STAY IN THE RED",
  "READ BETWEEN PIXELS",
  "SHHH READ THE R",
  "THE DOTS ARE LYING",
  "NOT EVERY DOT IS INK",
  "SHELTER IN PIXELS",
  "LOOK TWICE AT RED",
  "SECOND BYTE SPEAKS",
  "EVEN PIXELS TALK",
  "SECRET RIDES ON RED",
  "THE RED ONES COUNT",
  "LISTEN TO THE RED",
  "DATA HIDES IN COLOR",
  "EVERY OTHER DOT",
  "RED TELLS THE TRUTH",
];
