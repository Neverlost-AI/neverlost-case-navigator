import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    {
      error:
        "OpenAI packet drafting is experimental and disabled in the accepted demo runtime.",
    },
    { status: 410 },
  );
}
