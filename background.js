chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "deepseek-chat") return false;

  (async () => {
    try {
      const apiKey = String(message.apiKey || "").trim();
      if (!apiKey) throw new Error("缺少 DeepSeek API Key");

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: message.model || "deepseek-v4-flash",
          messages: message.messages || [],
          temperature: 0.2,
          max_tokens: message.maxTokens || 1400,
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = data?.error?.message || data?.message || `HTTP ${response.status}`;
        throw new Error(detail);
      }

      const content = data?.choices?.[0]?.message?.content || "";
      if (!content) throw new Error("DeepSeek 返回为空");
      sendResponse({ ok: true, content, usage: data?.usage || null });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();

  return true;
});
