const url = new URLSearchParams(location.search).get("url");
if (url && /^https?:\/\//i.test(url)) document.getElementById("site").src = url;
