// Client-side temp password generator. Used when an admin creates another user:
// the password is shown once (copy), and the user changes it after first login.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";

export function generatePassword(length = 16): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let out = "";
  for (const n of values) out += ALPHABET[n % ALPHABET.length];
  return out;
}
