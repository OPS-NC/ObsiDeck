export const THEME_KEY = "obsideck:theme";

/** Inline script run before first paint to apply the theme without a flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}var r=document.documentElement;if(t==="dark")r.classList.add("dark");r.style.colorScheme=t}catch(e){}})();`;
