import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    insight:
      "Недостаточно данных для анализа. AI Insights будет доступен в следующих версиях BirTapCard.",
  });
}