// Vercel Speed Insights initialization
// This initializes the queue for Speed Insights events
window.si = window.si || function () {
  (window.siq = window.siq || []).push(arguments);
};

// Load the Speed Insights script
(function() {
  var script = document.createElement('script');
  script.src = '/_vercel/speed-insights/script.js';
  script.defer = true;
  script.setAttribute('data-sdkn', '@vercel/speed-insights');
  script.setAttribute('data-sdkv', '2.0.0');
  document.head.appendChild(script);
})();
