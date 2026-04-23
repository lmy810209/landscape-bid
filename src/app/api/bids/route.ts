import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RESULT_STATUSES, type BidInput } from "@/types/bid";

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .order("bid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<BidInput>;

  const required: (keyof BidInput)[] = [
    "notice_no",
    "notice_title",
    "agency",
    "work_type",
    "base_amount",
    "result_status",
  ];
  for (const key of required) {
    const v = body[key];
    if (v == null || v === "") {
      return NextResponse.json({ error: `필수 항목 누락: ${key}` }, { status: 400 });
    }
  }
  if (!RESULT_STATUSES.includes(body.result_status as never)) {
    return NextResponse.json(
      { error: `result_status 값이 올바르지 않습니다.` },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const { data, error } = await supabase.from("bids").insert(body).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
