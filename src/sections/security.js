/*
  Section 5 — Security & trust: entrance reveals only.
  Each [data-reveal] block fades up once when it enters the viewport (no scroll scrubbing,
  nothing continuous). Without IntersectionObserver everything is simply shown.
*/
(function () {
  "use strict";
  var section = document.getElementById("security");
  if (!section || !("IntersectionObserver" in window)) return;

  document.documentElement.classList.add("sec-js");
  var items = section.querySelectorAll("[data-reveal]");
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.15 });
  for (var i = 0; i < items.length; i++) io.observe(items[i]);
})();
