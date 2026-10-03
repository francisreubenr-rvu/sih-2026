// Progressive enhancement of the labelled synthetic illustration. No network calls.
const toggle = document.querySelector(".sample-toggle");
const sampleStatus = document.getElementById("sample-status");

if (toggle && sampleStatus) {
  toggle.hidden = false;
  toggle.addEventListener("click", () => {
    const showDetails = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(showDetails));
    toggle.textContent = showDetails
      ? "Replace with tokens"
      : "Show sample details";
    document.querySelectorAll(".sample-value").forEach((value) => {
      value.textContent = showDetails
        ? value.dataset.sample
        : value.dataset.token;
      value.classList.toggle("is-sample", showDetails);
    });
    sampleStatus.textContent = showDetails
      ? "Synthetic sample details"
      : "Detected values replaced";
  });
}

// Close the native mobile menu after an anchor is chosen. Links also work without JS.
const menu = document.querySelector(".mobile-menu");
menu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menu.open = false;
  });
});
