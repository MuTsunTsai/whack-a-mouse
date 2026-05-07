// 背景音樂控制：跨 scene 共用，避免每次 scene 切換都重新播放
// 使用 game.sound 直接管理，scene 切換時呼叫 play("bgm-xxx") 即可平滑切軌
//
// 自動播放限制處理：
// 瀏覽器（特別是 Chrome）在使用者第一次互動前會封鎖 AudioContext，
// 此時呼叫 .play() 不會真的出聲，且 Phaser 不會 throw error。
// 解法：監聽全域 pointerdown / keydown 事件，第一次互動時若有 BGM 在等待播放，
// 就呼叫 sound.context.resume() 並重新觸發 play()。

import Phaser from "phaser";

export type BgmKey =
	| "bgm-title"
	| "bgm-game"
	| "bgm-game-boss" // 第 5 關（大安魔王關）專用
	| "bgm-stage-clear"
	| "bgm-gameover"
	| "bgm-ending-good"
	| "bgm-ending-bad";

const FADE_OUT_MS = 400;
const FADE_IN_MS = 600;
const TARGET_VOLUME = 0.45;

interface MusicState {
	current?: Phaser.Sound.BaseSound;
	currentKey?: BgmKey;
	pendingScene?: Phaser.Scene;
	pendingKey?: BgmKey;
	unlockListenerAttached?: boolean;
}

const state: MusicState = {};

function attachUnlockListener(scene: Phaser.Scene): void {
	if (state.unlockListenerAttached) {
		return;
	}
	state.unlockListenerAttached = true;

	const tryUnlock = () => {
		const ctx = (scene.sound as Phaser.Sound.WebAudioSoundManager).context;
		if (ctx && ctx.state === "suspended") {
			ctx.resume().catch(() => {});
		}
		// 若有等待中的 BGM 還沒真的響起，重新觸發播放
		if (state.pendingScene && state.pendingKey) {
			const targetScene = state.pendingScene;
			const targetKey = state.pendingKey;
			state.pendingScene = undefined;
			state.pendingKey = undefined;
			MusicSystem.play(targetScene, targetKey);
		}
	};

	// 一次性監聽：游標、觸控、鍵盤
	const dom = scene.game.canvas;
	const once = (ev: string) => {
		const handler = () => {
			tryUnlock();
			dom.removeEventListener(ev, handler);
		};
		dom.addEventListener(ev, handler);
	};
	once("pointerdown");
	once("touchstart");
	// 鍵盤要綁 window 因為 canvas 預設沒 focus
	const keyHandler = () => {
		tryUnlock();
		window.removeEventListener("keydown", keyHandler);
	};
	window.addEventListener("keydown", keyHandler);
}

export const MusicSystem = {
	// 播放指定 BGM；若已是同一首則不動，若是不同首則淡出舊的、淡入新的
	play(scene: Phaser.Scene, key: BgmKey): void {
		if (state.currentKey === key && state.current?.isPlaying) {
			return;
		}
		// 沒這支音檔（缺資源時）就靜音不動
		if (!scene.cache.audio.exists(key)) {
			return;
		}

		// 若 AudioContext 仍 suspended，先記下要播什麼，等第一次互動再播。
		// 注意：Phaser 的 sound.locked 是它自己的內部 flag，並不準確反映 WebAudio
		// 實際狀態（context resume 後仍可能保持 locked），所以這裡只看 context.state。
		const ctx = (scene.sound as Phaser.Sound.WebAudioSoundManager).context;
		if (ctx && ctx.state === "suspended") {
			state.pendingScene = scene;
			state.pendingKey = key;
			attachUnlockListener(scene);
			return;
		}

		// 淡出舊的
		const old = state.current;
		if (old?.isPlaying) {
			scene.tweens.add({
				targets: old,
				volume: 0,
				duration: FADE_OUT_MS,
				onComplete: () => old.stop(),
			});
		}

		// 淡入新的
		const next = scene.sound.add(key, { loop: true, volume: 0 });
		next.play();
		scene.tweens.add({
			targets: next,
			volume: TARGET_VOLUME,
			duration: FADE_IN_MS,
		});

		state.current = next;
		state.currentKey = key;
	},

	stop(scene: Phaser.Scene): void {
		const old = state.current;
		if (old?.isPlaying) {
			scene.tweens.add({
				targets: old,
				volume: 0,
				duration: FADE_OUT_MS,
				onComplete: () => old.stop(),
			});
		}
		state.current = undefined;
		state.currentKey = undefined;
		state.pendingScene = undefined;
		state.pendingKey = undefined;
	},
};
