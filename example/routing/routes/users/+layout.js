export default function Layout() {
  let span = document.getElementById("cntUsers");
  let cnt = 0;
  setInterval(() => {
    cnt++;
    span.textContent = cnt;
  }, 1000);
}