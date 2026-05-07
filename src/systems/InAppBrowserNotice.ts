// 偵測 in-app 瀏覽器（如 Facebook / IG / LINE / WeChat 內嵌 webview）
// → 若是的話，跳出 DOM 對話框提醒玩家用外部瀏覽器開啟以達最佳體驗
//
// 為什麼用 DOM 而非 Phaser scene：偵測時機在 Phaser.Game 建立之前最乾淨；
// 對話框邏輯也很簡單，不值得搞一個額外場景。

import InAppSpy from "inapp-spy";

/** 偵測並（必要時）顯示提示。回傳是否曾顯示。 */
export function showInAppBrowserNoticeIfNeeded(): boolean {
	const { isInApp } = InAppSpy();
	if (!isInApp) return false;

	// 已經顯示過（理論上一次性、但保險）
	if (document.getElementById("inapp-browser-notice")) return true;

	const overlay = document.createElement("div");
	overlay.id = "inapp-browser-notice";
	Object.assign(overlay.style, {
		position: "fixed",
		inset: "0",
		background: "rgba(0, 0, 0, 0.75)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		zIndex: "999999",
		fontFamily: "system-ui, -apple-system, 'Microsoft JhengHei', sans-serif",
		padding: "20px",
		boxSizing: "border-box",
	} satisfies Partial<CSSStyleDeclaration>);

	const card = document.createElement("div");
	Object.assign(card.style, {
		background: "#2a2a3a",
		color: "#ffffff",
		borderRadius: "12px",
		padding: "28px 24px",
		maxWidth: "420px",
		width: "100%",
		textAlign: "center",
		boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6)",
		border: "2px solid #4a4a5a",
	} satisfies Partial<CSSStyleDeclaration>);

	const icon = document.createElement("div");
	icon.textContent = "🌐";
	Object.assign(icon.style, {
		fontSize: "48px",
		marginBottom: "16px",
	} satisfies Partial<CSSStyleDeclaration>);

	const message = document.createElement("p");
	message.textContent = "建議用外部瀏覽器開啟以達到最好效果";
	Object.assign(message.style, {
		fontSize: "20px",
		lineHeight: "1.6",
		margin: "0 0 24px 0",
		fontWeight: "600",
	} satisfies Partial<CSSStyleDeclaration>);

	const button = document.createElement("button");
	button.textContent = "確定";
	button.type = "button";
	Object.assign(button.style, {
		background: "#4477aa",
		color: "#ffffff",
		border: "none",
		borderRadius: "8px",
		padding: "12px 36px",
		fontSize: "20px",
		fontWeight: "700",
		cursor: "pointer",
		minWidth: "140px",
	} satisfies Partial<CSSStyleDeclaration>);
	// vendor-prefixed 屬性 lib.dom 沒列、用 setProperty 設
	button.style.setProperty("-webkit-tap-highlight-color", "rgba(255, 255, 255, 0.2)");
	button.addEventListener("click", () => {
		overlay.remove();
	});

	card.appendChild(icon);
	card.appendChild(message);
	card.appendChild(button);
	overlay.appendChild(card);
	document.body.appendChild(overlay);
	return true;
}
