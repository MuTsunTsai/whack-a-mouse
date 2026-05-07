// 槌子游標的視覺與互動參數
//
// 您可以開這檔調整槌子顯示細節，不需重新 build。
//
// 座標約定（與 Phaser 一致）：
//   X 正值往右、Y 正值往下；角度單位是度

export const HAMMER = {
	// === 顯示尺寸 ===
	displaySize: 200, // 槌子圖在畫布上的顯示尺寸（邊長）

	// === 圖檔對齊 ===
	// 圖檔的「錨點」（origin）。預設 0.5/0.5 是圖中央。
	// 若 AI 生成的槌子圖案位置不對，可改 origin 或下面的 imageOffset 微調
	originX: 0.75,
	originY: 0.75,

	// 整張圖相對「指標位置」的偏移（讓圖看起來不會剛好擋住游標）
	imageOffsetX: 180,
	imageOffsetY: 5,

	// === 命中判定 ===
	// 槌頭（實際打擊點）相對「指標位置」的偏移。
	// 通常槌子是斜放的、槌頭在右下角；這個 offset 應該指向「圖中槌頭的中心」。
	tipOffsetX: 60,
	tipOffsetY: 30,

	// 命中半徑：槌頭中心與生物中心距離 < 此值才算打中
	hitRadius: 130,

	// === 揮擊動畫 ===
	swingDurationMs: 150, // 一次按下→揮擊→回復的總時間
	swingAngleDeg: -40, // 揮擊瞬間旋轉角度（度，正值順時針）

	// === 手機版相對移動 ===
	// 一次 pointerdown→pointerup 之間，累積位移小於這個值就算「tap = 打擊」；
	// 超過這個值視為「拖動槌子」、不觸發打擊
	mobileDragThresholdPx: 12,
	// 手指相對位移 → 槌子相對位移的倍率。1.0 = 1:1，1.5 = 槌子移動快 50%
	mobileMoveSpeedMul: 2.0,

	// === 除錯：暫時性的十字準心 ===
	// 開啟後會在槌頭判定點顯示紅色十字與紅色圓圈（半徑 = hitRadius），
	// 方便調整 tipOffsetX/Y 與 hitRadius。調好後改回 false 即可隱藏。
	debugCrosshair: false,
};

export type HammerConfig = typeof HAMMER;
