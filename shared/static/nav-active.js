// Adds .active to the module-nav tab matching data-active-module on <body>.
(function () {
  var module = document.body.dataset.activeModule;
  if (!module) return;
  var tab = document.querySelector('.module-nav__tab[data-module="' + module + '"]');
  if (tab) {
    tab.classList.add('active');
    tab.setAttribute('aria-current', 'page');
  }
})();
