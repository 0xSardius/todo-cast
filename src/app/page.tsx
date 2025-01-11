// app/page.tsx
import { getFrameMetadata } from "@coinbase/onchainkit/frame";
import App from "~/app/app";
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

const frameMetadata = getFrameMetadata({
  buttons: [{ label: "+ New Todo" }],
  image: `${baseUrl}/api/og`,
  postUrl: `${baseUrl}/api/frame`,
  input: { text: "Add a todo..." },
});

export const metadata = {
  title: "Todo-Cast",
  description: "Simple todo management in Farcaster",
  openGraph: {
    title: "Todo-Cast",
    description: "Simple todo management in Farcaster",
    images: [`${baseUrl}/api/og`],
  },
  other: {
    ...frameMetadata,
  },
};

export default function Home() {
  return (
    <div>
      <App />
    </div>
  );
}
