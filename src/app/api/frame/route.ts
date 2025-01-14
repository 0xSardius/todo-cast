// app/api/frame/route.ts
import { getFrameMessage } from "@coinbase/onchainkit/frame";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json();
  const { isValid, message } = await getFrameMessage(body);

  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid frame message" },
      { status: 400 }
    );
  }

  try {
    // Initial state or refresh
    if (!message.button) {
      return NextResponse.json({
        frames: [
          {
            version: "vNext",
            image: `${process.env.NEXT_PUBLIC_HOST}/api/images/frame?fid=${message.interactor.fid}`,
            buttons: [{ label: "+ New Todo" }, { label: "📋 My List" }],
            input: {
              text: "What needs to be done?",
            },
          },
        ],
      });
    }

    const fid = message.interactor.fid;

    // Ensure user exists
    const { data: user } = await supabase
      .from("users")
      .select()
      .eq("fid", fid)
      .single();

    if (!user) {
      await supabase.from("users").insert({ fid });
    }

    switch (message.button) {
      case "+ New Todo": {
        if (!message.input?.trim()) {
          return NextResponse.json({
            frames: [
              {
                version: "vNext",
                image: `${process.env.NEXT_PUBLIC_HOST}/api/images/frame?fid=${fid}&error=empty`,
                buttons: [{ label: "+ Try Again" }, { label: "📋 My List" }],
                input: {
                  text: "Todo text required!",
                },
              },
            ],
          });
        }

        // Add todo
        await supabase.from("todos").insert({
          user_fid: fid,
          text: message.input.trim(),
          priority: 4,
        });

        return NextResponse.json({
          frames: [
            {
              version: "vNext",
              image: `${process.env.NEXT_PUBLIC_HOST}/api/images/frame?fid=${fid}&added=true`,
              buttons: [{ label: "+ Another" }, { label: "📋 My List" }],
            },
          ],
        });
      }

      case "📋 My List": {
        const { data: todos } = await supabase
          .from("todos")
          .select()
          .eq("user_fid", fid)
          .eq("completed", false)
          .order("created_at", { ascending: false })
          .limit(5);

        return NextResponse.json({
          frames: [
            {
              version: "vNext",
              image: `${process.env.NEXT_PUBLIC_HOST}/api/images/frame?fid=${fid}&list=true`,
              buttons: [
                { label: "✅ Complete" },
                { label: "+ New" },
                { label: "🔄 Refresh" },
              ],
            },
          ],
        });
      }

      case "✅ Complete": {
        const todoId = message.state?.selectedTodo;

        // Complete the todo
        await supabase
          .from("todos")
          .update({
            completed: true,
            completed_at: new Date().toISOString(),
          })
          .eq("id", todoId)
          .eq("user_fid", fid);

        // Get user's wallet address
        const { data: user } = await supabase
          .from("users")
          .select("wallet_address")
          .eq("fid", fid)
          .single();

        // Award points if user has connected wallet
        if (user?.wallet_address) {
          try {
            // Call our points contract
            await fetch("/api/points/award", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: user.wallet_address,
                todoId,
              }),
            });
          } catch (error) {
            console.error("Error awarding points:", error);
            // Continue even if points fail
          }
        }

        // Get current streak
        const { data: streakData } = await supabase
          .from("users")
          .select("streak_count")
          .eq("fid", fid)
          .single();

        const streak = streakData?.streak_count || 0;

        return NextResponse.json({
          frames: [
            {
              version: "vNext",
              image: `${process.env.NEXT_PUBLIC_HOST}/api/images/frame?fid=${fid}&completed=true&streak=${streak}`,
              buttons: [
                { label: "📋 My List" },
                { label: "+ New" },
                { label: `🏆 ${streak} Day Streak` },
              ],
            },
          ],
        });
      }

      default:
        return NextResponse.json({
          frames: [
            {
              version: "vNext",
              image: `${process.env.NEXT_PUBLIC_HOST}/api/images/frame?fid=${fid}`,
              buttons: [{ label: "+ New Todo" }, { label: "📋 My List" }],
              input: {
                text: "What needs to be done?",
              },
            },
          ],
        });
    }
  } catch (error) {
    console.error("Error in frame handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
