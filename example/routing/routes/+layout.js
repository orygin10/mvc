export default function Layout() {
  let span = document.getElementById("cnt");
  let cnt = 0;
  setInterval(() => {
    cnt++;
    span.textContent = cnt;
  }, 1000);
}