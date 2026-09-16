(function () {
  "use strict";

  const listView = document.getElementById("list-view");
  const detailViews = Array.from(document.querySelectorAll("[data-english-job-detail]"));
  if (!listView || !detailViews.length) return;

  const renderRoute = () => {
    const jobId = new URLSearchParams(window.location.search).get("job_id");
    const selected = detailViews.find((view) => view.dataset.englishJobDetail === jobId);
    listView.hidden = Boolean(selected);
    detailViews.forEach((view) => {
      view.hidden = view !== selected;
    });
    if (jobId && !selected) {
      window.history.replaceState(null, "", "careers.html");
      listView.hidden = false;
    }
    if (selected) {
      selected.querySelector("h1")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  window.addEventListener("popstate", renderRoute);
  renderRoute();
})();
