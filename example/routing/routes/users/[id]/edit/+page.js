export default function Page({ params }) {
  const { id } = params;
  console.log(`Editing ${id}`);
  document.getElementById("editId").innerText = id;
}