import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BidInput } from "@/types/bid";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PUT(req: Request, { params }: Params) {
  const body = (await req.json()) as Partial<BidInput>;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .update(body)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const supabase = createClient();
  const { error } = await supabase.from("bids").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
