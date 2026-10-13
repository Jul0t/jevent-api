export function generateRandomToken(
  byteLength = 32
) {
  const bytes = crypto.getRandomValues(
    new Uint8Array(byteLength)
  );

  return [...bytes]
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}

export async function sha256(value) {
  const encoded = new TextEncoder().encode(value);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoded
  );

  return [...new Uint8Array(digest)]
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}

export async function hashSecret(secret, pepper) {
  return sha256(`${secret}:${pepper}`);
}

export function safeEqual(first, second) {
  if (
    typeof first !== "string" ||
    typeof second !== "string" ||
    first.length !== second.length
  ) {
    return false;
  }

  let difference = 0;

  for (
    let index = 0;
    index < first.length;
    index++
  ) {
    difference |=
      first.charCodeAt(index) ^
      second.charCodeAt(index);
  }

  return difference === 0;
}