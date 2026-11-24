/** Film time stays authoritative when a file is silent, short, or unreadable. */
export function createSoundtrack(getPlayback) {
  const audio = document.getElementById("soundtrack");
  const selector = document.getElementById("audio-file");
  const choose = document.getElementById("choose-audio");
  const sound = document.getElementById("sound");
  const status = document.getElementById("audio-status");
  let localURL = "";
  let notificationTimer;

  function report(message) {
    clearTimeout(notificationTimer);
    status.textContent = message;
    notificationTimer = setTimeout(() => { status.textContent = ""; }, 3600);
  }

  function updateButtons() {
    const hasTrack = audio.hasAttribute("src");
    const label = hasTrack ? (audio.muted ? "开启声音" : "关闭声音") : "先选配乐";
    choose.textContent = hasTrack ? "换配乐" : "选配乐";
    sound.disabled = !hasTrack;
    sound.title = label;
    sound.setAttribute("aria-label", label);
    sound.setAttribute("aria-pressed", String(hasTrack && !audio.muted));
    sound.classList.toggle("off", !hasTrack || audio.muted);
  }

  function sync(seconds, shouldPlay) {
    if (!audio.hasAttribute("src")) return;
    const knownLength = Number.isFinite(audio.duration);
    const position = Math.max(0, knownLength ? Math.min(seconds, audio.duration) : seconds);
    if (audio.readyState >= 1 && Math.abs(audio.currentTime - position) > 0.15) audio.currentTime = position;
    if (shouldPlay && !audio.muted && (!knownLength || seconds < audio.duration)) {
      const pending = audio.play();
      if (pending) pending.catch(error => {
        if (error.name === "NotAllowedError") {
          audio.muted = true;
          updateButtons();
          report("点声音按钮开启配乐");
        }
      });
    } else {
      audio.pause();
    }
  }

  function syncToFilm() {
    const { time, playing, mode } = getPlayback();
    sync(time, playing && mode === "film");
  }

  choose.addEventListener("click", () => selector.click());
  selector.addEventListener("change", () => {
    const file = selector.files[0];
    if (!file) return;
    audio.pause();
    if (localURL) URL.revokeObjectURL(localURL);
    localURL = URL.createObjectURL(file);
    audio.src = localURL;
    audio.muted = false;
    selector.value = "";
    updateButtons();
    report("已选配乐 · " + file.name);
    syncToFilm();
  });
  audio.addEventListener("loadedmetadata", syncToFilm);
  audio.addEventListener("error", () => {
    audio.removeAttribute("src");
    audio.load();
    if (localURL) URL.revokeObjectURL(localURL);
    localURL = "";
    updateButtons();
    report("浏览器无法读取这段音频，可以换一首");
  });
  sound.addEventListener("click", () => {
    audio.muted = !audio.muted;
    updateButtons();
    syncToFilm();
  });
  updateButtons();
  return { sync };
}
