/**
 * Taking one photo on a phone, mapped onto the five parts. Same claim as the
 * add demo, met in an everyday device: the touch screen is both an input and
 * an output device; 运行内存 is memory and 存储空间 is external storage.
 * Each part's role is revealed only at the step where it shows up, so the
 * student watches the touch screen pick up its second role.
 */

export type PhonePartId = "touch" | "camera" | "chip" | "ram" | "storage";

export type PhonePart = {
  id: PhonePartId;
  title: string;
  /** Everyday description — what students see on a spec sheet or in hand. */
  detail: string;
};

export const PHONE_PARTS: PhonePart[] = [
  { id: "touch", title: "触摸屏", detail: "手指点按，也显示画面" },
  { id: "camera", title: "摄像头", detail: "把眼前的景物变成数据" },
  { id: "chip", title: "处理器芯片", detail: "手机的 CPU" },
  { id: "ram", title: "运行内存", detail: "参数表里的「8 GB 运行内存」" },
  { id: "storage", title: "存储空间", detail: "参数表里的「256 GB 存储空间」" },
];

export type PhoneStep = {
  /** 0 is the idle state before the first run-through. */
  index: number;
  highlight: PhonePartId[];
  caption: string;
  /** Five-parts role each highlighted part shows at this step. */
  reveals: Partial<Record<PhonePartId, string>>;
};

export const PHONE_STEPS: PhoneStep[] = [
  {
    index: 0,
    highlight: [],
    caption: "按「执行下一步」，看拍一张照片要用到手机里的哪些部件。",
    reveals: {},
  },
  {
    index: 1,
    highlight: ["touch", "camera"],
    caption: "手指点一下触摸屏上的快门，摄像头把眼前的景物变成数据。",
    reveals: { touch: "输入设备", camera: "输入设备" },
  },
  {
    index: 2,
    highlight: ["ram"],
    caption: "照片数据先放进运行内存。",
    reveals: { ram: "存储器 · 内存" },
  },
  {
    index: 3,
    highlight: ["chip"],
    caption: "处理器芯片从运行内存取出照片，调亮度、调颜色。",
    reveals: { chip: "控制器 + 运算器" },
  },
  {
    index: 4,
    highlight: ["touch"],
    caption: "处理好的照片显示在触摸屏上。",
    reveals: { touch: "输出设备" },
  },
  {
    index: 5,
    highlight: ["storage"],
    caption: "照片写进存储空间，关机以后也还在。",
    reveals: { storage: "存储器 · 外存" },
  },
];

export const PHONE_STEP_COUNT = PHONE_STEPS.length - 1;

/** The roles each part has shown through `step`, in the order they appeared. */
export function phoneTags(step: number): Record<PhonePartId, string[]> {
  const tags: Record<PhonePartId, string[]> = {
    touch: [],
    camera: [],
    chip: [],
    ram: [],
    storage: [],
  };
  for (const s of PHONE_STEPS.slice(1, step + 1)) {
    for (const [part, role] of Object.entries(s.reveals) as [PhonePartId, string][]) {
      if (!tags[part].includes(role)) tags[part].push(role);
    }
  }
  return tags;
}
