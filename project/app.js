const DATASET = [
  { id: "apple", name: "яблоко", alt: "Apple", src: "images/apple.jpg", synonyms: ["яблочко", "apple"], lang: "ru-RU" },
  { id: "dog",   name: "собака", alt: "Dog",   src: "images/dog.jpg",   synonyms: ["пёс", "пес", "собачка", "dog"], lang: "ru-RU" },
  { id: "car",   name: "машина", alt: "Car",   src: "images/car.jpg",   synonyms: ["автомобиль", "тачка", "car"], lang: "ru-RU" },
  { id: "book",  name: "книга",  alt: "Book",  src: "images/book.jpg",  synonyms: ["книжка", "book"], lang: "ru-RU" },
  { id: "cat",   name: "кошка",  alt: "Cat",   src: "images/cat.jpg",   synonyms: ["кот", "киска", "котик", "cat"], lang: "ru-RU" },
];

const normalize = (s) => (s || "").toString().trim().toLowerCase()
  .replace(/[ё]/g, "е")
  .replace(/\s+/g, " ");

function pickUnique(array, n) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function createTone(ctx, { freq = 660, durationMs = 220, type = "sine", volume = 0.08 }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain).connect(ctx.destination);
  return { osc, gain, durationMs };
}

function makePositiveSound(ctx) {
  const now = ctx.currentTime;
  const steps = [523.25, 659.25, 783.99];
  steps.forEach((f, i) => {
    const { osc, gain, durationMs } = createTone(ctx, { freq: f, durationMs: 140, volume: 0.06, type: "sine" });
    const t0 = now + i * 0.08;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.07, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000);
  });
}

function makeNegativeSound(ctx) {
  const now = ctx.currentTime;
  const { osc, gain } = createTone(ctx, { freq: 220, durationMs: 160, volume: 0.06, type: "square" });
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.start(now);
  osc.frequency.exponentialRampToValueAtTime(150, now + 0.16);
  osc.stop(now + 0.17);
}

function supportsSpeechRecognition() {
  const w = window;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) ? true : false;
}

function createRecognizer(lang) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang || "ru-RU";
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  return rec;
}

class CardGame {
  constructor(options) {
    this.images = options.images;
    this.answerInput = options.answerInput;
    this.feedback = options.feedback;
    this.progress = options.progress;
    this.cardImage = options.cardImage;
    this.historyCorrect = options.historyCorrect;
    this.historyWrong = options.historyWrong;
    this.historyReview = options.historyReview;
    this.countCorrectEl = options.countCorrectEl;
    this.countWrongEl = options.countWrongEl;
    this.countReviewEl = options.countReviewEl;
    this.micButton = options.micButton;
    this.checkButton = options.checkButton;
    this.sizeSlider = options.sizeSlider;
    this.sizeValue = options.sizeValue;
    this.restartButton = options.restartButton;

    this.modal = {
      root: document.getElementById("result-modal"),
      star: document.getElementById("result-star"),
      total: document.getElementById("res-total"),
      correct: document.getElementById("res-correct"),
      review: document.getElementById("res-review"),
      accuracy: document.getElementById("res-accuracy"),
      btnAgain: document.getElementById("btn-again"),
      btnClose: document.getElementById("btn-close"),
    };

    this.audioCtx = null;
    this.queue = [];
    this.current = null;
    this.correct = [];
    this.wrong = [];
    this.review = [];

    this.init();
  }

  init() {
    this.images.forEach(item => {
      const img = new Image();
      img.src = item.src;
      img.onerror = () => { img.src = `https://picsum.photos/seed/${item.id}/600/400`; };
    });

    this.sizeSlider.addEventListener("input", () => {
      this.sizeValue.textContent = this.sizeSlider.value;
    });

    this.restartButton.addEventListener("click", () => this.restart());
    this.modal.btnAgain.addEventListener("click", () => { this.hideModal(); this.restart(); });
    this.modal.btnClose.addEventListener("click", () => this.hideModal());

    this.checkButton.addEventListener("click", () => this.checkAnswer());
    this.answerInput.addEventListener("keydown", (e) => { if (e.key === "Enter") this.checkAnswer(); });

    if (supportsSpeechRecognition()) {
      this.micButton.addEventListener("click", () => this.speechToText());
    } else {
      this.micButton.disabled = true;
      this.micButton.title = "Браузер не поддерживает распознавание речи";
    }

    this.restart();
  }

  ensureAudioCtx() {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return this.audioCtx;
  }

  restart() {
    const n = Number(this.sizeSlider.value);
    this.queue = pickUnique(DATASET, n);
    this.correct = [];
    this.wrong = [];
    this.review = [];
    this.updateHistory();
    this.nextCard();
  }

  nextCard() {
    // When cycle is complete (correct + review reaches target), show modal
    const totalTarget = Number(this.sizeSlider.value);
    if (this.correct.length + this.review.length >= totalTarget) {
      this.finishCycle();
      return;
    }

    let pool = this.queue.slice();
    if (this.wrong.length > 0 && Math.random() < 0.5) {
      const wrongIds = new Set(this.wrong.map(x => x.id));
      const wrongPool = DATASET.filter(x => wrongIds.has(x.id));
      pool = pool.concat(wrongPool);
    }

    if (pool.length === 0) {
      // If no queue left but we still haven't reached target, allow repeating wrongs
      if (this.wrong.length > 0) {
        const wrongIds = new Set(this.wrong.map(x => x.id));
        pool = DATASET.filter(x => wrongIds.has(x.id));
      } else {
        this.finishCycle();
        return;
      }
    }

    const next = pool[Math.floor(Math.random() * pool.length)];
    this.current = next;
    this.cardImage.src = next.src;
    this.cardImage.alt = next.alt;
    this.answerInput.value = "";
    this.answerInput.focus();
    this.updateProgress();
  }

  updateProgress() {
    const total = Number(this.sizeSlider.value);
    const solved = this.correct.length + this.review.length; // progress is correct+review
    const remaining = Math.max(total - solved, 0);
    this.progress.textContent = `Осталось: ${remaining} • Верно: ${this.correct.length} • Повторение: ${this.review.length} • Неверно: ${this.wrong.length}`;
  }

  updateHistory() {
    this.countCorrectEl.textContent = this.correct.length.toString();
    this.countWrongEl.textContent = this.wrong.length.toString();
    this.countReviewEl.textContent = this.review.length.toString();

    const renderList = (ul, items, cls) => {
      ul.innerHTML = "";
      items.forEach(item => {
        const li = document.createElement("li");
        li.className = cls;
        li.textContent = item.name;
        ul.appendChild(li);
      });
    };

    renderList(this.historyCorrect, this.correct, "ok");
    renderList(this.historyWrong, this.wrong, "err");
    renderList(this.historyReview, this.review, "ok");
  }

  isMatch(input, item) {
    const normalized = normalize(input);
    if (!normalized) return false;
    const names = [item.name, ...(item.synonyms || [])].map(normalize);
    return names.includes(normalized);
  }

  markResult(isOk) {
    const ctx = this.ensureAudioCtx();
    if (isOk) makePositiveSound(ctx); else makeNegativeSound(ctx);

    // On correct: if it was previously wrong, move it to review, else to correct
    const wasWrong = !!this.wrong.find(x => x.id === this.current.id);

    if (isOk) {
      if (wasWrong) {
        this.wrong = this.wrong.filter(x => x.id !== this.current.id);
        if (!this.review.find(x => x.id === this.current.id)) this.review.push(this.current);
      } else {
        if (!this.correct.find(x => x.id === this.current.id)) this.correct.push(this.current);
      }
      // remove from initial queue
      this.queue = this.queue.filter(x => x.id !== this.current.id);
    } else {
      if (!this.wrong.find(x => x.id === this.current.id)) this.wrong.push(this.current);
    }

    this.updateHistory();
    this.updateProgress();
  }

  checkAnswer() {
    if (!this.current) return;
    const value = this.answerInput.value;
    const isOk = this.isMatch(value, this.current);
    this.feedback.className = `feedback ${isOk ? "ok" : "err"}`;
    this.feedback.textContent = isOk ? "Верно!" : `Неверно. Правильно: ${this.current.name}`;

    this.markResult(isOk);
    setTimeout(() => this.nextCard(), 600);
  }

  speechToText() {
    const lang = (this.current && this.current.lang) ? this.current.lang : "ru-RU";
    const rec = createRecognizer(lang);
    if (!rec) return;

    this.micButton.disabled = true;
    this.micButton.textContent = "…";

    rec.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0]?.transcript || "").join(" ");
      this.answerInput.value = text;
      this.micButton.textContent = "🎤";
      this.micButton.disabled = false;
    };
    rec.onerror = () => { this.micButton.textContent = "🎤"; this.micButton.disabled = false; };
    rec.onend = () => { this.micButton.textContent = "🎤"; this.micButton.disabled = false; };

    try { rec.start(); } catch (_) { /* ignore */ }
  }

  finishCycle() {
    const total = Number(this.sizeSlider.value);
    const correct = this.correct.length;
    const review = this.review.length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Configure star class by accuracy: ok >= 80, mid >= 50, else bad
    const starClass = accuracy >= 80 ? "ok" : (accuracy >= 50 ? "mid" : "bad");
    this.modal.star.className = `star ${starClass}`;
    this.modal.star.style.setProperty("--fill-scale", String(Math.max(0, Math.min(100, accuracy)) / 100));

    this.modal.total.textContent = String(total);
    this.modal.correct.textContent = String(correct);
    this.modal.review.textContent = String(review);
    this.modal.accuracy.textContent = `${accuracy}%`;

    this.showModal();
  }

  showModal() { this.modal.root.classList.remove("hidden"); }
  hideModal() { this.modal.root.classList.add("hidden"); }
}

function boot() {
  const statusEl = document.getElementById("status");
  if (statusEl) { statusEl.style.display = "none"; }

  const game = new CardGame({
    images: DATASET,
    answerInput: document.getElementById("answer-input"),
    feedback: document.getElementById("feedback"),
    progress: document.getElementById("progress"),
    cardImage: document.getElementById("card-image"),
    historyCorrect: document.getElementById("history-correct"),
    historyWrong: document.getElementById("history-wrong"),
    historyReview: document.getElementById("history-review"),
    countCorrectEl: document.getElementById("count-correct"),
    countWrongEl: document.getElementById("count-wrong"),
    countReviewEl: document.getElementById("count-review"),
    micButton: document.getElementById("btn-mic"),
    checkButton: document.getElementById("btn-check"),
    sizeSlider: document.getElementById("cycle-size"),
    sizeValue: document.getElementById("cycle-size-value"),
    restartButton: document.getElementById("btn-restart"),
  });

  window.__cardGame = game;
}

document.addEventListener("DOMContentLoaded", boot);