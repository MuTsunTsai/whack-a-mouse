// CG 回憶（畫廊）資料表：可被收集的插畫清單
//
// 玩家在遊戲中第一次看到某張插畫時會自動解鎖（程式邏輯由 GameOverScene / EndingScene 觸發）。
// 未解鎖的插畫在 GalleryScene 中顯示為剪影 + 鎖頭，已解鎖則正常顯示。

export interface GalleryEntry {
	cgKey: string; // 對應 BootScene 載入的 texture key
	title: string;
	hint: string; // 未解鎖時顯示的提示文字
}

export const GALLERY_ENTRIES: GalleryEntry[] = [
	// 過關插畫（5）
	{ cgKey: "bg-clear-wanhua", title: "萬華・夜市初勝", hint: "通過第 1 關" },
	{ cgKey: "bg-clear-datong", title: "大同・老巷捷報", hint: "通過第 2 關" },
	{ cgKey: "bg-clear-zhongzheng", title: "中正・廣場凱旋", hint: "通過第 3 關" },
	{ cgKey: "bg-clear-zhongshan", title: "中山・繁華致勝", hint: "通過第 4 關" },
	{ cgKey: "bg-clear-daan", title: "大安・林蔭封王", hint: "通過第 5 關" },
	// 失敗插畫（2）
	{ cgKey: "bg-gameover-hanta", title: "漢他事件", hint: "在某關因漢他病毒倒數歸零而下台" },
	{ cgKey: "bg-gameover-fail", title: "議員質詢", hint: "在某關因分數不足而被質詢" },
	// 結局插畫（2）
	{ cgKey: "bg-ending-good", title: "Good Ending・親力親為", hint: "達成 Good 結局" },
	{ cgKey: "bg-ending-bad", title: "Bad Ending・生態崩盤", hint: "達成 Bad 結局" },
];
