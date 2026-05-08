// 資源 URL 解析：嘗試多種副檔名，找到實際存在於 server 的那一份
//
// 安全策略：
//   - 圖片：依序試 png / jpg / jpeg / webp。WebP 在「瀏覽器無法解碼時」會被跳過
//     （透過一支 1×1 純 WebP data URL 的探針），避免拿到 WebP 後 Phaser 解碼失敗
//     導致該資源變空白。
//   - 音訊：依序試 mp3 / ogg / wav / m4a。常見現代瀏覽器都支援 mp3，故沒做能力探測。
//
// 為什麼用 HEAD？避免一次抓整張圖只為了確認存在；HEAD 只看 status + Content-Type。
//
// 為什麼判斷 Content-Type 而非單看 status？
//   Rsbuild dev server 對找不到的 public/ 路徑會回 200 + HTML（SPA fallback），
//   單看 res.ok 會誤判成「檔案存在」。判斷 Content-Type 才能正確識別。

let webpSupportPromise: Promise<boolean> | null = null;

/**
 * 偵測瀏覽器是否能解碼 WebP。
 * 用一支極小的 WebP data URL 餵給 createImageBitmap 試解碼；可解 → 支援。
 * 結果快取一次、後續直接拿。
 */
function detectWebpSupport(): Promise<boolean> {
	if (webpSupportPromise) return webpSupportPromise;
	webpSupportPromise = (async () => {
		// 1×1 lossless WebP（base64）
		const dataUrl =
			"data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=";
		try {
			if (typeof createImageBitmap !== "function") {
				// 老到沒有 createImageBitmap 的瀏覽器，保險起見視為不支援
				return false;
			}
			const blob = await fetch(dataUrl).then((r) => r.blob());
			await createImageBitmap(blob);
			return true;
		} catch {
			return false;
		}
	})();
	return webpSupportPromise;
}

async function assetExists(url: string): Promise<boolean> {
	try {
		const res = await fetch(url, { method: "HEAD" });
		if (!res.ok) return false;
		const contentType = res.headers.get("content-type") ?? "";
		return contentType.startsWith("image/");
	} catch {
		return false;
	}
}

/**
 * 嘗試多種副檔名找到實際存在的圖檔；找不到回傳 null。
 * 副檔名優先順序：
 *   - webp（瀏覽器支援時優先用、檔案小）
 *   - png / jpg / jpeg（webp 缺檔或瀏覽器不支援時的 fallback）
 * 若是 webp 但瀏覽器不支援會自動跳過。
 */
export async function resolveImageUrl(name: string): Promise<string | null> {
	const webpOk = await detectWebpSupport();
	const exts = ["webp", "png", "jpg", "jpeg"];
	for (const ext of exts) {
		if (ext === "webp" && !webpOk) continue;
		const url = `assets/images/${name}.${ext}`;
		if (await assetExists(url)) return url;
	}
	return null;
}

/** 嘗試多種副檔名找到實際存在的音訊檔；找不到回傳 null。 */
export async function resolveAudioUrl(name: string): Promise<string | null> {
	for (const ext of ["mp3", "ogg", "wav", "m4a"]) {
		const url = `assets/audio/${name}.${ext}`;
		try {
			const res = await fetch(url, { method: "HEAD" });
			if (!res.ok) continue;
			const ct = res.headers.get("content-type") ?? "";
			if (ct.startsWith("audio/") || ct.startsWith("application/octet-stream")) return url;
		} catch {
			// 忽略
		}
	}
	return null;
}
