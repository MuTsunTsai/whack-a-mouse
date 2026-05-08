// 成就資料表：可被收集的成就清單
//
// 解鎖時機由各場景在達成條件時呼叫 SaveSystem.unlockAchievement(id) 觸發。
// 解鎖通知：在達成之後的下一個結算畫面（GameOverScene / EndingScene）跳出彈跳。

export interface Achievement {
	id: string;          // 唯一 ID，作為 SaveSystem 與 BootScene 載入 key 的根
	title: string;       // 成就名稱（已解鎖才顯示，未解鎖只顯示「???」）
	description: string; // 達成條件說明（已解鎖才顯示）
	cardKey: string;     // 對應卡片 texture key（建議命名：card-achv-<id>）
}

// 成就清單
//
// 命名慣例：
//   - id 用 snake_case，作為 SaveSystem 寫入的 key
//   - cardKey 統一前綴 "card-achv-"，BootScene 會自動嘗試載入對應檔案，缺檔靜默 fallback
export const ACHIEVEMENTS: Achievement[] = [
	{
		id: "iron_fan",
		title: "安鼠鐵粉",
		description: "完成 100 次關卡（無論輸贏）。",
		cardKey: "card-achv-iron-fan",
	},
	{
		id: "expert_easy",
		title: "安鼠高手",
		description: "簡單級從第一關開始連續通關到第五關，全程不使用炸彈、不重玩、不退出。",
		cardKey: "card-achv-expert-easy",
	},
	{
		id: "expert_normal",
		title: "安鼠達人",
		description: "普通級從第一關開始連續通關到第五關，全程不使用炸彈、不重玩、不退出。",
		cardKey: "card-achv-expert-normal",
	},
	{
		id: "expert_hard",
		title: "安鼠神人",
		description: "困難級從第一關開始連續通關到第五關，全程不使用炸彈、不重玩、不退出。",
		cardKey: "card-achv-expert-hard",
	},
	{
		id: "poison_maniac",
		title: "毒餌狂魔",
		description: "單一場 run 內釋放 15 次老鼠藥（退到選關或主畫面會重置計數）。",
		cardKey: "card-achv-poison-maniac",
	},
	{
		id: "animal_killer",
		title: "動物殺手",
		description: "單一場 run 內打中 30 次無辜動物（退到選關或主畫面會重置計數）。",
		cardKey: "card-achv-animal-killer",
	},
	{
		id: "last_gasp",
		title: "垂死掙扎",
		description: "在距離漢他爆發只差一隻的當下，徒手槌中老鼠，歷史累計 30 次。",
		cardKey: "card-achv-last-gasp",
	},
	{
		id: "bad_start",
		title: "出師不利",
		description: "關卡開局 5 秒內就因漢他病毒爆發而失敗。",
		cardKey: "card-achv-bad-start",
	},
	{
		id: "precision_strike",
		title: "精準打擊",
		description: "單關內連續命中老鼠 30 次（combo 達 30）。",
		cardKey: "card-achv-precision-strike",
	},
	{
		id: "survivor",
		title: "適者生存",
		description: "在生存模式中存活 100 秒以上。",
		cardKey: "card-achv-survivor",
	},
];
