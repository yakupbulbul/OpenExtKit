const badge = document.createElement("aside");
badge.textContent = "OpenExtKit content script active";
badge.style.position = "fixed";
badge.style.right = "12px";
badge.style.bottom = "12px";
badge.style.zIndex = "2147483647";
badge.style.padding = "8px 10px";
badge.style.border = "1px solid #0284c7";
badge.style.background = "#f0f9ff";
badge.style.color = "#0f172a";
badge.style.font = "12px system-ui, sans-serif";

document.documentElement.append(badge);
