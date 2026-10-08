import { publicJwks } from "@/lib/oidc";

export async function GET() {
  return Response.json(await publicJwks());
}
