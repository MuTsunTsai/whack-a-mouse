// 5 大鼠跡熱區關卡資料
//
// 鼠跡嚴重程度（依市府公布的通報量排序，由輕到重）：
// 萬華 → 大同 → 中正 → 中山 → 大安
// 因此玩家從「最輕的萬華」打起，最後魔王關是「最嚴重的大安」。
import type { CreatureType } from "./creatures.ts";

export interface StageDef {
	id: number;
	key: string; // 對應背景圖檔名 bg-{key}.png
	name: string;
	description: string;
	bgColor: number; // fallback 純色背景
	holeCount: number[];
	durationSec: number;
	passScore: number;
	// 生物權重表，會被 SpawnSystem 用作加權抽選
	weights: Partial<Record<CreatureType, number>>;
	// 生物冒出最短/最長間隔（毫秒）
	spawnIntervalMs: [number, number];
	// 生物在洞口停留時間範圍（毫秒）
	lifespanMs: [number, number];
}

export const STAGES: StageDef[] = [
	{
		id: 1,
		key: "wanhua",
		name: "萬華區",
		description: "夜市邊角\n剛冒幾隻鼠跡",
		bgColor: 0x4a3a6e,
		holeCount: [3, 3],
		durationSec: 30,
		passScore: 350,
		weights: { mouse: 1.0 },
		spawnIntervalMs: [600, 1100],
		lifespanMs: [1100, 1500],
	},
	{
		id: 2,
		key: "datong",
		name: "大同區",
		description: "迪化街老巷\n出沒街貓",
		bgColor: 0x3d5a80,
		holeCount: [2, 3, 2],
		durationSec: 35,
		passScore: 470,
		weights: { mouse: 1.0, cat: 0.18 },
		spawnIntervalMs: [550, 1000],
		lifespanMs: [1000, 1400],
	},
	{
		id: 3,
		key: "zhongzheng",
		name: "中正區",
		description: "市府附近\n毛孩誤踩毒餌",
		bgColor: 0x884444,
		holeCount: [3, 4, 2],
		durationSec: 40,
		passScore: 600,
		weights: { mouse: 0.9, cat: 0.18, dog: 0.12 },
		spawnIntervalMs: [500, 950],
		lifespanMs: [950, 1300],
	},
	{
		id: 4,
		key: "zhongshan",
		name: "中山區",
		description: "商業區夜空\n出現貓頭鷹",
		bgColor: 0x9c7a3a,
		holeCount: [3, 4, 3],
		durationSec: 50,
		passScore: 830,
		weights: { mouse: 0.85, cat: 0.16, dog: 0.12, owl: 0.08 },
		spawnIntervalMs: [450, 900],
		lifespanMs: [900, 1250],
	},
	{
		id: 5,
		key: "daan",
		name: "大安區",
		description: "鼠患巔峰魔王關\n老鷹盤旋",
		bgColor: 0x7a6a4a,
		holeCount: [4, 4, 4],
		durationSec: 60,
		passScore: 1100,
		weights: { mouse: 0.75, cat: 0.18, dog: 0.14, owl: 0.10, hawk: 0.06 },
		spawnIntervalMs: [380, 820],
		lifespanMs: [820, 1150],
	},
];

export function getStageById(id: number): StageDef {
	const stage = STAGES.find((s) => s.id === id);
	if (!stage) {
		throw new Error(`找不到關卡 id=${id}`);
	}
	return stage;
}
