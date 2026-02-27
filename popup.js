const DEFAULT_SETTINGS = {
  enabled: true,
  targetLang: "it",
  displayMode: "both",
  hideNative: true,
  fontSize: 32,
  position: null
};

const enabledInput = document.getElementById("enabled");
const hideNativeInput = document.getElementById("hideNative");
const targetLangSelect = document.getElementById("targetLang");
const modeInputs = Array.from(document.querySelectorAll('input[name="displayMode"]'));
const fontSizeInput = document.getElementById("fontSize");
const fontSizeValue = document.getElementById("fontSizeValue");
const resetPositionButton = document.getElementById("resetPosition");

init().catch((error) => {
  console.error("[Subtitle Translator] Popup init error", error);
});

async function init() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);

  enabledInput.checked = Boolean(settings.enabled);
  hideNativeInput.checked = settings.hideNative == null ? DEFAULT_SETTINGS.hideNative : Boolean(settings.hideNative);
  targetLangSelect.value = settings.targetLang || DEFAULT_SETTINGS.targetLang;

  const modeValue = settings.displayMode || DEFAULT_SETTINGS.displayMode;
  for (const input of modeInputs) {
    input.checked = input.value === modeValue;
  }

  fontSizeInput.value = String(Number(settings.fontSize) || DEFAULT_SETTINGS.fontSize);
  updateFontLabel();

  enabledInput.addEventListener("change", persist);
  hideNativeInput.addEventListener("change", persist);
  targetLangSelect.addEventListener("change", persist);
  fontSizeInput.addEventListener("input", onFontInput);
  fontSizeInput.addEventListener("change", persist);

  for (const input of modeInputs) {
    input.addEventListener("change", persist);
  }

  resetPositionButton.addEventListener("click", resetPosition);
}

async function persist() {
  const displayMode = modeInputs.find((input) => input.checked)?.value || DEFAULT_SETTINGS.displayMode;
  const fontSize = clamp(Number(fontSizeInput.value), 16, 72);

  await chrome.storage.sync.set({
    enabled: enabledInput.checked,
    hideNative: hideNativeInput.checked,
    targetLang: targetLangSelect.value,
    displayMode,
    fontSize
  });
}

function onFontInput() {
  updateFontLabel();
}

function updateFontLabel() {
  fontSizeValue.textContent = `${fontSizeInput.value} px`;
}

async function resetPosition() {
  await chrome.storage.sync.set({ position: null });
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
