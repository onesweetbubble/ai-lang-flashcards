document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = "Готово";
    setTimeout(() => { statusEl.style.display = "none"; }, 600);
  }

  const attachFallback = (img) => {
    img.addEventListener("error", () => {
      const alt = img.getAttribute("alt") || "placeholder";
      const seed = encodeURIComponent(alt.toLowerCase());
      img.onerror = null; // prevent loop
      img.src = `https://picsum.photos/seed/${seed}/600/400`;
    }, { once: true });
  };

  document.querySelectorAll("img").forEach(attachFallback);
});