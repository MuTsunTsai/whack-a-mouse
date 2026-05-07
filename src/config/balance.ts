// 全域可調平衡參數

export const BALANCE = {
	// 集氣條
	chargeMax: 100,
	chargeStartValue: 0,
	/**
	 * 揮空時集氣的比例：相對於老鼠 chargeGain 的倍率。
	 * 例：mouse.chargeGain=10、missChargeGainRate=0.6 → 揮空得 6 點集氣。
	 * 設計目的：玩家就算誤判、揮空也有微弱的「練習回饋」，不至於完全空轉。
	 */
	missChargeGainRate: 0.6,

	// 老鼠藥炸彈
	bombShakeDurationMs: 500,
	bombShakeIntensity: 0.012,
	bombParticleLifespanMs: 800,
	bombParticleCount: 80,

	// Combo 連擊
	// 每次 combo 額外增加「基底得分 × comboBonusRate」的加分。
	// 例：基底 10、bonus 0.1 → combo=1 得 10、combo=2 得 11、combo=5 得 14...
	// 揮空、誤打無辜、用炸彈 都會中斷 combo。
	// combo 從 3 開始顯示在畫面左上角。
	comboBonusRate: 0.1,
	comboDisplayThreshold: 3,

	// 遊戲畫布（採 16:9 比例貼近主流視窗，避免 FIT 模式產生大量黑邊）
	gameWidth: 1280,
	gameHeight: 720,
	bgFallback: 0x1e1e2e,
};

export type BalanceConfig = typeof BALANCE;
