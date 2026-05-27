import {
  randomBytes,
  publicEncrypt,
  privateDecrypt,
  createCipheriv,
  createDecipheriv,
  constants,
} from "crypto";

export function encryptForNetopia(
  xml: string,
  publicCertPem: string
): { envKey: string; data: string; iv: string } {
  const aesKey = randomBytes(32);
  const iv = randomBytes(16);

  const cipher = createCipheriv("aes-256-cbc", aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(xml, "utf8"), cipher.final()]);

  const encryptedKey = publicEncrypt(
    { key: publicCertPem, padding: constants.RSA_PKCS1_PADDING },
    aesKey
  );

  return {
    envKey: encryptedKey.toString("base64"),
    data: encrypted.toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptFromNetopia(
  envKey: string,
  data: string,
  iv: string,
  privateKeyPem: string
): string {
  const aesKey = privateDecrypt(
    { key: privateKeyPem, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(envKey, "base64")
  );

  const ivBuffer = Buffer.from(iv, "base64");
  const decipher = createDecipheriv("aes-256-cbc", aesKey, ivBuffer);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatTimestamp(date: Date): string {
  return (
    date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0") +
    String(date.getHours()).padStart(2, "0") +
    String(date.getMinutes()).padStart(2, "0") +
    String(date.getSeconds()).padStart(2, "0")
  );
}

export function buildPaymentXml(params: {
  orderId: string;
  posSignature: string;
  amount: number;
  currency: string;
  description: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  confirmUrl: string;
  returnUrl: string;
}): string {
  const timestamp = formatTimestamp(new Date());
  const amount = params.amount.toFixed(2);

  return `<?xml version="1.0" encoding="utf-8"?>
<order type="card" id="${escapeXml(params.orderId)}" timestamp="${timestamp}">
  <signature>${escapeXml(params.posSignature)}</signature>
  <invoice currency="${escapeXml(params.currency)}" amount="${amount}">
    <details>${escapeXml(params.description)}</details>
    <contact_info>
      <billing type="person">
        <first_name>${escapeXml(params.firstName)}</first_name>
        <last_name>${escapeXml(params.lastName)}</last_name>
        <email>${escapeXml(params.email)}</email>
        <address>${escapeXml(params.address)}</address>
        <mobile_phone>${escapeXml(params.phone)}</mobile_phone>
      </billing>
    </contact_info>
  </invoice>
  <ipn_cipher>aes-256-cbc</ipn_cipher>
  <url>
    <confirm>${escapeXml(params.confirmUrl)}</confirm>
    <return>${escapeXml(params.returnUrl)}</return>
  </url>
</order>`;
}

export function parseIpnXml(xml: string): {
  orderId: string;
  crc: string;
  action: string;
  errorCode: string;
} {
  const orderIdMatch = xml.match(/<order[^>]+id="([^"]+)"/);
  const crcMatch = xml.match(/<mobilpay[^>]+crc="([^"]+)"/);
  const actionMatch = xml.match(/<action>([^<]+)<\/action>/);
  const errorCodeMatch = xml.match(/<error\s+code="([^"]+)"/);

  return {
    orderId: orderIdMatch?.[1] ?? "",
    crc: crcMatch?.[1] ?? "",
    action: actionMatch?.[1]?.trim() ?? "",
    errorCode: errorCodeMatch?.[1] ?? "99",
  };
}

export type NetopiaConfig = {
  enabled: boolean;
  sandbox: boolean;
  pos_signature: string;
  title: string;
  live_public_key: string;
  live_private_key: string;
  sandbox_public_key: string;
  sandbox_private_key: string;
};

export const NETOPIA_SANDBOX_URL = "https://sandboxsecure.mobilpay.ro";
export const NETOPIA_PRODUCTION_URL = "https://secure.mobilpay.ro";
