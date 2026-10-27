import { NextResponse } from "next/server";
import { signState } from "@/lib/oauth";
import { authUser, fail, siteUrl } from "@/lib/server";

/** Inicia la conexión con Facebook para leer los directos de una página. */
export async function POST(req: Request) {
  if (!process.env.FB_APP_ID || !process.env.FB_APP_SECRET || !process.env.TOKENS_KEY) return fail("Facebook todavía no está configurado en el servidor.", 503);
  const user = await authUser(req);
  if (!user) return fail("Entra con tu cuenta.", 401);
  const q = new URLSearchParams({
    client_id: process.env.FB_APP_ID,
    redirect_uri: `${siteUrl(req)}/api/conectar/facebook/callback`,
    state: signState(user.id, "facebook"),
    scope: "pages_show_list,pages_read_engagement,pages_read_user_content",
    response_type: "code",
  });
  return NextResponse.json({ url: `https://www.facebook.com/${process.env.FB_GRAPH_VERSION || "v23.0"}/dialog/oauth?${q}` });
}
