const TRANSLATE_ENDPOINTS = [
  "https://translate.googleapis.com/translate_a/single",
  "https://clients5.google.com/translate_a/single"
];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TRANSLATE_TEXT") {
    return;
  }

  translate(message.text, message.targetLang)
    .then((translatedText) => sendResponse({ ok: true, translatedText }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});

async function translate(text, targetLang) {
  if (!text || !targetLang) {
    throw new Error("Missing text or targetLang");
  }

  const params = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: targetLang,
    dt: "t",
    q: text
  });

  let lastError = "Translation unavailable";

  for (const endpoint of TRANSLATE_ENDPOINTS) {
    try {
      const translated = await requestEndpoint(endpoint, params);
      if (translated) {
        return translated;
      }
    } catch (error) {
      lastError = String(error);
    }
  }

  throw new Error(lastError);
}

async function requestEndpoint(endpoint, params) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(`${endpoint}?${params.toString()}`, {
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    throw new Error(`Translation request failed (${endpoint}): ${response.status}`);
  }

  const raw = await response.text();
  const data = JSON.parse(raw);
  const chunks = data?.[0];
  if (!Array.isArray(chunks)) {
    throw new Error("Unexpected translation response format");
  }

  return chunks.map((chunk) => chunk?.[0] || "").join("").trim();
}
