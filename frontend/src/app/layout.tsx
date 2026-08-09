import type { Metadata } from "next";
import "./globals.css";
import { CustomApolloProvider } from "@/lib/apollo";

export const metadata: Metadata = {
  title: "AI Agent Workflow Builder",
  description: "Chain AI agent steps in a mini n8n",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <CustomApolloProvider>
          {children}
        </CustomApolloProvider>
      </body>
    </html>
  );
}
