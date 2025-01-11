"use client";

import { useEffect, useCallback, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import sdk, {
  // AddFrame,
  FrameNotificationDetails,
  type Context,
} from "@farcaster/frame-sdk";
import {
  useAccount,
  useConnect,
  useWriteContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Button } from "~/components/ui/Button";
import { useSession } from "next-auth/react";
import { base } from "wagmi/chains";

// Points contract ABI (simplified)
const POINTS_ABI = [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "awardPoints",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

export default function TodoCast({ title = "Todo-Cast" }: { title?: string }) {
  // Frame SDK state
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.FrameContext>();
  const [added, setAdded] = useState(false);
  const [notificationDetails, setNotificationDetails] =
    useState<FrameNotificationDetails | null>(null);

  // Auth state
  const { data: session } = useSession();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();

  // Points contract interaction
  const { data: simulateData } = useSimulateContract({
    address: process.env.NEXT_PUBLIC_POINTS_CONTRACT as `0x${string}`,
    abi: POINTS_ABI,
    functionName: "awardPoints",
    args: address ? [address] : undefined,
  });

  const { writeContract: awardPoints, data: hash } = useWriteContract();

  const { isLoading: isPending } = useWaitForTransactionReceipt({
    hash,
  });

  // Load Frame SDK
  useEffect(() => {
    const load = async () => {
      const context = await sdk.context;
      setContext(context);
      setAdded(context.client.added);

      // Frame event handlers
      sdk.on("frameAdded", ({ notificationDetails }) => {
        setAdded(true);
        if (notificationDetails) {
          setNotificationDetails(notificationDetails);
        }
      });

      sdk.on("frameRemoved", () => {
        setAdded(false);
        setNotificationDetails(null);
      });

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        setNotificationDetails(notificationDetails);
      });

      sdk.on("notificationsDisabled", () => {
        setNotificationDetails(null);
      });

      sdk.actions.ready({});
    };

    if (sdk && !isSDKLoaded) {
      setIsSDKLoaded(true);
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded]);

  // Handle todo completion
  const handleTodoComplete = useCallback(
    async (todoId: string) => {
      if (!address || !simulateData?.request) return;

      try {
        // Update todo in Supabase
        await fetch("/api/todos/complete", {
          method: "POST",
          body: JSON.stringify({ todoId }),
        });

        // Award points on Base
        await awardPoints(simulateData.request);

        // Send notification if enabled
        if (notificationDetails) {
          await fetch("/api/send-notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fid: context?.user.fid,
              notificationDetails,
              type: "TODO_COMPLETE",
              todoId,
            }),
          });
        }
      } catch (error) {
        console.error("Error completing todo:", error);
      }
    },
    [
      address,
      awardPoints,
      simulateData?.request,
      context?.user.fid,
      notificationDetails,
    ]
  );

  // Connect wallet and sign in
  const handleConnect = useCallback(async () => {
    if (!isConnected) {
      await connect({ connector: base });
    }

    try {
      const result = await sdk.actions.signIn({
        nonce: Math.random().toString(),
      });

      await signIn("neynar", {
        message: result.message,
        signature: result.signature,
        redirect: false,
      });
    } catch (error) {
      console.error("Error signing in:", error);
    }
  }, [connect, isConnected]);

  if (!isSDKLoaded) {
    return <div>Loading Todo-Cast...</div>;
  }

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-[300px] mx-auto py-2 px-2">
        <h1 className="text-2xl font-bold text-center mb-4">{title}</h1>

        {/* Auth Status */}
        {!session ? (
          <div className="mb-4">
            <Button onClick={handleConnect} className="w-full">
              Connect with Farcaster
            </Button>
          </div>
        ) : (
          <>
            {/* User Info */}
            <div className="mb-4 text-center">
              <p>Welcome, @{context?.user.username}</p>
              {address && (
                <p className="text-sm text-gray-500">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </p>
              )}
            </div>

            {/* Frame Status */}
            <div className="mb-4 text-center text-sm">
              {added ? "✅ Frame added" : "❌ Frame not added"}
              <br />
              {notificationDetails
                ? "🔔 Notifications enabled"
                : "🔕 Notifications disabled"}
            </div>

            {/* Todo Section */}
            <div className="space-y-4">
              {/* Todo items would go here */}
              <Button
                onClick={() => handleTodoComplete("example-id")}
                disabled={!address || isPending}
                className="w-full"
              >
                {isPending ? "Completing..." : "Complete Todo"}
              </Button>
            </div>

            {/* Sign Out */}
            <div className="mt-4">
              <Button
                onClick={() => signOut({ redirect: false })}
                className="w-full"
              >
                Sign Out
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
