// 音效播放：與 BGM 系統獨立（不同音量、不會互相打斷）
//
// 用法：在 scene 內呼叫 SfxSystem.play(scene, "sfx-click")
// 缺資產時靜默不播；不阻塞遊戲流程。

import Phaser from "phaser";

export type SfxKey =
	| "sfx-click"
	| "sfx-hit"
	| "sfx-bomb"
	| "sfx-alarm"
	// 友善動物的個別叫聲：被槌子打中或被炸彈波及時，與 sfx-hit / sfx-bomb 同時播放
	| "sfx-cat"
	| "sfx-dog"
	| "sfx-owl"
	| "sfx-hawk";

const VOLUME: Record<SfxKey, number> = {
	"sfx-click": 0.5,
	"sfx-hit": 0.7,
	"sfx-bomb": 0.85,
	"sfx-alarm": 0.65,
	// 動物聲音稍低於 sfx-hit，避免疊播時遮蓋槌子的清脆感
	"sfx-cat": 0.6,
	"sfx-dog": 0.6,
	"sfx-owl": 0.6,
	"sfx-hawk": 1.0, // 個別調整
};

export const SfxSystem = {
	play(scene: Phaser.Scene, key: SfxKey): void {
		// 缺檔靜默不播
		if (!scene.cache.audio.exists(key)) return;
		// 若 AudioContext 還沒解鎖（少數情況），跳過避免報錯
		const ctx = (scene.sound as Phaser.Sound.WebAudioSoundManager).context;
		if (ctx && ctx.state === "suspended") return;

		try {
			scene.sound.play(key, { volume: VOLUME[key] });
		} catch {
			// 忽略
		}
	},
};
