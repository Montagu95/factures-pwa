// public/speed-insights.js
// Initialisation manuelle de Vercel Speed Insights pour site statique
// (sans framework, sans build) — reproduit à l'identique la mise à jour
// faite directement sur le dépôt de production le 12/09/2026.

window.si = window.si || function () {
  (window.siq = window.siq || []).push(arguments);
};

(function () {
  var script = document.createElement('script');
  script.src = '/_vercel/speed-insights/script.js';
  script.defer = true;
  script.dataset.sdkn = '@vercel/speed-insights';
  script.dataset.sdkv = '2.0.0';
  document.head.appendChild(script);
})();
