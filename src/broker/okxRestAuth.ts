import { createHmac } from "node:crypto";

export type OkxRestCredentials = {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
};

export type OkxSignedRequestArgs = {
  creds: OkxRestCredentials;
  // RFC3339/ISO timestamp with milliseconds, e.g. 2020-12-08T09:08:57.715Z
  timestamp: string;
  method: "GET" | "POST" | "DELETE" | "PUT";
  requestPathWithQuery: string;
  body?: string;
};

export function signOkxRestRequest(args: OkxSignedRequestArgs): string {
  const body = args.body ?? "";
  const prehash = `${args.timestamp}${args.method}${args.requestPathWithQuery}${body}`;
  return createHmac("sha256", args.creds.apiSecret).update(prehash).digest("base64");
}

export function buildOkxRestAuthHeaders(args: OkxSignedRequestArgs): Record<string, string> {
  const sign = signOkxRestRequest(args);
  return {
    "OK-ACCESS-KEY": args.creds.apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": args.timestamp,
    "OK-ACCESS-PASSPHRASE": args.creds.passphrase,
    accept: "application/json",
  };
}
