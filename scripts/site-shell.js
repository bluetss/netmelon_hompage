// Same published image bindings; defer offscreen screenshots without a new user action.
(() => {
  const images = document.querySelectorAll('img[data-site-src]');
  const load = image => { image.src = image.dataset.siteSrc; image.removeAttribute('data-site-src'); };
  if (!('IntersectionObserver' in window)) { images.forEach(load); return; }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { load(entry.target); observer.unobserve(entry.target); }
  }, {rootMargin:'160px'});
  images.forEach(image => observer.observe(image));
})();

(() => {
  const header = document.querySelector(".site-header");
  const menuToggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  const downloadToggle = document.querySelector(".download-toggle");
  const downloadDropdown = document.querySelector(".download-dropdown");
  if (!header || !menuToggle || !nav) return;

  const closeMenu = () => {
    header.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
  };

  const closeDownloadMenu = () => {
    header.classList.remove("download-open");
    if (downloadToggle) downloadToggle.setAttribute("aria-expanded", "false");
  };

  const closeAllMenus = () => {
    closeMenu();
    closeDownloadMenu();
  };

  menuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !header.classList.contains("menu-open");
    closeDownloadMenu();
    header.classList.toggle("menu-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  if (downloadToggle) {
    downloadToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = !header.classList.contains("download-open");
      closeMenu();
      header.classList.toggle("download-open", isOpen);
      downloadToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeAllMenus);
  });

  if (downloadDropdown) {
    downloadDropdown.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeDownloadMenu);
    });
  }

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest('.web-theme-dialog')) return;
    if (!header.contains(event.target)) closeAllMenus();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 920) closeAllMenus();
  });

  document.addEventListener("keydown", (event) => {
    if (document.querySelector('.web-theme-dialog[open]')) return;
    if (event.key === "Escape") closeAllMenus();
  });
})();
