import { failV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";

export const runtime = "nodejs";

function gone() {
  return failV1("NOT_FOUND", "notification-config API 已下线，请改用 /api/daa/store/system-config", { status: 410 });
}

export async function GET() {
  return withApiHandlerV1(async () => gone());
}

export async function POST() {
  return withApiHandlerV1(async () => gone());
}
