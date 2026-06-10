const AI_PROVIDERS = {
  deepseek: {
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat"
  },
  qwen: {
    label: "通义千问",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-plus"
  },
  zhipu: {
    label: "智谱 GLM",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    defaultModel: "glm-4-flash"
  },
  moonshot: {
    label: "Kimi",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    defaultModel: "moonshot-v1-8k"
  },
  siliconflow: {
    label: "硅基流动",
    endpoint: "https://api.siliconflow.cn/v1/chat/completions",
    defaultModel: "Qwen/Qwen2.5-72B-Instruct"
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !["ai-chat", "deepseek-chat"].includes(message.type)) return false;

  (async () => {
    try {
      const providerKey = AI_PROVIDERS[message.provider] ? message.provider : "deepseek";
      const provider = AI_PROVIDERS[providerKey];
      const apiKey = String(message.apiKey || "").trim();
      if (!apiKey) throw new Error(`缺少 ${provider.label} API Key`);

      const response = await fetch(provider.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: message.model || provider.defaultModel,
          messages: message.messages || [],
          temperature: 0.2,
          max_tokens: message.maxTokens || 1400
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = data?.error?.message || data?.message || `HTTP ${response.status}`;
        throw new Error(detail);
      }

      const content = data?.choices?.[0]?.message?.content || "";
      if (!content) throw new Error(`${provider.label} 返回为空`);
      sendResponse({ ok: true, content, usage: data?.usage || null });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();

  return true;
});
