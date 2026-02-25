import "./styles.css";
import { fetchHello, formatPayload } from "./api.js";

const loadButton = document.getElementById("load");
const result = document.getElementById("result");

export async function loadHello(fetchImpl = fetch) {
  if (!result) {
    return;
  }

  result.textContent = "Загрузка...";

  try {
    const payload = await fetchHello(fetchImpl);
    result.textContent = formatPayload(payload);
  } catch (error) {
    result.textContent = `Ошибка: ${error.message}`;
  }
}

if (loadButton) {
  loadButton.addEventListener("click", () => {
    void loadHello();
  });
}
