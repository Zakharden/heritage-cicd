export function formatPayload(payload) {
  return JSON.stringify(payload, null, 2);
}

export async function fetchHello(fetchImpl = fetch) {
  const response = await fetchImpl("/api/hello", {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}
