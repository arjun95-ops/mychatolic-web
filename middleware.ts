import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    // 1. Initialize Response
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        request.cookies.set(name, value)
                    );
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // 2. Refresh Session (CRITICAL)
    // This call is required to refresh the auth cookie.
    // We do NOT act on the result (user null or not) in this Debug Mode.
    await supabase.auth.getUser();

    // 3. DEBUG MODE: PASS-THROUGH
    // All redirect logic is disabled to allow direct access.
    /*
    const {
      data: { user },
    } = await supabase.auth.getUser();
  
    if (request.nextUrl.pathname.startsWith("/dashboard")) {
      if (!user) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      const userRole = user.user_metadata?.role;
      if (userRole !== 'admin') {
         return NextResponse.redirect(new URL("/", request.url));
      }
    }
    */

    return response;
}

export const config = {
    matcher: [
        '/dashboard/:path*',
    ],
};
