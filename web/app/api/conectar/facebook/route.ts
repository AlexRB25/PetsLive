import { NextResponse } from "next/server";
import { signState } from "@/lib/oauth";
import { activeUser, fail, siteUrl } from "@/lib/server";

/** Inicia la conexión con Facebook para leer los directos de una página. */
export async function POST(req: Request) {
  if (!process.env.FB_APP_ID || !process.env.FB_APP_SECRET || !process.env.TOKENS_KEY) return fail("Facebook todavía no está configurado en el servidor.", 503);
  const user = await activeUser(req);
  if (user instanceof NextResponse) return user;
  const q = new URLSearchParams({
    client_id: process.env.FB_APP_ID,
    redirect_uri: `${siteUrl(req)}/api/conectar/facebook/callback`,
    state: signState(user.id, "facebook"),
    scope: "pages_show_list,pages_read_engagement,pages_read_user_content",
    response_type: "code",
  });
  return NextResponse.json({ url: `https://www.facebook.com/${process.env.FB_GRAPH_VERSION || "v23.0"}/dialog/oauth?${q}` });
}
